/**
 * Hypermark Shared Server
 *
 * Provides a consistent server implementation for both Claude Code and OpenCode plugins.
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port or inclusive range (default: random)
 *   HYPERMARK_ORIGIN - Explicit origin override; validated against AGENT_CONFIG
 *                        in packages/shared/agents.ts. This fork ships Claude
 *                        Code only, so the sole supported value is "claude-code".
 */

import type { Origin } from "@hypermark/shared/agents";
import { resolve } from "path";
import { existsSync, unlinkSync } from "fs";
import { getServerHostname, startBunServerOnAvailablePort, buildAdvertisedUrl } from "./server-port";
import {
  generateSlug,
  saveToHistory,
  getPlanVersion,
  getPlanVersionPath,
  getVersionCount,
  listVersions,
} from "./storage";
import { getRepoInfo } from "./repo";
import { detectProjectName } from "./project";
import { loadConfig, saveConfig, detectGitUser, getServerConfig, resolveFeedbackHistory } from "./config";
import { appendFeedbackRecord, type FeedbackDecision } from "@hypermark/shared/feedback-archive";
import { isFaviconStyle, type FaviconStyle } from "@hypermark/shared/favicon";
import { readImprovementHook, getImprovementHookExpectedPath } from "@hypermark/shared/improvement-hooks";
import { composeImproveContext } from "@hypermark/shared/pfm-reminder";
import { handleImage, handleUpload, handleServerReady, handleDraftSave, handleDraftLoad, handleDraftDelete, handleApiNotFound, handleFavicon, handleReferenceSkills, handleReferenceSkillContent, readDraftGenerationFromBody } from "./shared-handlers";
import { contentHash, deleteDraft } from "./draft";
import { handleDoc, handleDocExists } from "./reference-handlers";
import { closeAllFileBrowserWatchers, handleFileBrowserFilesStream } from "./reference-watch";
import { warmFileListCache } from "@hypermark/shared/resolve-file";
import { createExternalAnnotationHandler } from "./external-annotations";
import { SESSION_STREAM_PATH } from "@hypermark/shared/session-stream";
import { createSessionStreamBroadcaster } from "./session-stream";
import { startParentWatch, type ParentWatcher } from "./parent-watch";

// Re-export utilities
export { openBrowser } from "./browser";
export * from "./storage";
export { handleServerReady } from "./shared-handlers";
export { type VaultNode, buildFileTree } from "@hypermark/shared/reference-common";
export { createDefaultGetParentPid } from "./parent-watch";

// --- Types ---

export interface ServerOptions {
  /** The plan markdown content */
  plan: string;
  /** Origin identifier (this fork: always "claude-code") */
  origin: Origin;
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** Current permission mode to preserve (Claude Code only) */
  permissionMode?: string;
  /** Called when server starts with the URL, remote status, and port */
  onReady?: (url: string, port: number) => void | Promise<void>;
  /** OpenCode client for querying available agents (OpenCode only) */
  /**
   * Enable the stale-session reaper (see ./parent-watch.ts). Off by default
   * — see the identical option on AnnotateServerOptions in ./annotate.ts
   * for the full rationale (dozens of tests start this server directly and
   * must not get a background poller they never asked for). Pass `true`
   * in production or an overrides object in tests.
   */
  parentWatch?:
    | boolean
    | {
        parentPid?: number;
        pollIntervalMs?: number;
        graceMs?: number;
        isAlive?: (pid: number) => boolean;
      };
}

export interface ServerResult {
  /** The port the server is running on */
  port: number;
  /** The full URL to access the server */
  url: string;
  /** Wait for user decision (approve/deny) */
  waitForDecision: () => Promise<{
    approved: boolean;
    feedback?: string;
    permissionMode?: string;
  }>;
  /** Stop the server and close active browser connections. */
  stop: () => Promise<void>;
}

// --- Server Implementation ---

/**
 * Start the Hypermark server
 *
 * Handles:
 * - Remote detection and port configuration
 * - All API routes (/api/plan, /api/approve, /api/deny, etc.)
 * - Port conflict retries
 */
