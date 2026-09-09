/**
 * Open-in-App launcher (Bun runtime).
 *
 * "Open this file in <app>" helper (Windows), modeled on
 * `packages/server/browser.ts` (openBrowser) and `packages/server/ide.ts`
 * (openEditorDiff). Uses argv arrays, never shell string interpolation, to
 * avoid command injection.
 *
 * Launches are a side concern of the review session, never part of it: each
 * launcher is spawned detached (its own process group) and the request only
 * waits a short grace for instant failures. See runArgv.
 *
 * The app catalog is the single source of truth at
 * `@hypermark/shared/open-in-apps`. `kind` drives launch semantics:
 *   - file-manager (reveal)  -> reveal the file in Explorer
 *   - editor                 -> open the file itself
 *   - terminal               -> open the file's parent directory
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  OPEN_IN_APPS,
  getOpenInApp,
  type OpenInApp,
  type OpenInKind,
} from "@hypermark/shared/open-in-apps";
import { resolveOpenInTarget } from "@hypermark/shared/html-assets-node";

export type OpenInLaunchResult = { ok: true } | { ok: false; error: string };

/**
 * How long a launch may take to fail before we call it launched (ms). Instant
 * failures (missing binary, "Unable to find application") land well inside
 * this window; anything still running after it is a successful launch that we
 * stop waiting on.
 */
const LAUNCH_GRACE_MS = 2000;

/** Cap on captured stderr; the stream keeps draining beyond it. */
const LAUNCH_STDERR_CAP_BYTES = 8192;

/**
 * Run an argv command without a shell. Resolves to a launch result, surfacing
 * ENOENT (app/binary not found) as a friendly error.
 *
 * The child is spawned DETACHED (its own process group) so an editor
 * cold-started by a launcher CLI can never be taken down by a signal aimed at
 * this server's group (agent runtimes cancelling the session, terminal close).
 * The wait is BOUNDED: a launcher CLI that stays attached to the app it
 * started must not hold the HTTP request (and the UI button) hostage until
 * the app quits. stderr is drained from spawn time so a chatty child can
 * never fill the pipe and deadlock inside the grace window.
 */
function runArgv(
  cmd: string,
  args: string[],
  friendlyName: string,
  opts?: { cwd?: string },
): Promise<OpenInLaunchResult> {
  return new Promise((resolve) => {
    const failure = (msg: string): OpenInLaunchResult =>
      /ENOENT|not found/i.test(msg)
        ? { ok: false, error: `${friendlyName} not found` }
        : { ok: false, error: msg };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, {
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        ...(opts?.cwd && { cwd: opts.cwd }),
      });
    } catch (err) {
      resolve(failure(err instanceof Error ? err.message : String(err)));
      return;
    }

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < LAUNCH_STDERR_CAP_BYTES) stderr += chunk.toString();
    });

    let settled = false;
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null =
      null;
    const finish = (result: OpenInLaunchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };

    // Same failure shape as before: friendly not-found, else exit + stderr.
    const concludeExit = () => {
      if (!exitInfo) return;
      if (/not found|ENOENT/i.test(stderr)) {
        finish({ ok: false, error: `${friendlyName} not found` });
        return;
      }
      const status = exitInfo.code ?? exitInfo.signal ?? "unknown";
      finish({
        ok: false,
        error: `Failed to open ${friendlyName} (exit ${status})${stderr ? `: ${stderr.trim()}` : ""}`,
      });
    };

    // Still running at the deadline: it launched. A failure observed just
    // before the deadline still reports as a failure.
    const deadline = setTimeout(() => {
      if (exitInfo) concludeExit();
      else finish({ ok: true });
    }, LAUNCH_GRACE_MS);

    child.once("error", (err) => {
      finish(failure(err instanceof Error ? err.message : String(err)));
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      exitInfo = { code, signal };
      // Give the stderr pipe a beat to flush before reporting; "close" (all
      // stdio ended) concludes immediately when it arrives first. close alone
      // is not enough: a grandchild inheriting the pipe can hold it open.
      setTimeout(concludeExit, 50);
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      exitInfo = { code, signal };
      concludeExit();
    });

    // The launcher runs on its own; never keep this process alive for it.
    child.unref();
  });
}

/**
 * Spawn a launcher we can't meaningfully await — e.g. Windows `explorer`, which
 * exits non-zero even on success. Returns ok unless the spawn itself throws.
 */
