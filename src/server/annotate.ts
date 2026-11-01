/**
 * Annotate Server
 *
 * Provides a server for annotating a local file (or the last agent
 * message). Serves annotation-session content via /api/document for the
 * annotate UI to render.
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port or inclusive range (default: random)
 */

import { getServerHostname, startBunServerOnAvailablePort, buildAdvertisedUrl } from "./server-port";
import { rejectNonLoopbackHost } from "./host-guard";
import { getRepoInfo } from "./repo";
import { handleImage, handleUpload, removeUnsentUploads, handleDraftSave, handleDraftLoad, handleDraftDelete, handleApiNotFound, handleFavicon, readDraftGenerationFromBody, readDraftGenerationFromUrl } from "./shared-handlers";
import { contentHash, deleteDraft } from "@/shared/draft";
import {
  ANNOTATE_CLIENT_LEASE_GRACE_MS,
  ANNOTATE_CLIENT_LEASE_HEARTBEAT_MS,
  ANNOTATE_CLIENT_LEASE_STREAM_PATH,
  createAnnotateClientLeaseStreamSession,
  createAnnotateClientLeaseTracker,
  type AnnotateClientLeaseStreamSession,
} from "@/shared/annotate-client-lease";
import { createAnnotateDecisionSettler } from "@/shared/annotate-decision";
import { SESSION_STREAM_PATH } from "@/shared/session-stream";
import { createSessionStreamBroadcaster } from "./session-stream";
import { handleSideChat, type SideChatSession } from "./side-chat";
import { startParentWatch, type ParentWatcher } from "./parent-watch";
import { saveConfig, getServerConfig, loadConfig, resolveFeedbackHistory } from "@/shared/config";
import { appendFeedbackRecord, type FeedbackDecision, type FeedbackSurface } from "@/shared/feedback-archive";
import { isFaviconStyle, type FaviconStyle } from "@/shared/favicon";
import { resolve as resolvePath } from "path";

// Re-export utilities
export { handleServerReady as handleAnnotateServerReady } from "./shared-handlers";

// --- Types ---

export interface AnnotateServerOptions {
  /** Markdown content of the file to annotate. */
  markdown: string;
  /** Original file path (for display purposes) */
  filePath: string;
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** UI mode: "annotate" for files, "annotate-last" for last agent message */
  mode?: "annotate" | "annotate-last";
  /**
   * Recent assistant messages for `annotate-last` mode (newest-first). When
   * provided with more than one entry, the editor renders a picker so users
   * can choose which message to annotate; index 0 is the default selection
   * and matches the legacy "last message" behavior.
   */
  recentMessages?: { messageId: string; text: string; timestamp?: string; compactedAfter?: boolean; hidden?: boolean }[];
  /** The `recentMessages` entry whose text is `markdown`, selected on load. */
  selectedMessageId?: string;
  /** What the draft is keyed on (hashed); defaults to `markdown`. */
  draftId?: string;
  /** The Claude Code session side questions resume; without it they answer 501. */
  sideChat?: SideChatSession;
  /**
   * @internal Test-only timing overrides for the client-lease grace/heartbeat
   * period. Production always uses the real 30s/5s defaults; tests inject
   * short values so they don't have to sleep for the real grace period.
   */
  clientLeaseTestOverrides?: { graceMs?: number; heartbeatMs?: number };
  /**
   * Enable the stale-session reaper (see ./parent-watch.ts): polls the
   * Claude Code process (or an injected `parentPid`) and settles the
   * pending decision as dismissed once it's gone. Off by default — pass
   * `true` (production; resolves its own parent PID and uses the real 5s
   * poll / 10s grace defaults) or an overrides object (tests: a fixed
   * `parentPid` and fake `isAlive` so they never depend on real OS process
   * state, and short timings so they don't sleep for the real grace
   * period). Defaulting to off means the dozens of tests that start this
   * server directly never get a background poller or OS process-table
   * spawn they never asked for; the CLI (src/cli/index.ts) is the
   * one caller that turns this on for every real session.
   */
  parentWatch?:
    | boolean
    | {
        parentPid?: number;
        pollIntervalMs?: number;
        graceMs?: number;
        isAlive?: (pid: number) => boolean;
      };
  /** Project name for keying the feedback archive. */
  project?: string;
  /** Called when server starts with the URL and port */
  onReady?: (url: string, port: number) => void | Promise<void>;
}

export interface AnnotateServerResult {
  /** The port the server is running on */
  port: number;
  /** The full URL to access the server */
  url: string;
  /** Wait for user feedback submission */
  waitForDecision: () => Promise<{
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }>;
  /** Stop the server */
  stop: () => void;
}

