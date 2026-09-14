/**
 * Shared route handlers used by plan, review, and annotate servers.
 *
 * Eliminates duplication of /api/image, /api/upload, /api/draft, unmatched API
 * responses, and the server-ready handler across all three server files.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openBrowser as openBrowserImpl } from "./browser";
import { validateImagePath, validateUploadExtension, UPLOAD_DIR } from "./image";
import { saveDraft, loadDraft, deleteDraft, getDraftGeneration } from "./draft";
import { CLASSIC_FAVICON_SVG } from "@hypermark/shared/favicon";
import { listReferenceSkills, readReferenceSkillContent } from "./review-skill-loader";

function normalizeDraftGeneration(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function readDraftGenerationFromUrl(req: Request): number | undefined {
  const url = new URL(req.url);
  const raw = url.searchParams.get("generation") ?? url.searchParams.get("draftGeneration");
  if (raw === null) return undefined;
  const value = Number(raw);
  return normalizeDraftGeneration(value);
}

export function readDraftGenerationFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  return normalizeDraftGeneration((body as { draftGeneration?: unknown }).draftGeneration);
}

/** Serve images from local paths or temp uploads. Used by all 3 servers. */
export async function handleImage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const imagePath = url.searchParams.get("path");
  if (!imagePath) {
    return new Response("Missing path parameter", { status: 400 });
  }
  const validation = validateImagePath(imagePath);
  if (!validation.valid) {
    return new Response(validation.error!, { status: 403 });
  }
  try {
    const file = Bun.file(validation.resolved);
    if (await file.exists()) {
      return new Response(file);
    }
    // If not found and a base directory is provided, try resolving relative to it
    const base = url.searchParams.get("base");
    if (base && !imagePath.startsWith("/")) {
      const { resolve: resolvePath } = await import("path");
      const fromBase = resolvePath(base, imagePath);
      const baseValidation = validateImagePath(fromBase);
      if (baseValidation.valid) {
        const baseFile = Bun.file(baseValidation.resolved);
        if (await baseFile.exists()) {
          return new Response(baseFile);
        }
      }
    }
    return new Response("File not found", { status: 404 });
  } catch {
    return new Response("Failed to read file", { status: 500 });
  }
}

/** Upload image to temp dir, return path. Used by all 3 servers. */
export async function handleUpload(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return new Response("No file provided", { status: 400 });
    }

    const extResult = validateUploadExtension(file.name);
    if (!extResult.valid) {
      return Response.json({ error: extResult.error }, { status: 400 });
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = `${UPLOAD_DIR}/${crypto.randomUUID()}.${extResult.ext}`;

    await Bun.write(tempPath, file);
    return Response.json({ path: tempPath, originalName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Save annotation draft. Used by all 3 servers. */
export async function handleDraftSave(req: Request, contentKey: string): Promise<Response> {
  try {
    const body = await req.json();
    saveDraft(contentKey, body);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save draft";
    console.error(`[draft] save failed: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Load annotation draft. Used by all 3 servers. */
export function handleDraftLoad(contentKey: string): Response {
  const draft = loadDraft(contentKey);
  if (!draft) {
    const draftGeneration = getDraftGeneration(contentKey);
    return Response.json(
      { found: false, ...(draftGeneration !== null ? { draftGeneration } : {}) },
      { status: 404 },
    );
  }
  return Response.json(draft);
}

/** Delete annotation draft. Used by all 3 servers. */
export function handleDraftDelete(contentKey: string, req?: Request): Response {
  deleteDraft(contentKey, req ? readDraftGenerationFromUrl(req) : undefined);
  return Response.json({ ok: true });
}

/**
 * List global agent skills for comment skill references. Used by plan +
 * annotate servers. Takes no client input (fixed roots only) and degrades to an
 * empty catalog on any failure so the composer never breaks.
 */
export function handleReferenceSkills(): Response {
  try {
    return Response.json({ skills: listReferenceSkills() });
  } catch (err) {
    console.error(
      `[hypermark] Skill catalog failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return Response.json({ skills: [] });
  }
}

/**
 * Serve a referenced skill's SKILL.md contents for feedback injection
 * (`?name=<skill>`). Used by plan + annotate servers. The name is matched
 * against discovered skills only — it is never used as a path — so traversal
 * and absolute-path inputs answer 404, never a file outside the skill roots.
 */
export function handleReferenceSkillContent(req: Request): Response {
  try {
    const name = new URL(req.url).searchParams.get("name") ?? "";
    const skill = readReferenceSkillContent(name);
    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }
    return Response.json({ skill });
  } catch (err) {
    console.error(
      `[hypermark] Skill content failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return Response.json({ error: "Skill content failed" }, { status: 500 });
  }
}

/** Return the shared JSON response for an unmatched API route. */
export function handleApiNotFound(path: string): Response {
  return Response.json({ error: "Not found", path }, { status: 404 });
}

/**
 * Serve the app favicon. Used by all 3 servers (plus goal-setup).
 *
 * Classic (dark-navy P tile SVG) is the sole offered favicon. The response is
 * SVG with no-cache so a browser tab reflects the correct icon on every load.
 */
export function handleFavicon(): Response {
  return new Response(CLASSIC_FAVICON_SVG, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" },
  });
}

interface ServerReadyOptions {
  readyFile?: string;
  skipBrowserOpen?: boolean;
  openBrowser?: typeof openBrowserImpl;
}

export interface ServerReadyMetadata {
  url: string;
  port: number;
}

export function writeServerReadyMetadata(readyFile: string, metadata: ServerReadyMetadata): void {
  mkdirSync(dirname(readyFile), { recursive: true });
  appendFileSync(readyFile, `${JSON.stringify(metadata)}\n`, "utf8");
}

/** Attempt to open the browser for the session URL. */
export async function handleServerReady(
  url: string,
  port: number,
  options: ServerReadyOptions = {},
): Promise<void> {
  const readyFile = options.readyFile ?? process.env.HYPERMARK_READY_FILE;
  if (readyFile) {
    try {
      writeServerReadyMetadata(readyFile, { url, port });
    } catch (error) {
      if (options.readyFile) throw error;
      // Best effort: host plugins use this side channel to open the browser.
    }
  }

  const skipBrowserOpen = options.skipBrowserOpen ?? process.env.HYPERMARK_SKIP_BROWSER_OPEN === "1";
  if (skipBrowserOpen) return;

  const opened = await (options.openBrowser ?? openBrowserImpl)(url, { useGlimpse: true });

  // Fallback lifeline: if the browser couldn't be opened (no display, broken
  // opener), the user otherwise has no URL and the agent hangs at
  // waitForDecision.
  if (!opened) {
    process.stderr.write(`\n  Hypermark session ready — open in your browser:\n  ${url}\n\n`);
  }
}

