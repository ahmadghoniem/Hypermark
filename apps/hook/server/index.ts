/**
 * Hypermark CLI for Claude Code
 *
 * Supports nine modes:
 *
 * 1. Plan Review (default, no args):
 *    - Spawned by Claude hook entrypoints
 *    - Reads hook event from stdin, extracts plan content
 *    - Serves UI, returns approve/deny decision to stdout
 *
 * 2. Code Review (`hypermark review`, `hypermark review --git`, `hypermark review --gitbutler`):
 *    - Triggered by /review slash command
 *    - Runs git diff, opens review UI
 *    - Outputs feedback to stdout (captured by slash command)
 *
 * 3. Annotate (`hypermark annotate <file.md | file.txt>`):
 *    - Triggered by /hypermark-annotate slash command
 *    - Opens any markdown file in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 4. Annotate Last (`hypermark annotate-last`, `hypermark last`):
 *    - Triggered by /hypermark-last slash command
 *    - Annotates the most recent assistant response in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 5. Sessions (`hypermark sessions`):
 *    - Lists active Hypermark server sessions
 *    - `--open [N]` reopens a session in the browser
 *    - `--clean` removes stale session files
 *
 * 7. Goal Setup (`hypermark setup-goal interview|facts <bundle.json>`):
 *    - Opens the bundled question or facts acceptance UI
 *    - Outputs structured JSON for setup-goal workflows
 *
 * 8. Improve Context (`hypermark improve-context`):
 *    - Spawned by PreToolUse hook on EnterPlanMode
 *    - Reads improvement hook file from ~/.hypermark/hooks/
 *    - Returns additionalContext or silently passes through
 *
 * 9. Uninstall (`hypermark uninstall`):
 *    - Removes recognized installer-owned components across supported hosts
 *    - Preserves local data by default; `--purge` removes known local data
 *
 * Global flags:
 *   --help             - Show top-level usage information
 *   --version, -v      - Print version and exit
 *   --browser <name>   - Override which browser to open (e.g. "Google Chrome")
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port to use (default: random)
 */

import {
  startHypermarkServer,
  handleServerReady,
} from "@hypermark/server";
import {
  startReviewServer,
  handleReviewServerReady,
} from "@hypermark/server/review";
import {
  startAnnotateServer,
  handleAnnotateServerReady,
} from "@hypermark/server/annotate";
import {
  startGoalSetupServer,
  handleGoalSetupServerReady,
} from "@hypermark/server/goal-setup";
import { type DiffType, detectManagedVcs, prepareLocalReviewDiff } from "@hypermark/server/vcs";
import { loadConfig, resolveDefaultDiffType } from "@hypermark/shared/config";
import { parseReviewArgs } from "@hypermark/shared/review-args";
import {
  normalizeGoalSetupBundle,
  type GoalSetupStage,
} from "@hypermark/shared/goal-setup";
import {
  buildAmbiguousAnnotateArgsMessage,
  buildUnresolvedAnnotateArgsMessage,
  probeAnnotateToken,
  selectAnnotateTokenTarget,
} from "@hypermark/shared/annotate-target";
import { resolveAnnotateTarget } from "./annotate-resolution";
// Bridge sources for live app sessions: the CLI supplies them so
// @hypermark/server never imports @hypermark/ui (mirrors the existing
// htmlContent precedent).
import {
  ANNOTATION_HIGHLIGHT_CSS,
  BRIDGE_SCRIPT,
  LIVE_BRIDGE_BOOTSTRAP,
} from "@hypermark/ui/components/html-viewer/bridge-script";
import {
  composeReviewApprovedMessage,
  getReviewDeniedSuffix,
  getPlanDeniedPrompt,
  getPlanToolName,
} from "@hypermark/shared/prompts";
import { supportsReviewApprovalNotes } from "./review-output";
import { registerSession, unregisterSession, listSessions } from "@hypermark/server/sessions";
import { openBrowser } from "@hypermark/server/browser";
import { installAgentTerminalRuntime } from "@hypermark/server/agent-terminal-runtime";
import {
  createDefaultUninstallEnvironment,
  formatPurgeWarning,
  formatUninstallResult,
  runHypermarkUninstall,
} from "@hypermark/server/uninstall";
import { detectProjectName } from "@hypermark/server/project";
import { hostnameOrFallback } from "@hypermark/shared/project";
import { readImprovementHook } from "@hypermark/shared/improvement-hooks";
import { composeImproveContext } from "@hypermark/shared/pfm-reminder";
import { AGENT_CONFIG, type Origin } from "@hypermark/shared/agents";
import {
  findSessionLogsByAncestorWalk,
  findSessionLogsForCwd,
  getRecentRenderedMessages,
  resolveSessionLogByAncestorPids,
  resolveSessionLogByCwdScan,
  type RenderedMessage,
} from "./session-log";
import {
  formatInteractiveNoArgClarification,
  formatSubcommandHelp,
  formatTopLevelHelp,
  formatVersion,
  isInteractiveNoArgInvocation,
  isSubcommandHelpInvocation,
  isTopLevelHelpInvocation,
  isVersionInvocation,
  parseStrictAnnotateOptions,
  isUninstallConfirmationAccepted,
  parseUninstallOptions,
} from "./cli";
import { exitOnUnknownSubcommand } from "./unknown-subcommand";
import { completeAnnotateCommand } from "./annotate-command";
import {
  annotateStartupFailureExitCode,
  isStrictAnnotateInvocation,
  assertResultPathAvailable,
  resolveResultFilePath,
  STRICT_GATE_ERROR_EXIT_CODE,
} from "./strict-annotate-result";
import path from "path";
import { createInterface } from "node:readline/promises";
import { buildLocalWorkspaceReview, type WorkspaceDiffType } from "@hypermark/server/review-workspace";
import {
  createAnnotateOutcomeEmitter,
  supportsAnnotateApprovalNotes,
  supportsAnnotateClientLease,
} from "./annotate-output";