export async function startHypermarkServer(
  options: ServerOptions
): Promise<ServerResult> {
  const { plan, origin, htmlContent, permissionMode, onReady } = options;

  const gitUser = detectGitUser();

  // --- Plan review setup ---
  const draftKey = contentHash(plan);
  const externalAnnotations = createExternalAnnotationHandler("plan");
  // Session-ended stream: announces on /api/session/stream when the parent
  // watcher below detects the Claude Code process that owns this plan is
  // gone (see ./parent-watch.ts).
  const sessionStream = createSessionStreamBroadcaster();
  const slug = generateSlug(plan);

  // Plan-specific: repo info, version history, decision promise
  let repoInfo: Awaited<ReturnType<typeof getRepoInfo>> | null = null;
  let project = "";
  let currentPlanPath = "";
  let previousPlan: string | null = null;
  let versionInfo = { version: 0, totalVersions: 0, project: "" };
  const sessionUploads = new Set<string>();

  let resolveDecision: (result: {
    approved: boolean;
    feedback?: string;
    permissionMode?: string;
  }) => void;
  let decisionPromise: Promise<{
    approved: boolean;
    feedback?: string;
    permissionMode?: string;
  }>;

  {
    repoInfo = await getRepoInfo();
    project = (await detectProjectName()) ?? "_unknown";
    const historyResult = saveToHistory(project, slug, plan);
    currentPlanPath = historyResult.path;
    previousPlan =
      historyResult.version > 1
        ? getPlanVersion(project, slug, historyResult.version - 1)
        : null;
    versionInfo = {
      version: historyResult.version,
      totalVersions: getVersionCount(project, slug),
      project,
    };

    decisionPromise = new Promise((resolve) => {
      resolveDecision = resolve;
    });
  }

  // Durable feedback archive: append the decision (and any notes the reviewer
  // attached) to feedback/{project}/index.jsonl at settlement time.
  //
  // This is the only record of a decision. It appends, so every decision on a
  // plan survives in order — approve → deny → approve are three records, not
  // one overwritten file.
  //
  // The plan TEXT is not copied into the archive. The record names the exact
  // `history/{project}/{slug}/NNN.md` version this decision was made on, which
  // storage.ts already wrote before the UI opened, so an analyzer joins the
  // record to the plan content already on disk.
  //
  // Plan policy on failure (design §3.4): log and proceed. A plan approval is
  // never blocked on the archive, and the plan draft delete is unchanged.
  //
  // Data-dir asymmetry worth knowing: getPlanVersionPath resolves against the
  // data directory storage.ts captured at import time, while the archive
  // resolves it per call. They agree in every real run (the env var is fixed
  // before the process starts); they can disagree only if HYPERMARK_DATA_DIR
  // is changed mid-process, in which case planVersionFile names the original
  // location. That is the honest answer anyway — it is where the version file
  // actually was written — so this is documented rather than "fixed".
  const archivePlanDecision = (decision: FeedbackDecision, feedback?: string): void => {
    if (!resolveFeedbackHistory(loadConfig())) return;
    appendFeedbackRecord({
      project,
      origin,
      surface: "plan",
      decision,
      target: {
        slug,
        ...(versionInfo.version > 0
          ? {
              planVersion: versionInfo.version,
              planVersionFile: getPlanVersionPath(project, slug, versionInfo.version) ?? undefined,
            }
          : {}),
      },
      feedback,
    });
  };

  const server = await startBunServerOnAvailablePort((port) =>
    Bun.serve({
        hostname: getServerHostname(),
        port,
        // Bun's default 10s idleTimeout kills long-parked requests (e.g. the
        // external-annotation and file-browser SSE streams, which can stall
        // between events).
        idleTimeout: 0,

        async fetch(req, server) {
          const url = new URL(req.url);

          // API: Get a specific plan version from history
          if (url.pathname === "/api/plan/version") {
            const vParam = url.searchParams.get("v");
            if (!vParam) {
              return new Response("Missing v parameter", { status: 400 });
            }
            const v = parseInt(vParam, 10);
            if (isNaN(v) || v < 1) {
              return new Response("Invalid version number", { status: 400 });
            }
            const content = getPlanVersion(project, slug, v);
            if (content === null) {
              return Response.json({ error: "Version not found" }, { status: 404 });
            }
            return Response.json({ plan: content, version: v });
          }

          // API: List all versions for the current plan
          if (url.pathname === "/api/plan/versions") {
            return Response.json({
              project,
              slug,
              versions: listVersions(project, slug),
            });
          }

          // API: Get plan content
          if (url.pathname === "/api/plan") {
            return Response.json({ plan, origin, permissionMode, repoInfo, previousPlan, versionInfo, projectRoot: process.cwd(), serverConfig: getServerConfig(gitUser) });
          }

          // API: Serve a linked markdown document
          if (url.pathname === "/api/doc" && req.method === "GET") {
            return handleDoc(req);
          }

          // API: Batch existence check for code-file paths the renderer detected
          if (url.pathname === "/api/doc/exists" && req.method === "POST") {
            return handleDocExists(req);
          }

          // API: Hook status for the Settings Hooks tab
          if (url.pathname === "/api/hooks/status" && req.method === "GET") {
            const config = loadConfig();
            const hook = readImprovementHook("enterplanmode-improve");
            const pfmEnabled = config.pfmReminder === true;
            const composed = composeImproveContext({
              pfmEnabled,
              improvementHookContent: hook?.content ?? null,
            });
            return Response.json({
              pfmReminder: { enabled: pfmEnabled },
              improvementHook: {
                present: !!hook,
                filePath: hook?.filePath ?? getImprovementHookExpectedPath("enterplanmode-improve"),
                fileSize: hook?.content?.length ?? null,
                content: hook?.content ?? null,
              },
              composedLength: composed?.length ?? null,
            });
          }

          // API: Update user config (write-back to ~/.hypermark/config.json)
          if (url.pathname === "/api/config" && req.method === "POST") {
            try {
              const body = (await req.json()) as { displayName?: string; diffOptions?: Record<string, unknown>; theme?: Record<string, unknown>; favicon?: FaviconStyle; pfmReminder?: boolean };
              const toSave: Record<string, unknown> = {};
              if (body.displayName !== undefined) toSave.displayName = body.displayName;
              if (body.diffOptions !== undefined) toSave.diffOptions = body.diffOptions;
              if (body.theme !== undefined) toSave.theme = body.theme;
              if (isFaviconStyle(body.favicon)) toSave.favicon = body.favicon;
              if (body.pfmReminder !== undefined) toSave.pfmReminder = body.pfmReminder;
              if (Object.keys(toSave).length > 0) saveConfig(toSave as Parameters<typeof saveConfig>[0]);
              return Response.json({ ok: true });
            } catch {
              return Response.json({ error: "Invalid request" }, { status: 400 });
            }
          }

          // API: Serve images (local paths or temp uploads)
          if (url.pathname === "/api/image") {
            return handleImage(req);
          }

          // API: Upload image -> save to temp -> return path
          if (url.pathname === "/api/upload" && req.method === "POST") {
            return handleUpload(req, sessionUploads);
          }

          // API: Global skill catalog for comment skill references
          if (url.pathname === "/api/skills" && req.method === "GET") {
            return handleReferenceSkills();
          }

          // API: SKILL.md contents for a referenced human-only skill
          if (url.pathname === "/api/skills/content" && req.method === "GET") {
            return handleReferenceSkillContent(req);
          }

          // API: Watch file browser roots and refresh the tree/status snapshot on changes
          if (url.pathname === "/api/reference/files/stream" && req.method === "GET") {
            return handleFileBrowserFilesStream(req, {
              disableIdleTimeout: () => server.timeout(req, 0),
            });
          }

          // API: Annotation draft persistence
          if (url.pathname === "/api/draft") {
            if (req.method === "POST") return handleDraftSave(req, draftKey);
            if (req.method === "DELETE") return handleDraftDelete(draftKey, req);
            return handleDraftLoad(draftKey);
          }

          // API: Editor annotations (VS Code extension)

          // API: Session-ended SSE — see packages/shared/session-stream.ts and
          // ./parent-watch.ts.
          if (url.pathname === SESSION_STREAM_PATH && req.method === "GET") {
            return sessionStream.handleRequest();
          }

          // API: External annotations (SSE-based, for any external tool)
          const externalResponse = await externalAnnotations?.handle(req, url, {
            disableIdleTimeout: () => server.timeout(req, 0),
          });
          if (externalResponse) return externalResponse;

          // API: Approve plan
          if (url.pathname === "/api/approve" && req.method === "POST") {
            // Check for note integrations and optional feedback
            let feedback: string | undefined;
            let requestedPermissionMode: string | undefined;
            let draftGeneration: number | undefined;
            try {
              const body = (await req.json().catch(() => ({}))) as {
                feedback?: string;
                permissionMode?: string;
                draftGeneration?: number;
              };
              draftGeneration = readDraftGenerationFromBody(body);

              // Capture feedback if provided (for "approve with notes")
              if (body.feedback) {
                feedback = body.feedback;
              }

              // Capture agent switch setting for OpenCode

              // Capture permission mode from client request (Claude Code)
              if (body.permissionMode) {
                requestedPermissionMode = body.permissionMode;
              }
            } catch {
              // Ignore body parse errors
            }

            // Archive the submission BEFORE the draft (the reviewer's other
            // copy) is deleted — the #678 ordering, generalized.
            archivePlanDecision(
              typeof feedback === "string" && feedback.trim() ? "approved-with-notes" : "approved",
              feedback,
            );

            // Clean up draft on successful submit
            deleteDraft(draftKey, draftGeneration);

            // Never echo `plan` back as a mode: ExitPlanMode fires while still in plan mode,
            // so echoing it would leave the session unable to act on the approved plan.
            resolveDecision({ approved: true, feedback, permissionMode: requestedPermissionMode });
            return Response.json({ ok: true });
          }

          // API: Deny with feedback
          if (url.pathname === "/api/deny" && req.method === "POST") {
            let feedback = "Plan rejected by user";
            let draftGeneration: number | undefined;
            try {
              const body = (await req.json()) as {
                feedback?: string;
                draftGeneration?: number;
              };
              draftGeneration = readDraftGenerationFromBody(body);
              feedback = body.feedback || feedback;
            } catch {
              // Use default feedback
            }

            archivePlanDecision("denied", feedback);

            deleteDraft(draftKey, draftGeneration);
            resolveDecision({ approved: false, feedback });
            return Response.json({ ok: true });
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
  let stopPromise: Promise<void> | undefined;
  let parentWatch: ParentWatcher | null = null;
  const stop = () => {
    stopPromise ??= (async () => {
      try {
        closeAllFileBrowserWatchers();
        sessionStream.closeSessions();
        parentWatch?.stop();
        for (const uploadPath of sessionUploads) {
          try {
            if (existsSync(uploadPath)) unlinkSync(uploadPath);
          } catch {}
        }
      } finally {
        await server.stop(true);
      }
    })();
    return stopPromise;
  };

  // Stale-session reaper: when the Claude Code process that spawned this
  // server is gone, announce on the session stream immediately, then settle
  // the pending decision as denied (a closed plan session is a deny the
  // hook protocol needs answered) and exit after the grace period.
  if (options.parentWatch) {
    const cfg = options.parentWatch === true ? {} : options.parentWatch;
    parentWatch = startParentWatch({
      parentPid: cfg.parentPid,
      pollIntervalMs: cfg.pollIntervalMs,
      graceMs: cfg.graceMs,
      isAlive: cfg.isAlive,
      onParentGone: () => sessionStream.announceSessionEnded(),
      onGone: () => {
        resolveDecision({ approved: false, feedback: "Session closed" });
        void stop();
      },
    });
  }

  // The cache warm must never gate the listening socket. Its async filesystem
  // walk yields between directories while requests remain serviceable.
  void warmFileListCache(process.cwd(), "code");

  // Notify caller that server is ready
  if (onReady) {
    try {
      await onReady(serverUrl, port);
    } catch (error) {
      await stop();
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
