/**
 * Hypermark CLI for Claude Code
 *
 * Supports five modes:
 *
 * 1. Code Review (`hypermark review`, `hypermark review --git`):
 *    - Triggered by /review slash command
 *    - Runs git diff, opens review UI
 *    - Outputs feedback to stdout (captured by slash command)
 *
 * 2. Annotate (`hypermark annotate <file.md | file.txt>`):
 *    - Triggered by /hypermark-annotate slash command
 *    - Opens any markdown file in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 3. Annotate Last (`hypermark annotate-last`, `hypermark last`):
 *    - Triggered by /hypermark-last slash command
 *    - Annotates the most recent assistant response in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 4. Sessions (`hypermark sessions`):
 *    - Lists active Hypermark server sessions
 *    - `--open [N]` reopens a session in the browser
 *    - `--clean` removes stale session files
 *    - `--kill [N|all]` terminates a session's process (see sessions.ts)
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
  startReviewServer,
  handleReviewServerReady,
} from "@/server/review";
import {
  startAnnotateServer,
  handleAnnotateServerReady,
} from "@/server/annotate";
import { type DiffType, detectManagedVcs, prepareLocalReviewDiff } from "@/server/vcs";
import { loadConfig, resolveDefaultDiffType } from "@/shared/config";
import { parseReviewArgs } from "@/shared/review-args";
import {
  buildAmbiguousAnnotateArgsMessage,
  buildUnresolvedAnnotateArgsMessage,
  probeAnnotateToken,
  selectAnnotateTokenTarget,
} from "@/shared/annotate-target";
import { resolveAnnotateTarget } from "./annotate-resolution";
import {
  composeReviewApprovedMessage,
  getReviewDeniedSuffix,
} from "@/shared/prompts";
import { supportsReviewApprovalNotes } from "./review-output";
import { registerSession, unregisterSession, listSessions, killSession } from "@/server/sessions";
import { openBrowser } from "@/server/browser";
import { detectProjectName } from "@/server/project";
import { AGENT_CONFIG, type Origin } from "@/shared/agents";
import {
  getRecentRenderedMessages,
  describeClaudeSessionResolutionFailure,
  readSessionForResume,
  resolveClaudeSessionLog,
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
import {
  createAnnotateOutcomeEmitter,
  supportsAnnotateApprovalNotes,
} from "./annotate-output";

// Embed the built HTML at compile time
// @ts-ignore - Bun import attribute for text
import planHtml from "../../dist/annotate/index.html" with { type: "text" };
const planHtmlContent = planHtml as unknown as string;

// @ts-ignore - Bun import attribute for text
import reviewHtml from "../../dist/review/index.html" with { type: "text" };
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
// Retired HTML flags: HTML always converts to markdown now. Strip them so an
// old invocation is not read as a file token.
for (const retired of ["--render-html", "--markdown"]) {
  const idx = args.indexOf(retired);
  if (idx !== -1) args.splice(idx, 1);
}

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

if (isInteractiveNoArgInvocation(args, process.stdin.isTTY)) {
  console.log(formatInteractiveNoArgClarification());
  process.exit(0);
}

// Ensure session cleanup on exit
process.on("exit", () => unregisterSession());

// Route fatal signals through process.exit() so "exit" handlers run — by
// default a SIGINT/SIGTERM death skips them, leaving the session registered.
// `once` keeps a second Ctrl-C as a
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

  const killIdx = args.indexOf("--kill");
  if (killIdx !== -1) {
    const sessionsBeforeKill = listSessions();
    if (sessionsBeforeKill.length === 0) {
      console.error("No active Hypermark sessions.");
      process.exit(0);
    }

    const killArg = args[killIdx + 1];
    if (killArg === "all") {
      let count = 0;
      for (const session of sessionsBeforeKill) {
        if (killSession(session.pid)) count++;
      }
      console.error(`Killed ${count} of ${sessionsBeforeKill.length} active session(s).`);
      process.exit(0);
    }

    const n = killArg ? parseInt(killArg, 10) : 1;
    const session = sessionsBeforeKill[n - 1];
    if (!session) {
      console.error(`Session #${n} not found. ${sessionsBeforeKill.length} active session(s).`);
      process.exit(1);
    }
    const killed = killSession(session.pid);
    console.error(
      killed
        ? `Killed ${session.mode} session #${n} (pid ${session.pid}).`
        : `Session #${n} (pid ${session.pid}) was already gone. Removed its registry entry.`,
    );
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
  let initialDiffType: DiffType | undefined;

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
    console.error("Not in a Git repo.");
    process.exit(1);
  }

  const reviewProject = (await detectProjectName()) ?? "_unknown";

  // Start review server (even if empty - user can switch diff types in local mode)
  const server = await startReviewServer({
    rawPatch,
    gitRef,
    error: diffError,
    origin: detectedOrigin,
    project: reviewProject,
    diffType: gitContext ? (initialDiffType ?? "unstaged") : undefined,
    gitContext,
    initialFingerprint,
    // The approved branch below prints result.feedback after the prompt, so
    // this CLI's origins may see approve-carrying menu items.
    approvalNotesSupported: supportsReviewApprovalNotes(detectedOrigin),
    htmlContent: reviewHtmlContent,
    parentWatch: true,
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
    // A bare approval prints the approved prompt; an approval carrying reviewer notes prints
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

  const rawFilePath = args[1];
  if (!rawFilePath) {
    exitAnnotateStartupFailure("Usage: hypermark annotate <file.md | file.txt> [--gate] [--json] [--hook] [--require-approval] [--result-file <path>]");
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
  const annotateProbe = (token: string) => probeAnnotateToken(token, projectRoot);

  let resolution: Awaited<ReturnType<typeof resolveAnnotateTarget>> | null =
    tolerantMultiToken
      ? null
      : await resolveAnnotateTarget({
          rawFilePath,
          projectRoot,
        });

  if (tolerantMultiToken) {
    const selection = selectAnnotateTokenTarget(targetTokens, annotateProbe);
    if (selection.kind === "single") {
      resolution = await resolveAnnotateTarget({
        rawFilePath: selection.candidate.value,
        projectRoot,
      });
    } else if (selection.kind === "multiple") {
      exitAnnotateStartupFailure(buildAmbiguousAnnotateArgsMessage(selection.candidates));
    } else if (selection.kind === "none" && selection.words.length > 1) {
      // No flags are handed off: transport flags (--gate/--json/--hook)
      // describe this invocation's plumbing, and suggesting them would tell
      // an agent to start a blocking interactive gate from a plain re-run.
      const message = buildUnresolvedAnnotateArgsMessage({
        words: selection.words,
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
    });
  }

  if (!resolution.ok) {
    exitAnnotateStartupFailure(resolution.message);
  }

  const {
    markdown,
    absolutePath,
    annotateMode,
  } = resolution;

  const annotateProject = (await detectProjectName()) ?? "_unknown";

  // Start the annotate server (reuses plan editor HTML)
  const server = await startAnnotateServer({
    markdown,
    filePath: absolutePath,
    origin: detectedOrigin,
    mode: annotateMode,
    gate: gateFlag,
    approvalNotesSupported: supportsAnnotateApprovalNotes({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    project: annotateProject,
    htmlContent: planHtmlContent,
    parentWatch: true,
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
    label: `annotate-${path.basename(absolutePath)}`,
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

  const stdinIdx = args.indexOf("--stdin");
  const stdinFlag = stdinIdx !== -1;
  if (stdinFlag) args.splice(stdinIdx, 1);

  // Collect up to N recent assistant messages so the user can pick the right
  // one — defaults to the same selection as the legacy "last message"
  // behavior (index 0). Necessary because the newest transcript entry isn't
  // always the message the user intended to annotate (e.g., after /rewind).
  // The rail's reach back, across compactions, in messages it shows.
  const RECENT_MESSAGES_LIMIT = 20;
  let lastMessage: RenderedMessage | null = null;
  let recentMessages: RenderedMessage[] = [];
  // The log the message came from; the side chat resumes its session.
  let messageLogPath: string | null = null;

  if (stdinFlag) {
    const text = (await Bun.stdin.text()).trim();
    if (text) {
      lastMessage = { messageId: "stdin", text, lineNumbers: [] };
    }
  } else {
    // Claude Code path: the session's log, from CLAUDE_CODE_SESSION_ID.
    const resolution = resolveClaudeSessionLog();
    if (process.env.HYPERMARK_DEBUG) {
      console.error(`[DEBUG] Session log: ${resolution.status === "identified" ? resolution.logPath ?? "(none)" : "(no session id)"}`);
    }
    if (resolution.status === "identified" && resolution.logPath) {
      // Claude Code transcripts are trees: `/rewind` re-parents the next
      // message rather than truncating, so a file-order read returns
      // orphaned messages. Follow the id chain instead.
      const recent = getRecentRenderedMessages(resolution.logPath, RECENT_MESSAGES_LIMIT, {
        activeBranchOnly: true,
        limitCountsShown: true,
      });
      if (recent.length > 0) {
        recentMessages = recent;
        // Open the newest message the rail shows, so switching away from a
        // hidden one-liner doesn't drop it from the rail.
        lastMessage = recent.find((m) => !m.hidden) ?? recent[0];
        messageLogPath = resolution.logPath;
      }
    }
    if (!lastMessage) {
      const reason = describeClaudeSessionResolutionFailure(resolution);
      if (reason) console.error(reason);
    }
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
    ? recentMessages.map((m) => ({
      messageId: m.messageId,
      text: m.text,
      timestamp: m.timestamp,
      ...(m.compactedAfter ? { compactedAfter: true } : {}),
      ...(m.hidden ? { hidden: true } : {}),
    }))
    : undefined;

  const server = await startAnnotateServer({
    markdown: annotatedMessage.text,
    filePath: "last-message",
    origin: detectedOrigin,
    mode: "annotate-last",
    project: annotateProject,
    gate: gateFlag,
    approvalNotesSupported: supportsAnnotateApprovalNotes({
      gate: gateFlag,
      json: jsonFlag,
      hook: hookFlag,
    }),
    htmlContent: planHtmlContent,
    recentMessages: pickerMessages,
    sideChat: messageLogPath ? readSessionForResume(messageLogPath) ?? undefined : undefined,
    parentWatch: true,
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

} else {
  // No subcommand. A stale hook registration from an old plugin install pipes
  // JSON on stdin; exit silently so it stays harmless.
  if (!process.stdin.isTTY) {
    process.exit(0);
  }
  console.log(formatTopLevelHelp());
  process.exit(0);
}
