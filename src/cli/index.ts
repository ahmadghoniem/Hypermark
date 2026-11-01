/**
 * Hypermark CLI for Claude Code
 *
 * Supports four modes:
 *
 * 1. Annotate (`hypermark annotate <file.md | file.txt>`):
 *    - Triggered by /hypermark-annotate slash command
 *    - Opens any markdown file in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 2. Annotate Last (`hypermark annotate-last`, `hypermark last`):
 *    - Triggered by /hypermark-last slash command
 *    - Annotates the most recent assistant response in the annotation UI
 *    - Outputs structured feedback to stdout
 *
 * 3. Sessions (`hypermark sessions`):
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
  startAnnotateServer,
  handleAnnotateServerReady,
} from "@/server/annotate";
import {
  buildAmbiguousAnnotateArgsMessage,
  buildUnresolvedAnnotateArgsMessage,
  probeAnnotateToken,
  selectAnnotateTokenTarget,
} from "@/shared/annotate-target";
import { resolveAnnotateTarget } from "./annotate-resolution";
import { registerSession, unregisterSession, listSessions, killSession } from "@/server/sessions";
import { openBrowser } from "@/server/browser";
import { detectProjectName } from "@/server/project";
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
} from "./cli";
import { exitOnUnknownSubcommand } from "./unknown-subcommand";
import path from "path";
import { emitAnnotateOutcome } from "./annotate-output";

// Embed the built HTML at compile time
// @ts-ignore - Bun import attribute for text
import annotateHtml from "../../dist/annotate/index.html" with { type: "text" };
const annotateHtmlContent = annotateHtml as unknown as string;

// Check for subcommand
const args = process.argv.slice(2);

// Global flag: --browser <name>
const browserIdx = args.indexOf("--browser");
if (browserIdx !== -1 && args[browserIdx + 1]) {
  process.env.HYPERMARK_BROWSER = args[browserIdx + 1];
  args.splice(browserIdx, 2);
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
// otherwise `hypermark annotate --help` (commonly run by agents probing the
// CLI) falls through to annotate mode and launches the browser UI,
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
// disposition `nohup` depends on, so a plain `nohup hypermark last &`
// must end up with no listener and survive terminal close.
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));

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

} else if (args[0] === "annotate") {
  // ============================================
  // ANNOTATE MODE
  // ============================================

  function exitAnnotateStartupFailure(message: string): never {
    console.error(message);
    process.exit(1);
  }

  const rawFilePath = args[1];
  if (!rawFilePath) {
    exitAnnotateStartupFailure("Usage: hypermark annotate <file.md | file.txt>");
  }

  // Use HYPERMARK_CWD if set (original working directory before script cd'd)
  const projectRoot = process.env.HYPERMARK_CWD || process.cwd();

  // Tolerant argument handling: slash-command hosts forward raw user
  // words verbatim, so an invocation with several tokens probes each one
  // instead of blindly taking args[1]. Exactly one token naming an
  // existing target proceeds with it; several is an error naming every
  // candidate (never guess); two or more unresolvable words become a handoff
  // for the agent reading this output. Single-token invocations run the
  // unchanged pipeline and keep every legacy error (a lone typo'd path stays
  // "File not found" with exit 1), and unrecognized dash-prefixed tokens
  // disable tolerance entirely so a typo'd flag errors the way it always
  // did instead of being silently skipped.
  const targetTokens = args.slice(1);
  const tolerantMultiToken = targetTokens.length > 1;
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
      const message = buildUnresolvedAnnotateArgsMessage(selection.words);
      // A non-zero exit from Claude Code's bash-substitution
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

  const { markdown, absolutePath } = resolution;

  const annotateProject = (await detectProjectName()) ?? "_unknown";

  // Start the annotate server
  const server = await startAnnotateServer({
    markdown,
    filePath: absolutePath,
    mode: "annotate",
    project: annotateProject,
    htmlContent: annotateHtmlContent,
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

  const result = await server.waitForDecision();
  await Bun.sleep(1500);
  server.stop();
  emitAnnotateOutcome(result);
  process.exit(0);

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
    mode: "annotate-last",
    project: annotateProject,
    htmlContent: annotateHtmlContent,
    recentMessages: pickerMessages,
    selectedMessageId: annotatedMessage.messageId,
    draftId: messageLogPath,
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
  console.log(formatTopLevelHelp());
  process.exit(0);
}
