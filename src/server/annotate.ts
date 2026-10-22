/**
 * Annotate Server
 *
 * Provides a server for annotating a local file (or the last agent
 * message). Serves annotation-session content via /api/plan so the plan
 * editor UI can render it.
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port or inclusive range (default: random)
 */

import { getServerHostname, startBunServerOnAvailablePort, buildAdvertisedUrl } from "./server-port";
import { rejectNonLoopbackHost } from "./host-guard";
import { getRepoInfo } from "./repo";
import type { Origin } from "@/shared/agents";
import { handleImage, handleUpload, removeUnsentUploads, handleDraftSave, handleDraftLoad, handleDraftDelete, handleApiNotFound, handleFavicon, readDraftGenerationFromBody, readDraftGenerationFromUrl } from "./shared-handlers";
import { handleDoc } from "./reference-handlers";
import { getExtraMarkdownExtensions, resolveUserPath } from "@/shared/resolve-file";
import { contentHash, deleteDraft } from "@/shared/draft";
import { getPlanVersion, listVersions } from "@/shared/storage";
import { computeAnnotateHistory, persistAnnotateSubmission, type AnnotateHistoryResult } from "@/shared/annotate-history";
import { getAnnotateReferenceRootPaths } from "@/shared/annotate-reference-roots-node";
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
import { saveConfig, getServerConfig, loadConfig, resolveAnnotateHistory, resolveFeedbackHistory } from "./config";
import { appendFeedbackRecord, type FeedbackDecision, type FeedbackSurface } from "@/shared/feedback-archive";
import { isFaviconStyle, type FaviconStyle } from "@/shared/favicon";
import { dirname, resolve as resolvePath } from "path";

// Re-export utilities
export { openBrowser } from "./browser";
export { handleServerReady as handleAnnotateServerReady } from "./shared-handlers";

// --- Types ---