// Embed the built HTML at compile time
// @ts-ignore - Bun import attribute for text
import planHtml from "../dist/index.html" with { type: "text" };
const planHtmlContent = planHtml as unknown as string;

// @ts-ignore - Bun import attribute for text
import reviewHtml from "../dist/review.html" with { type: "text" };
const reviewHtmlContent = reviewHtml as unknown as string;

// Check for subcommand
const rawArgs = process.argv.slice(2);
let parsedStrictAnnotateOptions;
try {
  parsedStrictAnnotateOptions = parseStrictAnnotateOptions(
    rawArgs,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  // Usage error: the gate was misconfigured, not a reviewer decision.
  process.exit(STRICT_GATE_ERROR_EXIT_CODE);
}
const args = parsedStrictAnnotateOptions.remainingArgs;
const requireApprovalFlag =
  parsedStrictAnnotateOptions.requireApproval;
const resultFile = parsedStrictAnnotateOptions.resultFile
  ? resolveResultFilePath(
      parsedStrictAnnotateOptions.resultFile,
      process.env.HYPERMARK_CWD || process.cwd(),
    )
  : undefined;

// Global flag: --browser <name>
const browserIdx = args.indexOf("--browser");
if (browserIdx !== -1 && args[browserIdx + 1]) {
  process.env.HYPERMARK_BROWSER = args[browserIdx + 1];
  args.splice(browserIdx, 2);
}

// Global flag: --no-jina (disables Jina Reader for URL annotation)
const noJinaIdx = args.indexOf("--no-jina");
const cliNoJina = noJinaIdx !== -1;
if (cliNoJina) args.splice(noJinaIdx, 1);

// Annotate review-gate flags: --gate adds an Approve button, --json
// switches stdout to structured decision output, --hook emits hook-native
// JSON that works directly with Claude Code PostToolUse/Stop
// hook protocols.
const gateIdx = args.indexOf("--gate");
let gateFlag = gateIdx !== -1;
if (gateFlag) args.splice(gateIdx, 1);
const jsonIdx = args.indexOf("--json");
const jsonFlag = jsonIdx !== -1;
if (jsonFlag) args.splice(jsonIdx, 1);
const hookIdx = args.indexOf("--hook");
const hookFlag = hookIdx !== -1;
if (hookFlag) args.splice(hookIdx, 1);
if (hookFlag) gateFlag = true;
const renderHtmlIdx = args.indexOf("--render-html");
const renderHtmlFlag = renderHtmlIdx !== -1;
if (renderHtmlFlag) args.splice(renderHtmlIdx, 1);
const renderMarkdownIdx = args.indexOf("--markdown");
const renderMarkdownFlag = renderMarkdownIdx !== -1;
if (renderMarkdownFlag) args.splice(renderMarkdownIdx, 1);
// Live app annotation flags (annotate, loopback URLs): --app forces live
// mode, --static forces the classic conversion pipeline. Transport-shape
// flags: never echoed in the tolerant handoff's re-run flag list.
const appFlagIdx = args.indexOf("--app");
const appFlag = appFlagIdx !== -1;
if (appFlag) args.splice(appFlagIdx, 1);
const staticFlagIdx = args.indexOf("--static");
const staticFlag = staticFlagIdx !== -1;
if (staticFlag) args.splice(staticFlagIdx, 1);

// Stdout matrix for annotate / annotate-last.
//
// --hook (recommended for hooks):
//   Approve/Close → empty stdout (hook passes, agent proceeds).
//   Annotate → {"decision":"block","reason":"<feedback>"} (hook blocks).
//   Works with Claude Code hook protocols.
//
// --json (structured decisions for wrapper scripts):
//   Emits {"decision":"approved|dismissed|annotated","feedback":"..."}.
//
// Plaintext (default):
//   Close → empty. Approve → "The user approved." Annotate → feedback.
//
const emitAnnotateOutcome = createAnnotateOutcomeEmitter({
  hook: hookFlag,
  json: jsonFlag,
});

async function loadGoalSetupBundle(
  stage: GoalSetupStage,
  bundlePath: string
) {
  const raw =
    bundlePath === "-"
      ? await Bun.stdin.text()
      : await Bun.file(path.resolve(bundlePath)).text();
  return normalizeGoalSetupBundle(JSON.parse(raw), stage);
}

if (isVersionInvocation(args)) {
  console.log(formatVersion());
  process.exit(0);
}

if (isTopLevelHelpInvocation(args)) {
  console.log(formatTopLevelHelp());
  process.exit(0);
}

// Per-subcommand help must be handled before the subcommand branches below —
// otherwise `hypermark review --help` (commonly run by agents probing the
// CLI) falls through to local review mode and launches the browser UI,
// spawning a stray tab whose close injects a bogus "no feedback" signal.
const helpSubcommand = isSubcommandHelpInvocation(args);
if (helpSubcommand) {
  console.log(formatSubcommandHelp(helpSubcommand));
  process.exit(0);
}

exitOnUnknownSubcommand(args);

if (args[0] === "uninstall") {
  let options: ReturnType<typeof parseUninstallOptions>;
  try {
    options = parseUninstallOptions(rawArgs.slice(1));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Run 'hypermark uninstall --help' for usage.");
    process.exit(1);
  }

  const environment = createDefaultUninstallEnvironment();

  if (!options.dryRun && !options.yes) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      console.error(
        "Uninstall requires confirmation. Re-run with --yes in a non-interactive shell.",
      );
      process.exit(1);
    }

    if (options.purge) {
      console.error(formatPurgeWarning(environment.dataDir));
    } else {
      console.error(
        `Local Hypermark data in ${environment.dataDir} will be preserved.`,
      );
    }

    const prompt = options.purge
      ? "Type 'purge' to permanently uninstall and delete local data: "
      : "Remove Hypermark-installed components? [y/N] ";
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answer = "";
    try {
      answer = await readline.question(prompt);
    } finally {
      readline.close();
    }

    if (!isUninstallConfirmationAccepted(answer, options.purge)) {
      console.log("Uninstall cancelled.");
      process.exit(0);
    }
  } else if (options.purge && !options.dryRun) {
    console.error(formatPurgeWarning(environment.dataDir));
  }

  const result = await runHypermarkUninstall(
    {
      purge: options.purge,
      dryRun: options.dryRun,
    },
    environment,
  );
  const formatted = formatUninstallResult(result);
  if (formatted) console.log(formatted);

  if (options.dryRun) {
    console.log("Dry run complete; no changes were made.");
  } else if (options.purge && result.ok) {
    console.log(`Known local Hypermark data was purged from ${result.dataDir}.`);
  } else if (!options.purge) {
    console.log(`Local Hypermark data was preserved in ${result.dataDir}.`);
  }

  process.exit(result.ok ? 0 : 1);
}