function spawnDetached(
  cmd: string,
  args: string[],
  friendlyName: string,
): Promise<OpenInLaunchResult> {
  try {
    Bun.spawn([cmd, ...args], { stdout: "ignore", stderr: "ignore" });
    return Promise.resolve({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|not found/i.test(msg)) {
      return Promise.resolve({ ok: false, error: `${friendlyName} not found` });
    }
    return Promise.resolve({ ok: false, error: msg });
  }
}

/**
 * Launch the system-default handler for a path.
 */
function openSystemDefault(target: string): Promise<OpenInLaunchResult> {
  // `start` is a cmd builtin; the empty-string title arg avoids the quoted
  // target being treated as a window title.
  return runArgv("cmd", ["/c", "start", "", path.basename(target)], "default app", {
    cwd: path.dirname(target),
  });
}

/**
 * Reveal a file in the OS file manager.
 */
function revealFile(absPath: string): Promise<OpenInLaunchResult> {
  // explorer.exe exits non-zero even on success; launch fire-and-forget.
  return spawnDetached("explorer", [`/select,${absPath}`], "Explorer");
}

/**
 * Launch an editor/terminal app from the catalog.
 *   - editor   -> open the file itself
 *   - terminal -> open the file's parent directory
 */
function openWithApp(
  app: OpenInApp,
  absPath: string,
): Promise<OpenInLaunchResult> {
  const target = app.kind === "terminal" ? path.dirname(absPath) : absPath;

  const bin = app.win?.bin;
  if (!bin) {
    return Promise.resolve({
      ok: false,
      error: `${app.label} is not available on Windows`,
    });
  }
  if (app.kind === "terminal") {
    // Open a new console window for the terminal. The directory is passed via
    // cwd (NOT a cmd argument) so a repo-controlled path never reaches cmd's
    // parser; `start` inherits that cwd. bin is a trusted catalog value.
    return runArgv("cmd", ["/c", "start", "", bin], app.label, { cwd: target });
  }
  return runArgv(bin, [target], app.label);
}

/**
 * Open a file in the given app (by catalog id). An unknown or undefined id
 * falls back to the OS default handler.
 */
export async function openFileInApp(
  absPath: string,
  appId?: string,
): Promise<OpenInLaunchResult> {
  if (!appId) {
    return openSystemDefault(absPath);
  }

  const app = getOpenInApp(appId);
  if (!app) {
    // Unknown id — fall back to system default.
    return openSystemDefault(absPath);
  }

  if (app.kind === "file-manager") {
    return revealFile(absPath);
  }

  return openWithApp(app, absPath);
}

/**
 * Whether the given catalog app is launchable on this host.
 *   - 'reveal' is always available.
 *   - everything else: its bin resolves on PATH.
 */
function isAppAvailable(app: OpenInApp): boolean {
  if (app.id === "reveal") {
    return true;
  }
  const bin = app.win?.bin;
  return !!bin && !!Bun.which(bin);
}

export interface AvailableOpenInApp {
  id: string;
  label: string;
  kind: OpenInKind;
  icon: string;
}

/**
 * The catalog filtered to apps launchable on this host, in catalog order.
 * Always includes 'reveal'.
 */
export function getAvailableOpenInApps(): AvailableOpenInApp[] {
  const result: AvailableOpenInApp[] = [];

  for (const app of OPEN_IN_APPS) {
    if (!isAppAvailable(app)) continue;
    result.push({ id: app.id, label: app.label, kind: app.kind, icon: app.icon });
  }

  return result;
}

/**
 * GET /api/open-in/apps handler.
 *
 * `apps` is the host-filtered catalog (always includes 'reveal').
 */
export function handleOpenInApps(): Response {
  return Response.json({ available: true, apps: getAvailableOpenInApps() });
}

export interface HandleOpenInOptions {
  /**
   * Server-supplied resolution root, used INSTEAD of the client-provided
   * `base`. The review server passes `resolveAgentCwd()` here so repo-relative
   * `git diff` paths resolve against the VCS root rather than the launch cwd
   * (which differs when `hypermark review` runs from a subdirectory).
   * When omitted, the handler falls back to the client `base`. May return
   * several roots (annotate passes the session's reference roots).
   */
  resolveRoot?: () => string | string[];
}

/**
 * POST /api/open-in handler. Resolves + containment-checks the target via
 * resolveOpenInTarget (shared), then launches via openFileInApp.
 */
export async function handleOpenIn(
  req: Request,
  options: HandleOpenInOptions = {},
): Promise<Response> {
  let body: { filePath?: unknown; base?: unknown; appId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const filePath = typeof body.filePath === "string" ? body.filePath : "";
  if (!filePath) {
    return Response.json({ ok: false, error: "Missing filePath" }, { status: 400 });
  }
  const base = typeof body.base === "string" ? body.base : null;
  const appId = typeof body.appId === "string" ? body.appId : undefined;

  const abs = resolveOpenInTarget(filePath, base, options.resolveRoot);
  if (abs == null) {
    return Response.json({ ok: false, error: "Access denied" }, { status: 403 });
  }

  const result = await openFileInApp(abs, appId);
  // A failed launch is a valid request with the result in the body (ok:false),
  // not a server error — return 200 and let the client read `ok`. Matches Pi.
  return Response.json(result);
}