// --- Server Implementation ---

/**
 * Run shutdown disposal steps with per-step isolation, then close the
 * listener. One throwing step must never skip the steps after it — before this guard, a
 * throw mid-sequence orphaned the live proxy's listener and its upstream
 * WebSockets. Failures are reported through `log` (stderr by default) with
 * the step's name; `closeListener` runs unconditionally, even against a
 * pathological throw outside the steps.
 */
export function runGuardedShutdown(
  steps: ReadonlyArray<readonly [name: string, dispose: () => void]>,
  closeListener: () => void,
  log: (message: string, error: unknown) => void = (message, error) =>
    console.error(message, error),
): void {
  try {
    for (const [name, dispose] of steps) {
      try {
        dispose();
      } catch (error) {
        log(`[hypermark] annotate shutdown: ${name} disposal failed:`, error);
      }
    }
  } finally {
    closeListener();
  }
}

/**
 * Start the Annotate server
 *
 * Handles:
 * - Remote detection and port configuration
 * - API routes (/api/document with mode:"annotate", /api/feedback)
 * - Port conflict retries
 */
export async function startAnnotateServer(
  options: AnnotateServerOptions
): Promise<AnnotateServerResult> {
  const {
    markdown,
    filePath,
    htmlContent,
    mode = "annotate",
    recentMessages,
    selectedMessageId,
    draftId,
    sideChat,
    clientLeaseTestOverrides,
    parentWatch: parentWatchOption,
    project,
    onReady,
  } = options;

  const sessionUploads = new Set<string>();

  const annotateProjectName = project ?? "_unknown";
  // Draft identity: the file's content, or the session log for annotate-last,
  // so a new message in the same session still finds the draft.
  const draftKey = contentHash(draftId ?? markdown);

  // --- Durable feedback archive --------------------------------------------
  //
  // The caller consuming waitForDecision() may be gone (agent-side timeout) by
  // the time the reviewer sends, so every submission is archived under
  // feedback/ BEFORE the draft is deleted; otherwise the feedback would exist
  // nowhere. The archive stores what the reviewer submitted, not a copy of
  // the annotated document. HYPERMARK_FEEDBACK_HISTORY=0 turns it off.
  const annotateFeedbackSurface: FeedbackSurface = mode === "annotate-last" ? "annotate-last" : "annotate";

  const archiveAnnotateDecision = (
    feedbackText: string,
    annotationList: unknown[],
    decision: FeedbackDecision,
  ): boolean => {
    if (!resolveFeedbackHistory(loadConfig())) return true;
    return (
      appendFeedbackRecord({
        project: annotateProjectName,
        surface: annotateFeedbackSurface,
        decision,
        target: mode === "annotate-last" ? { filePath } : { filePath: resolvePath(filePath) },
        feedback: feedbackText,
        annotations: annotationList,
      }) !== null
    );
  };

  // Returns whether the draft delete may proceed: true when the record was
  // written or there was no user content to lose; false when the write
  // failed, so the draft stays behind as the recovery copy.
  const persistSubmittedDecision = (
    feedback: unknown,
    annotations: unknown,
  ): boolean => {
    // Defensive: /api/feedback does not type-validate its body, and a
    // malformed value must degrade to settle + delete draft + 200, never
    // throw into a 500.
    const feedbackText = typeof feedback === "string" ? feedback : "";
    const annotationList = Array.isArray(annotations) ? annotations : [];
    const hasContent = feedbackText.trim().length > 0 || annotationList.length > 0;
    return archiveAnnotateDecision(feedbackText, annotationList, "feedback") || !hasContent;
  };
  // Detect repo info (cached for this session)
  const repoInfo = await getRepoInfo();

  // Decision promise
  let resolveDecision: (result: {
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }) => void;
  const decisionPromise = new Promise<{
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }>((resolve) => {
    resolveDecision = (result) => {
      sentFeedback = result.feedback + JSON.stringify(result.annotations);
      resolve(result);
    };
  });
  // What was submitted, so the uploads it attaches outlive the server.
  let sentFeedback = "";

  // Every decision producer goes through this: connected tabs and the client
  // lease below race, and a producer that loses must not delete the reviewer's
  // draft or report success for an outcome the caller never received.
  const decision = createAnnotateDecisionSettler(resolveDecision!);
  const alreadyDecided = () =>
    Response.json({ error: "This review session has already been decided." }, { status: 409 });

  // Last-client abandonment lease: once the tab's client-lease stream
  // disconnects (as reported by the transport) and stays disconnected for the
  // grace period with no reconnect, the decision resolves as dismissed
  // instead of hanging the CLI/hook caller forever. Only meaningful once at
  // least one client connects. Grace timing is bounded only for clean
  // disconnects; abrupt/half-open connection loss is detected on a
  // best-effort basis by the transport (e.g. a failing heartbeat write) and
  // can take longer than graceMs to be noticed at all — see
  // src/shared/annotate-client-lease.ts.
  const clientLeaseGraceMs = clientLeaseTestOverrides?.graceMs ?? ANNOTATE_CLIENT_LEASE_GRACE_MS;
  const clientLeaseHeartbeatMs = clientLeaseTestOverrides?.heartbeatMs ?? ANNOTATE_CLIENT_LEASE_HEARTBEAT_MS;
  const clientLease = createAnnotateClientLeaseTracker(
    () => decision.settle({ feedback: "", annotations: [], exit: true }),
    { graceMs: clientLeaseGraceMs },
  );

  // Session-ended stream: announces on /api/session/stream (distinct from
  // the client-lease stream above, which detects the *tab* going away) when
  // the parent watcher below detects the *Claude Code process* is gone.
  const sessionStream = createSessionStreamBroadcaster();

  const server = await startBunServerOnAvailablePort((port) =>
    Bun.serve({
        hostname: getServerHostname(),
        port,
        // Bun's default 10s idleTimeout kills long-parked requests (e.g.
        // SSE streams, which can stall between events).
        idleTimeout: 0,

        async fetch(req, server) {
          const foreignHost = rejectNonLoopbackHost(req);
          if (foreignHost) return foreignHost;
          const url = new URL(req.url);

          // API: the session's document and its metadata
          if (url.pathname === "/api/document" && req.method === "GET") {
            return Response.json({
              markdown,
              mode,
              filePath,
              clientLease: { enabled: true as const, reconnectGraceMs: clientLeaseGraceMs },
              repoInfo,
              projectRoot: process.cwd(),
              serverConfig: getServerConfig(),
              ...(recentMessages ? { recentMessages } : {}),
              ...(selectedMessageId ? { selectedMessageId } : {}),
            });
          }

          // API: Update user config (write-back to ~/.hypermark/config.json)
          if (url.pathname === "/api/config" && req.method === "POST") {
            try {
              const body = (await req.json()) as { theme?: Record<string, unknown>; favicon?: FaviconStyle };
              const toSave: Record<string, unknown> = {};
              if (body.theme !== undefined) toSave.theme = body.theme;
              if (isFaviconStyle(body.favicon)) toSave.favicon = body.favicon;
              if (Object.keys(toSave).length > 0) saveConfig(toSave as Parameters<typeof saveConfig>[0]);
              return Response.json({ ok: true });
            } catch {
              return Response.json({ error: "Invalid request" }, { status: 400 });
            }
          }

          // API: Side chat (/sidechat)
          if (url.pathname === "/api/side-chat" && req.method === "POST") {
            return handleSideChat(req, sideChat);
          }

          // API: Serve images (local paths or temp uploads)
          if (url.pathname === "/api/image") {
            return handleImage(req);
          }

          // API: Upload image -> save to temp -> return path
          if (url.pathname === "/api/upload" && req.method === "POST") {
            return handleUpload(req, sessionUploads);
          }

          // API: Annotation draft persistence
          if (url.pathname === "/api/draft") {
            if (req.method === "POST") return handleDraftSave(req, draftKey);
            if (req.method === "DELETE") return handleDraftDelete(draftKey, req);
            return handleDraftLoad(draftKey);
          }

          // API: Client-lease SSE — see src/shared/annotate-client-lease.ts.
          // (idleTimeout is already 0 for the whole server above, so no
          // per-connection opt-out is needed.)
          if (url.pathname === ANNOTATE_CLIENT_LEASE_STREAM_PATH && req.method === "GET") {
            const encoder = new TextEncoder();
            let session: AnnotateClientLeaseStreamSession | null = null;

            const stream = new ReadableStream({
              start(controller) {
                session = createAnnotateClientLeaseStreamSession({
                  tracker: clientLease,
                  heartbeatMs: clientLeaseHeartbeatMs,
                  write: (chunk) => controller.enqueue(encoder.encode(chunk)),
                  endStream: () => controller.close(),
                });
              },
              cancel() {
                session?.close();
              },
            });

            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          }

          // API: Session-ended SSE — see src/shared/session-stream.ts and
          // ./parent-watch.ts. Server→client only: announces when the Claude
          // Code process that owns this session has exited.
          if (url.pathname === SESSION_STREAM_PATH && req.method === "GET") {
            return sessionStream.handleRequest();
          }

          // API: Exit annotation session without feedback
          if (url.pathname === "/api/exit" && req.method === "POST") {
            if (!decision.settle({ feedback: "", annotations: [], exit: true })) {
              return alreadyDecided();
            }
            // Decision-only line — a dismissal has no content, so a failed
            // write must not change the legacy draft behavior.
            archiveAnnotateDecision("", [], "dismissed");
            deleteDraft(draftKey, readDraftGenerationFromUrl(req));
            clientLease.cancel();
            return Response.json({ ok: true });
          }

          // API: Submit annotation feedback
          if (url.pathname === "/api/feedback" && req.method === "POST") {
            try {
              const body = (await req.json()) as {
                feedback: string;
                annotations: unknown[];
                selectedMessageId?: string;
                feedbackScope?: "message" | "messages";
                draftGeneration?: number;
              };

              const feedbackWon = decision.settle({
                feedback: body.feedback || "",
                annotations: body.annotations || [],
                selectedMessageId: body.selectedMessageId,
                feedbackScope: body.feedbackScope,
              });
              if (!feedbackWon) return alreadyDecided();
              // Make the submitted feedback durable BEFORE deleting the draft:
              // the decision promise's consumer may have timed out, and this
              // record is then the only surviving copy.
              const feedbackDurable = persistSubmittedDecision(
                body.feedback || "",
                body.annotations || [],
              );
              if (feedbackDurable) deleteDraft(draftKey, readDraftGenerationFromBody(body));
              clientLease.cancel();

              return Response.json({ ok: true });
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Failed to process feedback";
              return Response.json({ error: message }, { status: 500 });
            }
          }

          // Favicon
          if (url.pathname === "/favicon.png") return handleFavicon();

          // API 404 guard: unknown /api/* routes should return JSON, not HTML
          if (url.pathname.startsWith("/api/")) {
            return handleApiNotFound(url.pathname);
          }

          // Serve embedded HTML for all other routes (SPA)
          return new Response(htmlContent, {
            headers: { "Content-Type": "text/html" },
          });
        },

        error(err) {
          console.error("[hypermark] Server error:", err);
          return new Response(
            `Internal Server Error: ${err instanceof Error ? err.message : String(err)}`,
            { status: 500, headers: { "Content-Type": "text/plain" } },
          );
        },
    }),
  );

  const port = server.port!;
  const serverUrl = buildAdvertisedUrl(port);

  let parentWatch: ParentWatcher | null = null;

  const stop = () => {
    // Every disposal step is guarded individually (runGuardedShutdown):
    // one throwing step would skip everything after it. A failed
    // step is reported and the rest still run; the listener itself closes
    // regardless.
    runGuardedShutdown(
      [
        ["client lease", () => {
          clientLease.cancel();
          clientLease.closeSessions();
        }],
        ["session stream", () => sessionStream.closeSessions()],
        ["parent watch", () => parentWatch?.stop()],
        ["session uploads", () => removeUnsentUploads(sessionUploads, sentFeedback)],
      ],
      () => server.stop(),
    );
  };

  // Stale-session reaper: when the Claude Code process that spawned this
  // server is gone, announce on the session stream immediately, then settle
  // the pending decision as dismissed and exit after the grace period (see
  // ./parent-watch.ts). Keeps a hook whose Claude Code window was closed
  // from waiting on waitForDecision() forever.
  if (parentWatchOption) {
    const cfg = parentWatchOption === true ? {} : parentWatchOption;
    parentWatch = startParentWatch({
      parentPid: cfg.parentPid,
      pollIntervalMs: cfg.pollIntervalMs,
      graceMs: cfg.graceMs,
      isAlive: cfg.isAlive,
      onParentGone: () => sessionStream.announceSessionEnded(),
      onGone: () => {
        decision.settle({ feedback: "", annotations: [], exit: true });
        stop();
      },
    });
  }

  // Notify caller that server is ready. An async ready handler that rejects
  // must stop the server and propagate: firing-and-forgetting it would leave
  // an unhandled rejection while the server keeps listening and the session
  // hangs forever.
  if (onReady) {
    try {
      await onReady(serverUrl, port);
    } catch (error) {
      stop();
      throw error;
    }
  }

  return {
    port,
    url: serverUrl,
    waitForDecision: () => decisionPromise,
    stop,
  };
}