if (args[0] === "install-runtime") {
  const runtime = args[1];
  if (runtime !== "agent-terminal") {
    console.error("Usage: hypermark install-runtime <agent-terminal>");
    process.exit(1);
  }
  const result = await installAgentTerminalRuntime();
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (isInteractiveNoArgInvocation(args, process.stdin.isTTY)) {
  console.log(formatInteractiveNoArgClarification());
  process.exit(0);
}

// Ensure session cleanup on exit
process.on("exit", () => unregisterSession());

// Route fatal signals through process.exit() so "exit" handlers run — by
// default a SIGINT/SIGTERM death skips them, leaking background-warmup
// children and stale `git worktree` registrations (the --local PR checkout
// cleanup below is registered on "exit"). `once` keeps a second Ctrl-C as a
// force-quit escape hatch if cleanup ever hangs. SIGHUP is deliberately NOT
// routed here: installing any SIGHUP listener overrides the ignored
// disposition `nohup` depends on, so a plain `nohup hypermark review &`
// must end up with no listener and survive terminal close.
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));

// Detect calling agent. This fork ships Claude Code only; HYPERMARK_ORIGIN is
// still honored (validated against AGENT_CONFIG) so an archived record can be
// replayed under its recorded origin.
const originOverride = process.env.HYPERMARK_ORIGIN as Origin | undefined;
const detectedOrigin: Origin =
  (originOverride && originOverride in AGENT_CONFIG) ? originOverride : "claude-code";