export interface AnnotateServerOptions {
  /** Markdown content of the file to annotate. */
  markdown: string;
  /** Original file path (for display purposes) */
  filePath: string;
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** Origin identifier for UI customization */
  origin?: Origin;
  /** UI mode: "annotate" for files, "annotate-last" for last agent message */
  mode?: "annotate" | "annotate-last";
  /**
   * Recent assistant messages for `annotate-last` mode (newest-first). When
   * provided with more than one entry, the editor renders a picker so users
   * can choose which message to annotate; index 0 is the default selection
   * and matches the legacy "last message" behavior.
   */
  recentMessages?: { messageId: string; text: string; timestamp?: string; compactedAfter?: boolean; hidden?: boolean }[];
  /** The Claude Code session side questions resume; without it they answer 501. */
  sideChat?: SideChatSession;
  /** Enable review-gate UX: adds an Approve button alongside Close/Send Annotations */
  gate?: boolean;
  /** Whether this transport can deliver feedback attached to an approval. */
  approvalNotesSupported?: boolean;
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
  /** Project name for keying per-file version history (powers the annotate version diff). */
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
    approved?: boolean;
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
 * - API routes (/api/plan with mode:"annotate", /api/feedback)
 * - Port conflict retries
 */
export async function startAnnotateServer(
  options: AnnotateServerOptions
): Promise<AnnotateServerResult> {
  const {
    markdown,
    filePath,
    htmlContent,
    origin,
    mode = "annotate",
    recentMessages,
    sideChat,
    gate = false,
    approvalNotesSupported = false,
    clientLeaseTestOverrides,
    parentWatch: parentWatchOption,
    project,
    onReady,
  } = options;

  const sessionUploads = new Set<string>();

  // Per-file version history → powers the native version diff in annotate mode.
  // Unlike the plan flow (slug = first-heading + date), annotate keys history by
  // file path so re-opening the same file groups its versions across edits even
  // when headings change. Diff content is the markdown. Only single local files
  // (not URLs/folders/messages).
  const annotateProjectName = project ?? "_unknown";
  const annotateHistoryEnabled = resolveAnnotateHistory(loadConfig());
  // Single local file sessions are the only ones this eager gate covers.
  // URL and agent-message sessions never write session content to
  // the data dir. The durable submit records stay single-local-file only.
  const singleFileLocalAnnotate = mode === "annotate" && !/^https?:\/\//i.test(filePath);
  let annotateHistory: AnnotateHistoryResult | null = null;
  {
    const eligible =
      singleFileLocalAnnotate &&
      markdown.length > 0 &&
      annotateHistoryEnabled;
    // History is an enhancement, never a gate: a read-only/full data dir
    // must degrade to v0.22.0's stateless annotate (no version diff), not
    // fail the whole session before the UI ever opens. (computeAnnotateHistory
    // never throws — it logs and returns null on any storage error.)
    if (eligible) {
      annotateHistory = computeAnnotateHistory(annotateProjectName, resolvePath(filePath), markdown);
    }
  }

  // Draft identity. Content-derived: the target has a document body in
  // every remaining mode (single local file or a last agent message).
  const draftKey = contentHash(markdown);

  // Durable submit records (#678): the caller consuming waitForDecision() may
  // be gone (agent-side timeout) by the time the reviewer clicks submit —
  // settling the promise then deleting the draft would leave the submitted
  // feedback existing nowhere. persistAnnotateSubmission writes the record to
  // {DATA_DIR}/history/{project}/{slug}/submissions/{timestamp}.md (next to
  // the file's annotate version history) BEFORE the draft delete.
  //
  // annotateHistory opt-out policy: HYPERMARK_ANNOTATE_HISTORY=0 means "do
  // not write annotated content to the data dir", and submitted feedback
  // quotes that content, so the record is skipped and the legacy submit
  // behavior (draft deleted) is preserved unchanged. A missing/timed-out
  // consumer is not detectable in-process (the server cannot know its caller
  // stopped reading), so there is no narrower condition to key off.
  //
  // Scope: identical to the version-history gate above — single local files
  // only. annotate-last / URL / folder sessions never wrote submit
  // records and still do not: their submissions quote agent messages or
  // fetched pages, which this record was never meant to persist. (Folder
  // sessions do write lazy per-file version history via /api/doc; that is
  // a separate, documented pipeline with its own gate.)
  //
  // Returns whether the draft delete may proceed: true when the record was
  // written, when there was no user content to lose, or when the session
  // does not persist; false only when a durable write was expected and
  // failed — the draft then stays behind as the recovery copy.
  // --- Durable feedback archive --------------------------------------------
  //
  // Unlike the legacy #678 record above, the archive covers EVERY annotate
  // session type (single file, agent message): it stores what the reviewer
  // submitted, not a copy of the annotated document. That is a deliberate,
  // release-noted behavior change — with defaults, annotate-last submissions
  // now leave a durable record for the first time.
  //
  // Both gates apply. HYPERMARK_ANNOTATE_HISTORY=0 still means "no annotate
  // content in the data dir at all", and submitted feedback quotes that
  // content, so it suppresses archive records for every annotate surface and
  // the documented fully-stateless annotate session stays verbatim true.
  const annotateFeedbackSurface: FeedbackSurface =
    mode === "annotate-last"
      ? "annotate-last"
      : singleFileLocalAnnotate
        ? "annotate"
        : "annotate-url";

  const archiveAnnotateDecision = (
    feedbackText: string,
    annotationList: unknown[],
    decision: FeedbackDecision,
  ): boolean => {
    if (!resolveFeedbackHistory(loadConfig())) return true;
    if (!annotateHistoryEnabled) return true;
    const isUrlTarget = /^https?:\/\//i.test(filePath);
    return (
      appendFeedbackRecord({
        project: annotateProjectName,
        origin,
        surface: annotateFeedbackSurface,
        decision,
        target:
          isUrlTarget
            ? { url: filePath }
            : mode === "annotate-last"
              ? { filePath }
              : { filePath: resolvePath(filePath) },
        feedback: feedbackText,
        annotations: annotationList,
      }) !== null
    );
  };

  const persistSubmittedDecision = (
    feedback: unknown,
    annotations: unknown,
    approved: boolean,
  ): boolean => {
    // Defensive: /api/feedback does not type-validate its body (unlike
    // /api/approve), and a malformed value must degrade to the legacy
    // behavior (settle + delete draft + 200), never throw into a 500.
    const feedbackText = typeof feedback === "string" ? feedback : "";
    const annotationList = Array.isArray(annotations) ? annotations : [];
    const hasContent = feedbackText.trim().length > 0 || annotationList.length > 0;
    const archived = archiveAnnotateDecision(
      feedbackText,
      annotationList,
      approved ? (hasContent ? "approved-with-notes" : "approved") : "feedback",
    );
    // Legacy #678 record: unchanged scope (single local files with content).
    let legacyDurable = true;
    if (hasContent && annotateHistoryEnabled && singleFileLocalAnnotate) {
      legacyDurable =
        persistAnnotateSubmission({
          project: annotateProjectName,
          sessionPath: resolvePath(filePath),
          feedback: feedbackText,
          annotations: annotationList,
          approved,
        }) !== null;
    }
    // A failed write only holds the draft back when there was content to lose.
    return legacyDurable && (archived || !hasContent);
  };
  const initialSingleFileSourcePath = !/^https?:\/\//i.test(filePath) ? resolveUserPath(filePath) : null;

  const getReferenceRootPaths = () => getAnnotateReferenceRootPaths({
    mode,
    filePath,
    initialSingleFileSourcePath,
  });

  // Detect repo info (cached for this session)
  const repoInfo = await getRepoInfo();

  // Decision promise
  let resolveDecision: (result: {
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
    approved?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }) => void;
  const decisionPromise = new Promise<{
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
    approved?: boolean;
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

          // API: Get plan content (reuse /api/plan so the plan editor UI works)
          if (url.pathname === "/api/plan" && req.method === "GET") {
            return Response.json({
              plan: markdown,
              origin,
              mode,
              filePath,
              gate,
              approvalNotesSupported,
              clientLease: { enabled: true as const, reconnectGraceMs: clientLeaseGraceMs },
              ...(annotateHistory
                ? {
                    previousPlan: annotateHistory.previousPlan,
                    versionInfo: annotateHistory.versionInfo,
                    diffCurrent: annotateHistory.diffCurrent,
                  }
                : {}),
              repoInfo,
              projectRoot: process.cwd(),
              // Extra extensions the user registered as markdown (#1307).
              // The renderer needs them to linkify relative/wiki links to
              // sibling docs the same way it linkifies .md ones.
              markdownExtensions: getExtraMarkdownExtensions(),
              serverConfig: getServerConfig(),
              ...(recentMessages ? { recentMessages } : {}),
            });
          }

          // API: fetch a specific version of the annotated file (version diff base picker)
          if (url.pathname === "/api/plan/version" && req.method === "GET") {
            if (!annotateHistory) {
              return Response.json({ error: "No version history" }, { status: 404 });
            }
            const slug = annotateHistory.slug;
            const vParam = url.searchParams.get("v");
            const v = vParam ? parseInt(vParam, 10) : NaN;
            if (isNaN(v) || v < 1) {
              return new Response("Invalid version number", { status: 400 });
            }
            const content = getPlanVersion(annotateProjectName, slug, v);
            if (content === null) {
              return Response.json({ error: "Version not found" }, { status: 404 });
            }
            return Response.json({ plan: content, version: v });
          }

          // API: list all stored versions of the annotated file (Version Browser)
          if (url.pathname === "/api/plan/versions" && req.method === "GET") {
            if (!annotateHistory) {
              return Response.json({ project: annotateProjectName, slug: null, versions: [] });
            }
            return Response.json({
              project: annotateProjectName,
              slug: annotateHistory.slug,
              versions: listVersions(annotateProjectName, annotateHistory.slug),
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

          // API: Serve a linked markdown document. The annotate session owns the
          // source-file base, so enforce it here.
          if (url.pathname === "/api/doc" && req.method === "GET") {
            const docUrl = new URL(req.url);
            let changed = false;
            if (!docUrl.searchParams.has("base") && !/^https?:\/\//i.test(filePath)) {
              docUrl.searchParams.set("base", dirname(filePath));
              changed = true;
            }
            const docReq = changed ? new Request(docUrl.toString()) : req;
            return handleDoc(docReq, {
              rootPaths: getReferenceRootPaths(),
            });
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
          // Only local direct structured annotate gates (--gate --json) advertise
          // and serve this; other transports get a 404 (idleTimeout is already 0
          // for the whole server above, so no per-connection opt-out is needed).
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

          // API: Approve the annotation session (review-gate UX)
          if (url.pathname === "/api/approve" && req.method === "POST") {
            const rawBody = await req.text();
            let body: Record<string, unknown> = {};
            if (rawBody.trim()) {
              try {
                const parsed = JSON.parse(rawBody);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  throw new Error("Expected a JSON object.");
                }
                body = parsed as Record<string, unknown>;
              } catch (err) {
                return Response.json(
                  { error: err instanceof Error ? err.message : "Invalid JSON body." },
                  { status: 400 },
                );
              }
            }
            if (
              (body.feedback !== undefined && typeof body.feedback !== "string") ||
              (body.annotations !== undefined && !Array.isArray(body.annotations)) ||
              (body.codeAnnotations !== undefined && !Array.isArray(body.codeAnnotations)) ||
              (body.draftGeneration !== undefined && typeof body.draftGeneration !== "number")
            ) {
              return Response.json({ error: "Invalid approval body." }, { status: 400 });
            }

            const approvalWon = decision.settle({
              feedback: (body.feedback as string | undefined) || "",
              annotations: (body.annotations as unknown[] | undefined) || [],
              approved: true,
              // Approval notes carry the same message scoping as /api/feedback —
              // without it, approve-with-notes in a multi-message annotate-last
              // session anchors to the last message instead of the one the
              // reviewer picked.
              selectedMessageId:
                typeof body.selectedMessageId === "string" ? body.selectedMessageId : undefined,
              feedbackScope:
                body.feedbackScope === "messages"
                  ? "messages"
                  : body.feedbackScope === "message"
                    ? "message"
                    : undefined,
            });
            if (!approvalWon) return alreadyDecided();
            // Approve-with-notes carries user content — make it durable before
            // the draft (the reviewer's only other copy) is deleted (#678).
            const approvalDurable = persistSubmittedDecision(
              (body.feedback as string | undefined) || "",
              (body.annotations as unknown[] | undefined) || [],
              true,
            );
            if (approvalDurable) deleteDraft(draftKey, readDraftGenerationFromBody(body));
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
              // record is then the only surviving copy (#678).
              const feedbackDurable = persistSubmittedDecision(
                body.feedback || "",
                body.annotations || [],
                false,
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
