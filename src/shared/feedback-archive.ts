/**
 * Feedback Archive — durable local storage of every submitted annotation
 * session: the one place Hypermark writes a durable, analyzable record of
 * what the user actually submitted.
 *
 * Layout (per project):
 *
 *   {DATA_DIR}/feedback/{project}/index.jsonl      append-only, authoritative
 *   {DATA_DIR}/feedback/{project}/records/…​.md      human-readable sidecar
 *
 * The JSONL line is self-contained: an analyzer never has to open a sidecar.
 * The sidecar exists because everything else in the data dir is markdown and
 * users grep it; it is written only for records that carry content (a
 * dismissal is a decision-only line).
 *
 * Every line carries a `client` field naming the tool that wrote it
 * (`hypermark` here). Readers treat it as an open set, ignore unknown fields
 * rather than reject them, and never parse a sidecar's filename: `recordFile`
 * is the only handle. Fields are added, never repurposed.
 *
 * Contract, shared with `persistAnnotateSubmission`:
 *  - This module NEVER throws. Any failure is logged once and reported as
 *    `null`, so a full disk can never turn a reviewer's submit into a 500.
 *  - Callers append BEFORE deleting the reviewer's draft: a failed archive
 *    write leaves the draft behind as the recovery copy.
 *  - The data directory is resolved PER CALL (not captured at module
 *    load), so a test can redirect HYPERMARK_DATA_DIR
 *    inside the test body — Bun runs every test file in one process, and a
 *    module-load capture cannot be redirected without import-order games.
 * Runtime-agnostic: node:fs / node:path only.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getHypermarkDataDir } from "./data-dir";
import { sanitizeTag } from "./project";

/** Schema version carried on every line. Bump only on a breaking shape change. */
export const FEEDBACK_RECORD_VERSION = 1;

/** Tool that authored the record. Readers treat it as an open set, never an enum to validate against. */
export const FEEDBACK_RECORD_CLIENT = "hypermark";

export type FeedbackSurface =
  | "annotate"
  | "annotate-last";

/** The decisions Hypermark writes. Other clients may write other values, so
 *  readers must treat the field as an open set. */
export type FeedbackDecision =
  | "feedback"
  | "dismissed";

export interface FeedbackTarget {
  /**
   * The annotate session's own target: the resolved file for a single-file
   * session, and the session's FOLDER for a folder session (not the document
   * that happened to be open when the reviewer submitted — a folder session
   * submits one body of feedback for the whole session, and the per-document
   * path is not part of it).
   */
  filePath?: string;
}

/** One submitted annotation, shallow-normalized. Unknown shapes never throw:
 *  anything unrecognized is simply absent from the record. */
export interface FeedbackAnnotationRecord {
  id?: string;
  type?: string;
  text?: string;
  originalText?: string;
  blockId?: string;
  images?: number;
}

export interface FeedbackRecord {
  v: number;
  ts: string;
  client: string;
  project: string;
  surface: FeedbackSurface;
  decision: FeedbackDecision;
  target?: FeedbackTarget;
  feedback?: string;
  annotations?: FeedbackAnnotationRecord[];
  counts: { annotations: number; images: number };
  /** Sidecar path relative to the project directory. Absent on decision-only lines. */
  recordFile?: string;
}

export interface FeedbackArchiveInput {
  /** Project namespace: the git repo or directory name (see server/project.ts). */
  project: string;
  surface: FeedbackSurface;
  decision: FeedbackDecision;
  target?: FeedbackTarget;
  /** Exported human-readable feedback (byte-identical to what the agent got). */
  feedback?: unknown;
  /** Raw annotations array from the submit body. */
  annotations?: unknown;
  /** Injected by tests to force the failure branch. */
  now?: Date;
}

/**
 * Derive the archive's project segment.
 *
 * Takes whatever `detectProjectName()` returned (already sanitizeTag'd) or
 * the literal `_unknown`. Every other value is sanitizeTag'd, which is also
 * what keeps a caller-derived name from ever escaping the archive directory.
 */
export function normalizeFeedbackProject(project: string | null | undefined): string {
  if (!project) return "_unknown";
  if (project === "_unknown") return project;
  return sanitizeTag(project) ?? "_unknown";
}

function feedbackProjectDir(project: string): string {
  return join(getHypermarkDataDir(), "feedback", normalizeFeedbackProject(project));
}

/** Filesystem-safe ISO stamp, same convention as `saveAnnotateSubmission`. */
function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Shallow-normalize one submitted annotation, read leniently. */
function normalizeAnnotation(raw: unknown): FeedbackAnnotationRecord {
  if (typeof raw !== "object" || raw === null) return {};
  const a = raw as Record<string, unknown>;
  const record: FeedbackAnnotationRecord = {};
  const id = asString(a.id);
  if (id) record.id = id;
  const type = asString(a.type);
  if (type) record.type = type;
  const text = asString(a.text);
  if (text) record.text = text;
  const originalText = asString(a.originalText);
  if (originalText) record.originalText = originalText;
  const blockId = asString(a.blockId);
  if (blockId) record.blockId = blockId;
  if (Array.isArray(a.images) && a.images.length > 0) record.images = a.images.length;
  return record;
}

const SURFACE_TITLES: Record<FeedbackSurface, string> = {
  annotate: "Annotate feedback",
  "annotate-last": "Annotate feedback (agent message)",
};

/**
 * Render the human-readable sidecar: a short metadata header plus the exact
 * feedback text the agent received.
 */