if (args[0] === "sessions") {
  // ============================================
  // SESSION DISCOVERY MODE
  // ============================================

  if (args.includes("--clean")) {
    // Force cleanup: list sessions (which auto-removes stale entries)
    const sessions = listSessions();
    console.error(`Cleaned up stale sessions. ${sessions.length} active session(s) remain.`);
    process.exit(0);
  }

  const sessions = listSessions();

  if (sessions.length === 0) {
    console.error("No active Hypermark sessions.");
    process.exit(0);
  }

  const openIdx = args.indexOf("--open");
  if (openIdx !== -1) {
    // Open a session in the browser
    const nArg = args[openIdx + 1];
    const n = nArg ? parseInt(nArg, 10) : 1;
    const session = sessions[n - 1];
    if (!session) {
      console.error(`Session #${n} not found. ${sessions.length} active session(s).`);
      process.exit(1);
    }
    await openBrowser(session.url);
    console.error(`Opened ${session.mode} session in browser: ${session.url}`);
    process.exit(0);
  }

  // List sessions as a table
  console.error("Active Hypermark sessions:\n");
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const age = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000);
    const ageStr = age < 60 ? `${age}m` : `${Math.floor(age / 60)}h ${age % 60}m`;
    console.error(`  #${i + 1}  ${s.mode.padEnd(9)} ${s.project.padEnd(20)} ${s.url.padEnd(28)} ${ageStr} ago`);
  }
  console.error(`\nReopen with: hypermark sessions --open [N]`);
  process.exit(0);

} else if (args[0] === "setup-goal") {
  // ============================================
  // GOAL SETUP MODE
  // ============================================

  const stage = args[1] as GoalSetupStage | undefined;
  const bundlePath = args[2];

  if ((stage !== "interview" && stage !== "facts") || !bundlePath) {
    console.error(
      "Usage: hypermark setup-goal <interview|facts> <bundle.json | -> [--json]"
    );
    process.exit(1);
  }

  let bundle: Awaited<ReturnType<typeof loadGoalSetupBundle>>;
  try {
    bundle = await loadGoalSetupBundle(stage, bundlePath);
  } catch (err) {
    console.error(
      `Failed to load goal setup bundle: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const goalProject = (await detectProjectName()) ?? "_unknown";

  const server = await startGoalSetupServer({
    bundle,
    origin: detectedOrigin,
    htmlContent: planHtmlContent,
    onReady: (url, port) => {
      handleGoalSetupServerReady(url, port);
    },
  });

  registerSession({
    pid: process.pid,
    port: server.port,
    url: server.url,
    mode: "goal-setup",
    project: goalProject,
    startedAt: new Date().toISOString(),
    label: `goal-setup-${bundle.stage}-${bundle.goalSlug || goalProject}`,
  });

  const result = await server.waitForDecision();
  await Bun.sleep(800);
  server.stop();

  if (result.exit) {
    console.log(JSON.stringify({ decision: "dismissed", stage: bundle.stage }));
  } else if (result.result) {
    const output = {
      decision: "submitted",
      stage: result.result.stage,
      result: result.result,
    };
    console.log(jsonFlag ? JSON.stringify(output) : JSON.stringify(output, null, 2));
  }
  process.exit(0);

} else if (args[0] === "review") {
  // ============================================
  // CODE REVIEW MODE
  // ============================================

  const reviewArgs = parseReviewArgs(args.slice(1));

  let rawPatch: string;
  let gitRef: string;
  let diffError: string | undefined;
  let initialFingerprint: string | undefined;
  let gitContext: Awaited<ReturnType<typeof prepareLocalReviewDiff>>["gitContext"] | undefined;
  let initialDiffType: DiffType | WorkspaceDiffType | undefined;
  let agentCwd: string | undefined;
  let workspace: Awaited<ReturnType<typeof buildLocalWorkspaceReview>> | undefined;

  const config = loadConfig();
  const managedVcs = await detectManagedVcs(process.cwd(), reviewArgs.vcsType);
  const forcedVcs = !!reviewArgs.vcsType && reviewArgs.vcsType !== "auto";

  if (managedVcs || forcedVcs) {
    const diffResult = await prepareLocalReviewDiff({
      vcsType: reviewArgs.vcsType,
      configuredDiffType: resolveDefaultDiffType(config),
      hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
    });
    gitContext = diffResult.gitContext;
    initialDiffType = diffResult.diffType;
    rawPatch = diffResult.rawPatch;
    gitRef = diffResult.gitRef;
    diffError = diffResult.error;
    initialFingerprint = diffResult.fingerprint;
  } else {
    workspace = await buildLocalWorkspaceReview(process.cwd(), {
      configuredDiffType: resolveDefaultDiffType(config),
      hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
    });
    if (workspace.repos.length === 0) {
      console.error("Not in a VCS repo and no nested Git/JJ/GitButler repositories were found.");
      process.exit(1);
    }
    rawPatch = workspace.rawPatch;
    gitRef = workspace.gitRef;
    diffError = workspace.error;
    initialDiffType = workspace.diffType;
    agentCwd = workspace.root;
  }

  const reviewProject = (await detectProjectName()) ?? "_unknown";

  // Start review server (even if empty - user can switch diff types in local mode)
  const server = await startReviewServer({
    rawPatch,
    gitRef,
    error: diffError,
    origin: detectedOrigin,
    project: reviewProject,
    diffType: workspace ? (initialDiffType ?? workspace.diffType) : gitContext ? (initialDiffType ?? "unstaged") : undefined,
    gitContext,
    initialFingerprint,
    workspace,
    agentCwd,
    // The approved branch below prints result.feedback after the prompt, so
    // this CLI's origins may see approve-carrying menu items (spec §6.4).
    approvalNotesSupported: supportsReviewApprovalNotes(detectedOrigin),
    htmlContent: reviewHtmlContent,
    onReady: async (url, port) => {
      handleReviewServerReady(url, port);
    },
  });

  registerSession({
    pid: process.pid,
    port: server.port,
    url: server.url,
    mode: "review",
    project: reviewProject,
    startedAt: new Date().toISOString(),
    label: `review-${reviewProject}`,
  });

  // Wait for user feedback
  const result = await server.waitForDecision();

  // Give browser time to receive response and update UI
  await Bun.sleep(1500);

  // Cleanup
  server.stop();

  // Output feedback (captured by slash command)
  if (result.exit) {
    console.log("Review session closed without feedback.");
  } else if (result.approved) {
    // PR5 delivery (spec §6.4): a bare approval prints the approved prompt,
    // byte-identical to before; an approval carrying reviewer notes prints
    // the approved-with-notes framing (non-blocking guidance) instead.
    console.log(composeReviewApprovedMessage(detectedOrigin, result.feedback));
  } else {
    console.log(result.feedback);
    // Append the verification-only suffix whenever the reviewer sent annotations to act on.
    if (result.annotations.length > 0) {
      console.log(getReviewDeniedSuffix(detectedOrigin));
    }
  }
  process.exit(0);

} else if (args[0] === "annotate") {
  // ============================================
  // ANNOTATE MODE
  // ============================================

  // Startup failures below fire after flag parsing, so under a strict flag they
  // must not exit 1 — that code means "the reviewer requested changes".
  function exitAnnotateStartupFailure(message: string): never {
    console.error(message);
    process.exit(
      annotateStartupFailureExitCode({
        requireApproval: requireApprovalFlag,
        resultFile,
      }),
    );
  }

  if (appFlag && staticFlag) {
    exitAnnotateStartupFailure("--app and --static are mutually exclusive");
  }

  const rawFilePath = args[1];
  if (!rawFilePath) {
    exitAnnotateStartupFailure("Usage: hypermark annotate <file.md | file.txt | file.html | https://... | folder/>  [--markdown] [--no-jina] [--app] [--static] [--gate] [--json] [--hook] [--require-approval] [--result-file <path>]");
  }

  // Use HYPERMARK_CWD if set (original working directory before script cd'd)
  const projectRoot = process.env.HYPERMARK_CWD || process.cwd();

  if (resultFile) {
    try {
      await assertResultPathAvailable(resultFile);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      // Startup validation error: the gate could not start.
      process.exit(STRICT_GATE_ERROR_EXIT_CODE);
    }
  }

  // Strict invocations keep the exact legacy contract: args[1] is the target,
  // a typo'd path stays a startup failure (exit 2), and stdout carries only
  // the decision record. The tolerant token fallback below never runs. Same
  // predicate as the exit-code path, so the two cannot drift.
  const strictAnnotate = isStrictAnnotateInvocation({
    requireApproval: requireApprovalFlag,
    resultFile,
  });

  // Tolerant argument handling (#1182): slash-command hosts forward raw user
  // words verbatim, so a non-strict invocation with several tokens probes
  // each one instead of blindly taking args[1]. Exactly one token naming an
  // existing target proceeds with it; several is an error naming every
  // candidate (never guess); two or more unresolvable words become a handoff
  // for the agent reading this output. Single-token invocations run the
  // unchanged pipeline and keep every legacy error (a lone typo'd path stays
  // "File not found" with exit 1), and unrecognized dash-prefixed tokens
  // disable tolerance entirely so a typo'd flag errors the way it always
  // did instead of being silently skipped.
  const targetTokens = args.slice(1);
  const tolerantMultiToken = !strictAnnotate && targetTokens.length > 1;
  // Bare directory names only count as targets when they are the sole
  // argument; in multi-token mode a stray word matching a directory (or `.`)
  // must not hijack the fast path.
  const annotateProbe = (token: string) =>
    probeAnnotateToken(token, projectRoot, { bareDirectories: false });

  let resolution: Awaited<ReturnType<typeof resolveAnnotateTarget>> | null =
    tolerantMultiToken
      ? null
      : await resolveAnnotateTarget({
          rawFilePath,
          projectRoot,
          noJina: cliNoJina,
          renderMarkdown: renderMarkdownFlag,
          forceApp: appFlag,
          forceStatic: staticFlag,
        });

  if (tolerantMultiToken) {
    const selection = selectAnnotateTokenTarget(targetTokens, annotateProbe);
    if (selection.kind === "single") {
      resolution = await resolveAnnotateTarget({
        rawFilePath: selection.candidate.value,
        projectRoot,
        noJina: cliNoJina,
        renderMarkdown: renderMarkdownFlag,
        forceApp: appFlag,
        forceStatic: staticFlag,
      });
    } else if (selection.kind === "multiple") {
      exitAnnotateStartupFailure(buildAmbiguousAnnotateArgsMessage(selection.candidates));
    } else if (selection.kind === "none" && selection.words.length > 1) {
      // Content flags only: transport flags (--gate/--json/--hook) describe
      // this invocation's plumbing, and suggesting them would tell an agent
      // to start a blocking interactive gate from a plain re-run.
      const handoffFlags = [
        ...(renderMarkdownFlag ? ["--markdown"] : []),
        ...(cliNoJina ? ["--no-jina"] : []),
        ...(renderHtmlFlag ? ["--render-html"] : []),
      ];
      const message = buildUnresolvedAnnotateArgsMessage({
        words: selection.words,
        flags: handoffFlags,
        agentHandoff: true,
      });
      if (jsonFlag || hookFlag) {
        // Machine-readable stdout stays reserved for decision records;
        // stderr is forwarded on failure.
        exitAnnotateStartupFailure(message);
      }
      // Plain mode: a non-zero exit from Claude Code's bash-substitution
      // skill prefix aborts the prompt before the model runs, so the handoff
      // must land on stdout with exit 0 to reach the agent at all.
      console.log(message);
      process.exit(0);
    }
    // "flagged" (unrecognized dash tokens) or a single unresolvable word:
    // fall through to the unchanged pipeline on args[1] so its legacy
    // failure surfaces verbatim.
  }

  if (resolution === null) {
    resolution = await resolveAnnotateTarget({
      rawFilePath,
      projectRoot,
      noJina: cliNoJina,
      renderMarkdown: renderMarkdownFlag,
      forceApp: appFlag,
      forceStatic: staticFlag,
    });
  }

  if (!resolution.ok) {
    exitAnnotateStartupFailure(resolution.message);
  }

  const {
    markdown,
    rawHtml,
    absolutePath,
    folderPath,
    annotateMode,
    sourceInfo,
    sourceConverted,
    isUrl,
    liveApp: liveAppResolved,
  } = resolution;

  const annotateProject = (await detectProjectName()) ?? "_unknown";

  // Start the annotate server (reuses plan editor HTML)
  const server = await startAnnotateServer({
    markdown,
    filePath: absolutePath,
    origin: detectedOrigin,
    mode: liveAppResolved ? "annotate-app" : annotateMode,
    liveApp: liveAppResolved
      ? {
          targetUrl: absolutePath,
          bridgeScript: BRIDGE_SCRIPT,
          bridgeBootstrap: LIVE_BRIDGE_BOOTSTRAP,
          annotationCss: ANNOTATION_HIGHLIGHT_CSS,
        }
      : undefined,
    folderPath,
    sourceInfo,
    sourceConverted,
    gate: gateFlag,
    approvalNotesSupported: supportsAnnotateApprovalNotes({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    clientLeaseSupported: supportsAnnotateClientLease({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    rawHtml,
    renderHtml: !!rawHtml,
    convertHtml: renderMarkdownFlag,
    agentCwd: projectRoot,
    project: annotateProject,
    htmlContent: planHtmlContent,
    onReady: async (url, port) => {
      handleAnnotateServerReady(url, port);
    },
  });

  registerSession({
    pid: process.pid,
    port: server.port,
    url: server.url,
    mode: "annotate",
    project: annotateProject,
    startedAt: new Date().toISOString(),
    label: folderPath
      ? `annotate-${path.basename(folderPath)}`
      : `annotate-${isUrl ? hostnameOrFallback(absolutePath) : path.basename(absolutePath)}`,
  });

  await completeAnnotateCommand({
    waitForDecision: server.waitForDecision,
    settleAfterDecision: () => Bun.sleep(1500),
    stopServer: server.stop,
    requireApproval: requireApprovalFlag,
    resultFile,
    emitLegacyOutcome: emitAnnotateOutcome,
  });

} else if (args[0] === "annotate-last" || args[0] === "last") {
  // ============================================
  // ANNOTATE LAST MESSAGE MODE
  // ============================================

  const projectRoot = process.env.HYPERMARK_CWD || process.cwd();
  const stdinIdx = args.indexOf("--stdin");
  const stdinFlag = stdinIdx !== -1;
  if (stdinFlag) args.splice(stdinIdx, 1);

  // Collect up to N recent assistant messages so the user can pick the right
  // one — defaults to the same selection as the legacy "last message"
  // behavior (index 0). Necessary because the newest transcript entry isn't
  // always the message the user intended to annotate (e.g., after /rewind).
  // 25 covers long conversations worth of rewinds without flooding the
  // picker; the list scrolls past this if more are shown.
  const RECENT_MESSAGES_LIMIT = 25;
  let lastMessage: RenderedMessage | null = null;
  let recentMessages: RenderedMessage[] = [];

  if (stdinFlag) {
    const text = (await Bun.stdin.text()).trim();
    if (text) {
      lastMessage = { messageId: "stdin", text, lineNumbers: [] };
    }
  } else {
    // Claude Code path: resolve session log
    //
    // Strategy (most precise → least precise):
    // 1. Ancestor-PID session metadata: walk up the process tree checking
    //    ~/.claude/sessions/<pid>.json at each hop. When invoked from a slash
    //    command's `!` bang, the direct parent is a bash subshell — Claude's
    //    session file is a few hops up. Deterministic when it matches.
    // 2. Cwd-scan of session metadata: read every ~/.claude/sessions/*.json,
    //    filter by cwd, pick the most recent startedAt. Better than mtime
    //    guessing because it uses session-level metadata.
    // 3. CWD slug match (mtime-based): legacy behavior — picks the most
    //    recently modified jsonl in the project dir. Fragile when multiple
    //    sessions exist for the same project.
    // 4. Ancestor directory walk: handles the case where the user `cd`'d
    //    deeper into a subdirectory after session start.

    if (process.env.HYPERMARK_DEBUG) {
      console.error(`[DEBUG] Project root: ${projectRoot}`);
      console.error(`[DEBUG] PPID: ${process.ppid}`);
    }

    /** Try each log path, return the first that yields a message. */
    function tryLogCandidates(label: string, getPaths: () => string[]): void {
      if (lastMessage) return;
      const paths = getPaths();
      if (process.env.HYPERMARK_DEBUG) {
        console.error(`[DEBUG] ${label}: ${paths.length ? paths.join(", ") : "(none)"}`);
      }
      for (const logPath of paths) {
        // Claude Code transcripts are trees: `/rewind` re-parents the next
        // message rather than truncating, so a file-order read returns
        // orphaned messages. Follow the id chain instead.
        const recent = getRecentRenderedMessages(logPath, RECENT_MESSAGES_LIMIT, {
          activeBranchOnly: true,
        });
        if (recent.length > 0) {
          recentMessages = recent;
          lastMessage = recent[0];
          return;
        }
      }
    }

    // 1. Walk ancestor PIDs for a matching session metadata file
    const ancestorLog = resolveSessionLogByAncestorPids();
    tryLogCandidates("Ancestor PID session metadata", () => ancestorLog ? [ancestorLog] : []);

    // 2. Scan all session metadata files for one whose cwd matches
    const cwdScanLog = resolveSessionLogByCwdScan({ cwd: projectRoot });
    tryLogCandidates("Cwd-scan session metadata", () => cwdScanLog ? [cwdScanLog] : []);

    // 3. Fall back to CWD slug match (mtime-based)
    tryLogCandidates("CWD slug match (mtime)", () => findSessionLogsForCwd(projectRoot));

    // 4. Fall back to ancestor directory walk
    tryLogCandidates("Directory ancestor walk", () => findSessionLogsByAncestorWalk(projectRoot));
  }

  if (!lastMessage) {
    console.error(stdinFlag
      ? "No message content received on stdin."
      : "No rendered assistant message found in session logs.");
    process.exit(1);
  }

  if (process.env.HYPERMARK_DEBUG) {
    console.error(`[DEBUG] Found message ${lastMessage.messageId} (${lastMessage.text.length} chars)`);
  }

  const annotatedMessage = lastMessage;
  const annotateProject = (await detectProjectName()) ?? "_unknown";

  // Only ship the picker list when there's a choice to make. The client uses
  // its presence (length > 1) as the signal to render the picker UI.
  const pickerMessages = recentMessages.length > 1
    ? recentMessages.map((m) => ({ messageId: m.messageId, text: m.text, timestamp: m.timestamp }))
    : undefined;

  const server = await startAnnotateServer({
    markdown: annotatedMessage.text,
    filePath: "last-message",
    origin: detectedOrigin,
    mode: "annotate-last",
    gate: gateFlag,
    approvalNotesSupported: supportsAnnotateApprovalNotes({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    clientLeaseSupported: supportsAnnotateClientLease({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    htmlContent: planHtmlContent,
    recentMessages: pickerMessages,
    onReady: async (url, port) => {
      handleAnnotateServerReady(url, port);
    },
  });

  registerSession({
    pid: process.pid,
    port: server.port,
    url: server.url,
    mode: "annotate",
    project: annotateProject,
    startedAt: new Date().toISOString(),
    label: `annotate-last`,
  });

  const result = await server.waitForDecision();

  await Bun.sleep(1500);

  server.stop();

  emitAnnotateOutcome(result);
  process.exit(0);

} else if (args[0] === "improve-context") {
  // ============================================
  // IMPROVEMENT HOOK CONTEXT INJECTION MODE
  // ============================================
  //
  // Called by PreToolUse hook on EnterPlanMode.
  // Composes any enabled context sources (compound improvement hook,
  // PFM reminder) into a single additionalContext payload.
  // Nothing enabled = exit 0 silently (passthrough).

  await Bun.stdin.text();

  const hook = readImprovementHook("enterplanmode-improve");
  const pfmEnabled = loadConfig().pfmReminder === true;

  const context = composeImproveContext({
    pfmEnabled,
    improvementHookContent: hook?.content ?? null,
  });

  if (context === null) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: context,
    },
  }));

  process.exit(0);

} else {
  // ============================================
  // PLAN REVIEW MODE (default)
  // ============================================

  // Read hook event from stdin
  const eventJson = await Bun.stdin.text();
  if (!eventJson.trim()) {
    process.exit(0);
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(eventJson);
  } catch (e: any) {
    console.error(`Failed to parse hook event from stdin: ${e?.message || e}`);
    process.exit(1);
  }

  const planContent = event.tool_input?.plan || "";
  const permissionMode = event.permission_mode || "default";

  if (!planContent) {
    console.error("No plan content in hook event");
    process.exit(1);
  }

  const planProject = (await detectProjectName()) ?? "_unknown";

  // Start the plan review server
  const server = await startHypermarkServer({
    plan: planContent,
    origin: detectedOrigin,
    permissionMode,
    htmlContent: planHtmlContent,
    onReady: async (url, port) => {
      handleServerReady(url, port);
    },
  });

  registerSession({
    pid: process.pid,
    port: server.port,
    url: server.url,
    mode: "plan",
    project: planProject,
    startedAt: new Date().toISOString(),
    label: `plan-${planProject}`,
  });

  // Wait for user decision (blocks until approve/deny)
  const result = await server.waitForDecision();

  // Give browser time to receive response and update UI
  await Bun.sleep(1500);

  // Cleanup
  server.stop();

  // Output decision for the Claude Code PermissionRequest hook.
  {
    if (result.approved) {
      const updatedPermissions = [];
      if (result.permissionMode) {
        updatedPermissions.push({
          type: "setMode",
          mode: result.permissionMode,
          destination: "session",
        });
      }

      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: {
              behavior: "allow",
              // Echo the original tool_input as updatedInput. Claude Code
              // >= 2.1.199 silently drops an allow decision for ExitPlanMode
              // (a tool requiring user interaction) when updatedInput is
              // absent, falling back to the built-in approval dialog.
              updatedInput: event.tool_input,
              ...(updatedPermissions.length > 0 && { updatedPermissions }),
            },
          },
        })
      );
    } else {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: {
              behavior: "deny",
              message: getPlanDeniedPrompt(detectedOrigin, undefined, {
                toolName: getPlanToolName(detectedOrigin),
                planFileRule: "",
                feedback: result.feedback || "Plan changes requested",
              }),
            },
          },
        })
      );
    }
  }

  process.exit(0);
}
