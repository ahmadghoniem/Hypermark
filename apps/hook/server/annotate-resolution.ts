/**
 * Annotate target resolution for the direct CLI (`hypermark annotate`).
 *
 * Extracted from the annotate branch of index.ts so the resolution pipeline
 * can be re-run once by the tolerant token fallback (#1182) and unit tested.
 * The behavior of a single resolution pass is unchanged: the same branch
 * order (HTML, document), the same messages, and the same progress lines,
 * emitted through `log` at the same points as before.
 *
 * Failures are returned instead of exiting; the caller maps them onto the
 * existing exit behavior. `notFound` is true only for the "the input named
 * nothing" terminal, which is the sole hook point for the token fallback.
 * Every target-specific failure (unsupported type, oversized file, ambiguous
 * name) keeps `notFound` false so it surfaces verbatim.
 */

import { existsSync, statSync } from "fs";
import path from "path";
import { resolveAtReference, stripAtPrefix } from "@hypermark/shared/at-reference";
import { htmlToMarkdown } from "@hypermark/shared/html-to-markdown";
import {
  buildAnnotatableDocRegex,
  buildAnnotatableExtensionsHint,
} from "@hypermark/shared/annotatable";
import {
  getExtraMarkdownExtensions,
  MAX_ANNOTATABLE_FILE_BYTES,
  resolveMarkdownFile,
  resolveUserPath,
} from "@hypermark/shared/resolve-file";

interface AnnotateResolutionSuccess {
  ok: true;
  markdown: string;
  rawHtml?: string;
  absolutePath: string;
  annotateMode: "annotate";
  sourceInfo?: string;
  sourceConverted: boolean;
}

interface AnnotateResolutionFailure {
  ok: false;
  /** True only when the input resolved to nothing at all. */
  notFound: boolean;
  message: string;
}

export type AnnotateResolutionResult =
  | AnnotateResolutionSuccess
  | AnnotateResolutionFailure;

/** Message returned when the token looks like a URL or names a directory:
 * only local files (`.md`, `.mdx`, `.txt`, `.html`) can be annotated. */
export const ANNOTATE_TAKES_FILE_PATH_MESSAGE = "hypermark annotate takes a file path";

export async function resolveAnnotateTarget(options: {
  rawFilePath: string;
  projectRoot: string;
  renderMarkdown: boolean;
  /**
   * Extra extensions the user registered as markdown (#1307). Defaults to the
   * process-wide set resolved from config.json; passed explicitly by callers
   * that already hold a resolved list.
   */
  extraMarkdownExtensions?: readonly string[];
  log?: (line: string) => void;
}): Promise<AnnotateResolutionResult> {
  const { rawFilePath, projectRoot, renderMarkdown } = options;
  const extraMarkdownExtensions =
    options.extraMarkdownExtensions ?? getExtraMarkdownExtensions();
  const log = options.log ?? ((line: string) => console.error(line));

  // Primary resolution strips the `@` reference marker; rawFilePath is
  // preserved so each branch can fall back to the literal form below
  // (scoped-package-style names).
  const filePath = stripAtPrefix(rawFilePath);

  if (process.env.HYPERMARK_DEBUG) {
    log(`[DEBUG] Project root: ${projectRoot}`);
    log(`[DEBUG] File path arg: ${filePath}`);
  }

  // URL tokens: only local files are annotatable.
  if (/^https?:\/\//i.test(filePath)) {
    return {
      ok: false,
      notFound: false,
      message: ANNOTATE_TAKES_FILE_PATH_MESSAGE,
    };
  }

  // Folder tokens: only local files are annotatable.
  const folderCandidate = resolveAtReference(rawFilePath, (c) => {
    try {
      return statSync(resolveUserPath(c, projectRoot)).isDirectory();
    } catch {
      return false;
    }
  });

  if (folderCandidate !== null) {
    return {
      ok: false,
      notFound: false,
      message: ANNOTATE_TAKES_FILE_PATH_MESSAGE,
    };
  }

  // HTML check with the same literal-@ fallback semantics.
  const htmlCandidate = resolveAtReference(rawFilePath, (c) => {
    const abs = resolveUserPath(c, projectRoot);
    return /\.html?$/i.test(abs) && existsSync(abs);
  });

  if (htmlCandidate !== null) {
    const resolvedArg = resolveUserPath(htmlCandidate, projectRoot);
    const htmlFile = Bun.file(resolvedArg);
    const html = await htmlFile.text();
    const renderHtmlForFile = !renderMarkdown;
    let markdown: string;
    let rawHtml: string | undefined;
    let sourceConverted = false;
    if (renderHtmlForFile) {
      rawHtml = html;
      markdown = "";
    } else {
      markdown = htmlToMarkdown(html);
      sourceConverted = true;
    }
    log(`${renderHtmlForFile ? "Raw HTML" : "Converted"}: ${resolvedArg}`);
    return {
      ok: true,
      markdown,
      rawHtml,
      absolutePath: resolvedArg,
      annotateMode: "annotate",
      sourceInfo: path.basename(resolvedArg),
      sourceConverted,
    };
  }

  // Single markdown/plain-text file annotation mode
  // Strip-first with literal-@ fallback (scoped-package-style names).
  let resolved = resolveMarkdownFile(filePath, projectRoot, { extraMarkdownExtensions });
  if (resolved.kind === "not_found" && rawFilePath !== filePath) {
    resolved = resolveMarkdownFile(rawFilePath, projectRoot, { extraMarkdownExtensions });
  }

  if (resolved.kind === "ambiguous") {
    return {
      ok: false,
      notFound: false,
      message: [
        `Ambiguous filename "${resolved.input}" — found ${resolved.matches.length} matches:`,
        ...resolved.matches.map((match) => `  ${match}`),
      ].join("\n"),
    };
  }
  if (resolved.kind !== "found") {
    // Check if file exists but has unsupported type
    const resolvedPath = resolveUserPath(resolved.input, projectRoot);
    const fileExists = existsSync(resolvedPath);

    if (fileExists) {
      const ext = path.extname(resolvedPath).toLowerCase();
      return {
        ok: false,
        notFound: false,
        message:
          `File type not supported: ${ext}\n` +
          `Supported types: ${buildAnnotatableExtensionsHint(extraMarkdownExtensions)}\n` +
          `For code review, use: hypermark review [file]`,
      };
    }
    return {
      ok: false,
      notFound: true,
      message: `File not found: ${resolved.input}`,
    };
  }

  const absolutePath = resolved.path;
  if (Bun.file(absolutePath).size > MAX_ANNOTATABLE_FILE_BYTES) {
    return {
      ok: false,
      notFound: false,
      message: `File too large to annotate (max 2MB): ${absolutePath}`,
    };
  }
  const markdown = await Bun.file(absolutePath).text();
  log(`Resolved: ${absolutePath}`);
  return {
    ok: true,
    markdown,
    absolutePath,
    annotateMode: "annotate",
    sourceConverted: false,
  };
}