export function renderFeedbackRecordMarkdown(record: FeedbackRecord): string {
  const lines: string[] = [`# ${SURFACE_TITLES[record.surface] ?? "Feedback"}`, ""];
  lines.push(`- Submitted: ${record.ts}`);
  lines.push(`- Surface: ${record.surface}`);
  lines.push(`- Decision: ${record.decision}`);
  lines.push(`- Project: ${record.project}`);
  const target = record.target;
  if (target?.filePath) lines.push(`- File: ${target.filePath}`);
  lines.push(
    `- Annotations: ${record.counts.annotations}`,
  );
  lines.push("", "---", "");
  lines.push(record.feedback && record.feedback.trim() ? record.feedback : "_No feedback text submitted._");
  lines.push("");
  return lines.join("\n");
}

/**
 * Append one submitted-feedback record to the archive.
 *
 * Returns the path of the index file that was appended to, or `null` when
 * nothing durable was written (the caller then keeps the reviewer's draft).
 * Never throws.
 *
 * The sidecar is written before the index line even though the index is the
 * authoritative store: it is created with the exclusive `wx` flag (retrying
 * with a collision counter), so a record file can never be overwritten and an
 * index line can never name a file that does not exist. An orphan sidecar
 * after a failed append is harmless; a dangling reference would not be.
 */
export function appendFeedbackRecord(input: FeedbackArchiveInput): string | null {
  try {
    const now = input.now ?? new Date();
    const project = normalizeFeedbackProject(input.project);
    const feedback = typeof input.feedback === "string" ? input.feedback : "";
    const rawAnnotations = Array.isArray(input.annotations) ? input.annotations : [];
    const annotations = rawAnnotations.map(normalizeAnnotation);
    const counts = {
      annotations: annotations.length,
      images: annotations.reduce((sum, a) => sum + (a.images ?? 0), 0),
    };
    const hasContent = feedback.trim().length > 0 || annotations.length > 0;

    const record: FeedbackRecord = {
      v: FEEDBACK_RECORD_VERSION,
      ts: now.toISOString(),
      client: FEEDBACK_RECORD_CLIENT,
      project,
      surface: input.surface,
      decision: input.decision,
      ...(input.target ? { target: input.target } : {}),
      ...(feedback ? { feedback } : {}),
      ...(annotations.length > 0 ? { annotations } : {}),
      counts,
    };

    const projectDir = feedbackProjectDir(project);
    mkdirSync(projectDir, { recursive: true });

    if (hasContent) {
      const recordsDir = join(projectDir, "records");
      mkdirSync(recordsDir, { recursive: true });
      // {stamp}-{surface}-{decision}[-N].md. Nothing may parse a sidecar
      // name: `recordFile` is the only handle, and any value it carries is
      // valid.
      const base = `${stamp(now)}-${input.surface}-${input.decision}`;
      let name = `${base}.md`;
      const body = renderFeedbackRecordMarkdown(record);
      for (let n = 2; ; n++) {
        try {
          writeFileSync(join(recordsDir, name), body, { encoding: "utf-8", flag: "wx" });
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
          // Exhausting the counter is not an ordinary collision: the stamp is
          // per-millisecond, so 100 taken names in one millisecond means a
          // stopped clock or a runaway writer. Say so, or the outer catch logs
          // a bare EEXIST that reads like a transient disk problem.
          if (n > 100) {
            throw new Error(
              `sidecar name collision exceeded 100 attempts for ${base}.md (clock stuck or runaway writer)`,
            );
          }
          name = `${base}-${n}.md`;
        }
      }
      record.recordFile = `records/${name}`;
      // The sidecar body names the record's own metadata, not its filename, so
      // no rewrite is needed once the final name is known.
    }

    const indexPath = join(projectDir, "index.jsonl");
    // JSON.stringify can never emit a raw newline, so one record is always one
    // line, and the whole line is handed to a single append-mode write.
    //
    // That is a practical guarantee, not a formal one, and the honest model is
    // worth stating: appendFileSync itself loops internally (fs writes until
    // the buffer is drained), so "one syscall" is wrong even locally. What
    // holds in practice is that an O_APPEND write of a line-sized buffer
    // completes without interleaving on a local filesystem. NFS and SMB do not
    // promise even that, and a genuine interleave damages BOTH records that
    // raced, not just the later one. The backstop is the reader:
    // parseFeedbackIndex skips unparsable lines, so the blast radius is bounded
    // at those records and every other line in the file stays readable. Several
    // clients share this index, which is exactly when the caveat matters.
    appendFileSync(indexPath, `${JSON.stringify(record)}\n`, "utf-8");
    return indexPath;
  } catch (error) {
    console.error(
      `[hypermark] warning: could not archive submitted feedback (${error instanceof Error ? error.message : String(error)}); keeping the annotation draft as the recovery copy`,
    );
    return null;
  }
}

/**
 * Read a project's archive, skipping unparsable lines.
 *
 * The read path in v1 is "the files on disk" (jq/grep); this helper exists so
 * the servers' own tests and any future in-process reader agree on the
 * torn-line tolerance the append contract promises. Never throws.
 *
 * Structural gate only: a line counts as a record when it parses and carries a
 * numeric `v`. It deliberately does NOT filter by version or by `client`, so a
 * newer writer's lines are still returned. An analyzer that depends on v1
 * SEMANTICS should filter `v <= 1` itself; fields are only ever added, never
 * repurposed, so a v2 would mean a real shape change rather than new keys.
 */
export function parseFeedbackIndex(contents: string): FeedbackRecord[] {
  const records: FeedbackRecord[] = [];
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as FeedbackRecord;
      if (parsed && typeof parsed === "object" && typeof parsed.v === "number") records.push(parsed);
    } catch {
      // Torn last line from a concurrent append — skip it, keep the rest.
    }
  }
  return records;
}
