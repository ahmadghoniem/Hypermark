/**
 * Session Log Parser
 *
 * Extracts the last rendered assistant message from local agent session logs.
 * Used by the "annotate-last" feature to let users annotate the most recent
 * assistant response in the annotation UI.
 *
 * Currently supports:
 *   - Claude Code: ~/.claude/projects/{project-slug}/{session-id}.jsonl
 *
 * Each line is a JSON object with a `type` field. Assistant messages may be
 * split across multiple lines sharing the same logical message id. Text
 * content blocks (`type: "text"` inside `message.content`) are what the user
 * sees rendered in chat.
 */

import {
  readdirSync,
  statSync,
  readFileSync,
  accessSync,
  constants as fsConstants,
} from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const claudeConfigDir =
  process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const DEFAULT_PROJECTS_DIR = join(claudeConfigDir, "projects");

// --- Types ---

export interface SessionLogEntry {
  type: string;
  /** Entry identity. Bookkeeping types (`last-prompt`, `ai-title`, `mode`) have none. */
  uuid?: string;
  /** The entry this one follows. `null` on the root entry. */
  parentUuid?: string | null;
  message?: {
    id?: string;
    role?: string;
    content?: string | ContentBlock[];
  };
  [key: string]: unknown;
}

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface RenderedMessage {
  /** The API message ID (shared across streamed chunks) */
  messageId: string;
  /** Concatenated text from all text blocks */
  text: string;
  /** Line numbers in the JSONL where this message appeared */
  lineNumbers: number[];
  /** Timestamp from the entry (ISO 8601), if available */
  timestamp?: string;
  /** A compaction comes between this message and the next newer one. */
  compactedAfter?: boolean;
  /** The rail leaves this message out (see `isHiddenMessage`). */
  hidden?: boolean;
}

/** The entry Claude Code writes where `/compact` (or auto-compact) cut the conversation. */
function isCompactBoundary(entry: SessionLogEntry | undefined): boolean {
  return entry?.type === "system" && entry.subtype === "compact_boundary";
}

// --- Session Resolution ---

/**
 * Derive the project slug from a working directory path.
 * Claude Code replaces every character outside [a-zA-Z0-9-] with `-`.
 */
export function projectSlugFromCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9-]/g, "-");
}

/** Why no log was found for a session id. */
export type ClaudeSessionLogMissReason =
  /** Not a plain file name. */
  | "invalid-id"
  /** No project folder holds `<id>.jsonl`. */
  | "missing"
  /** More than one project folder holds it, and the cwd's folder doesn't. */
  | "duplicate"
  /** The file exists but can't be read. */
  | "unreadable";

type ClaudeSessionLogLookup =
  | { status: "found"; logPath: string }
  | { status: "miss"; reason: ClaudeSessionLogMissReason };

export type ClaudeSessionLogResolution =
  | { status: "unavailable" }
  | { status: "identified"; sessionId: string; logPath: string }
  | { status: "identified"; sessionId: string; logPath: null; reason: ClaudeSessionLogMissReason };

export interface ClaudeSessionLogResolutionOptions {
  /**
   * The invoking session's id. Defaults to `CLAUDE_CODE_SESSION_ID`, which
   * Claude Code (2.1.132+) sets on every shell it spawns to the session
   * current at that moment, so it follows /resume, /clear and /cd. The log's
   * file name is this id.
   */
  sessionId?: string;
  /** The session's working directory, whose project folder is checked first. */
  cwd?: string;
  projectsDir?: string;
}

/**
 * Identify the invoking Claude session from `CLAUDE_CODE_SESSION_ID` and find
 * its log.
 */
export function resolveClaudeSessionLog(
  opts: ClaudeSessionLogResolutionOptions = {},
): ClaudeSessionLogResolution {
  const sessionId = opts.sessionId ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) return { status: "unavailable" };
  const lookup = lookupClaudeSessionLog(sessionId, opts);
  return lookup.status === "found"
    ? { status: "identified", sessionId, logPath: lookup.logPath }
    : { status: "identified", sessionId, logPath: null, reason: lookup.reason };
}

/**
 * Explain why a Claude session resolution produced no transcript, or null
 * when there is nothing more specific to say than "no message found".
 */
export function describeClaudeSessionResolutionFailure(
  resolution: ClaudeSessionLogResolution,
): string | null {
  if (resolution.status === "unavailable") {
    return "CLAUDE_CODE_SESSION_ID is not set: run this from Claude Code 2.1.132 or later, or pass the message with --stdin.";
  }
  if (resolution.logPath) return null;
  const id = resolution.sessionId;
  switch (resolution.reason) {
    case "invalid-id":
      return `CLAUDE_CODE_SESSION_ID is not a valid session id: ${id}.`;
    case "missing":
      return `No transcript found for Claude session ${id} under ${DEFAULT_PROJECTS_DIR} (check CLAUDE_CONFIG_DIR).`;
    case "duplicate":
      return `More than one project folder holds a transcript for Claude session ${id}, so it is ambiguous.`;
    case "unreadable":
      return `The transcript for Claude session ${id} can't be read.`;
  }
}

/** Stat `<dir>/<sessionId>.jsonl`: a readable file, absent, or unreadable. */
function probeLog(path: string): "found" | "absent" | "unreadable" {
  try {
    if (!statSync(path).isFile()) return "absent";
    accessSync(path, fsConstants.R_OK);
    return "found";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? "absent" : "unreadable";
  }
}

/**
 * Find `<sessionId>.jsonl`. The cwd's project folder is checked first: /cd
 * moves the log there, so that is where it almost always is, and a hit there
 * is the session's live log. Otherwise every project folder is checked (a
 * session resumed from another directory keeps writing its original log, and
 * a long path's folder name is shortened), and only a unique file counts.
 */
function lookupClaudeSessionLog(
  sessionId: string,
  opts: ClaudeSessionLogResolutionOptions,
): ClaudeSessionLogLookup {
  if (
    !sessionId ||
    sessionId.includes("/") ||
    sessionId.includes("\\") ||
    sessionId.includes("\0") ||
    basename(sessionId) !== sessionId
  ) {
    return { status: "miss", reason: "invalid-id" };
  }

  const projectsDir = opts.projectsDir ?? DEFAULT_PROJECTS_DIR;
  const fileName = `${sessionId}.jsonl`;
  const cwdSlug = projectSlugFromCwd(opts.cwd ?? process.env.HYPERMARK_CWD ?? process.cwd());

  // The file system decides case: Windows and macOS match a differently-cased
  // drive letter or folder, Linux doesn't need to.
  const cwdLog = join(projectsDir, cwdSlug, fileName);
  const cwdProbe = probeLog(cwdLog);
  if (cwdProbe === "found") return { status: "found", logPath: cwdLog };
  if (cwdProbe === "unreadable") return { status: "miss", reason: "unreadable" };

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return { status: "miss", reason: "missing" };
  }

  const matches: string[] = [];
  for (const projectDir of projectDirs) {
    const candidate = join(projectsDir, projectDir, fileName);
    const probe = probeLog(candidate);
    if (probe === "unreadable") return { status: "miss", reason: "unreadable" };
    if (probe === "found") matches.push(candidate);
    if (matches.length > 1) return { status: "miss", reason: "duplicate" };
  }

  return matches[0]
    ? { status: "found", logPath: matches[0] }
    : { status: "miss", reason: "missing" };
}

// --- Log Parsing ---

/**
 * Parse a JSONL session log into entries.
 * Invalid lines are silently skipped.
 */
export function parseSessionLog(content: string): SessionLogEntry[] {
  const lines = content.trim().split("\n");
  const entries: SessionLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Prefixes that indicate system-generated user messages, not real human input.
 * Claude Code logs local command caveats, command names, stdout/stderr, and
 * other system messages as type:"user" with string content.
 */
const SYSTEM_USER_PREFIXES = [
  "<local-command-",
  "<command-name>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<system-reminder>",
  "<system-notification>",
];

function getVisibleTextBlocks(content: string | ContentBlock[] | undefined): string[] {
  if (typeof content === "string") {
    return content.trim() ? [content] : [];
  }
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: ContentBlock) => b.type === "text" && b.text?.trim())
    .map((b: ContentBlock) => b.text!);
}

/**
 * Check if a session log entry is a human-typed user prompt
 * (as opposed to a tool result or system-generated user message).
 */
export function isHumanPrompt(entry: SessionLogEntry): boolean {
  if (entry.type !== "user") return false;
  const blocks = getVisibleTextBlocks(entry.message?.content);
  if (blocks.length === 0) return false;
  const content = blocks.join("\n");
  // Filter out system-generated user messages
  for (const prefix of SYSTEM_USER_PREFIXES) {
    if (content.startsWith(prefix)) return false;
  }
  return true;
}

/**
 * Extract text blocks from an assistant message's content array.
 */
function extractTextBlocks(entry: SessionLogEntry): string[] {
  if (entry.type !== "assistant") return [];
  return getVisibleTextBlocks(entry.message?.content);
}


/**
 * Resolve the entries that are actually part of the live conversation.
 *
 * Claude Code's transcript is append-only and tree-shaped: every entry records
 * the entry it follows in `parentUuid`. `/rewind` writes nothing at all — the
 * next message simply re-parents to an earlier entry, orphaning everything
 * that came after it. So file order and the live conversation diverge, and
 * reading the file bottom-up returns messages the user can no longer see.
 *
 * Walks `parentUuid` from the newest entry that has a `uuid` back to the root.
 * The newest entry is not necessarily the last line: bookkeeping types
 * (`last-prompt`, `ai-title`, `mode`, `file-history-snapshot`) carry no ids and
 * are frequently written last.
 *
 * A compaction boundary has no `parentUuid`; the walk continues through its
 * `logicalParentUuid` (the last message before the compaction), so the branch
 * holds the messages from before every compaction too. A boundary whose
 * `logicalParentUuid` is missing from the log ends the walk there.
 *
 * Returns a set of indices into `entries`, so callers keep reporting real file
 * positions. Returns null when the chain can't be trusted — no ids at all, or a
 * walk that dead-ends instead of reaching the root — so callers can fall back
 * to a linear scan rather than returning nothing. Measured against 311 local
 * transcripts, every one reaches the root with no dangling parents or cycles.
 */
export function resolveActiveBranchIndices(
  entries: SessionLogEntry[],
): Set<number> | null {
  const indexByUuid = new Map<string, number>();
  let cursor = -1;
  for (let i = 0; i < entries.length; i++) {
    const uuid = entries[i]?.uuid;
    if (typeof uuid === "string" && uuid) {
      indexByUuid.set(uuid, i);
      cursor = i;
    }
  }
  if (cursor === -1) {
    return null;
  }

  const branch = new Set<number>();
  for (;;) {
    // A cycle would spin forever; treat a revisit as an untrustworthy chain.
    if (branch.has(cursor)) {
      return null;
    }
    branch.add(cursor);

    const entry = entries[cursor];
    const parentUuid = entry?.parentUuid;
    if (parentUuid === null || parentUuid === undefined) {
      const logicalParentIndex = isCompactBoundary(entry) && typeof entry?.logicalParentUuid === "string"
        ? indexByUuid.get(entry.logicalParentUuid)
        : undefined;
      if (logicalParentIndex === undefined) return branch;
      cursor = logicalParentIndex;
      continue;
    }
    if (typeof parentUuid !== "string") {
      return null;
    }
    const parentIndex = indexByUuid.get(parentUuid);
    if (parentIndex === undefined) {
      return null;
    }
    cursor = parentIndex;
  }
}

/** Lines Claude Code itself shows in place of an answer. */
const SYSTEM_LINE = /^(API Error\b|You've hit your|You're out of extra usage|Your organization has disabled|No response requested\.?$|Prompt is too long|Request timed out|Credit balance is too low|Invalid API key|Claude AI usage limit reached|\[Request interrupted)/i;
/** A heading, list item, quote, code fence or table row on any line. */
const STRUCTURED = /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|\|)/m;

/**
 * A message the rail leaves out:
 * - a system line ("API Error: …", usage limits, "[Request interrupted…");
 * - one unstructured paragraph of at most 200 characters;
 * - a status note, when `automatic` (the reply to a monitor, task
 *   notification, skill or compaction summary, or a line written mid-turn):
 *   at most two unstructured paragraphs and 450 characters.
 *
 * Measured on 5,498 local messages, this hides 97% of the short unstructured
 * ones; the short answers it keeps are replies to the user's own prompts.
 */
export function isHiddenMessage(text: string, automatic: boolean): boolean {
  const trimmed = text.trim();
  if (SYSTEM_LINE.test(trimmed)) return true;
  if (STRUCTURED.test(trimmed)) return false;
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (paragraphs <= 1 && trimmed.length <= 200) return true;
  return automatic && paragraphs <= 2 && trimmed.length <= 450;
}

/**
 * Whether a user entry started a turn, and how: `"human"` for the user's own
 * prompt (or slash command), `"automatic"` for a monitor or task
 * notification, a skill body, a compaction summary or an auto-continuation.
 * Null for tool results and system reminders, which don't start a turn.
 */
function turnTrigger(entry: SessionLogEntry): "human" | "automatic" | null {
  if (entry.type !== "user") return null;
  const content = entry.message?.content;
  if (Array.isArray(content) && content.some((b) => b.type === "tool_result")) return null;
  if (entry.isMeta === true || entry.isCompactSummary === true) return "automatic";
  const origin = entry.origin as { kind?: unknown } | undefined;
  if (typeof origin?.kind === "string" && origin.kind !== "human") return "automatic";
  const text = getVisibleTextBlocks(content).join("\n").trimStart();
  if (text.startsWith("<task-notification>")) return "automatic";
  if (text.startsWith("<system-reminder>") || text.startsWith("<system-notification>")) return null;
  return "human";
}

/**
 * Extract up to `limit` of the most recent rendered assistant messages.
 *
 * Returned newest-first. This does not
 * stop at turn boundaries (human prompts) — picker UIs want a flat list of
 * recent assistant bubbles.
 *
 * Pass `branchIndices` (from `resolveActiveBranchIndices`) to skip entries that
 * a `/rewind` orphaned. Without it, entries are read in file order, which after
 * a rewind includes messages no longer in the conversation.
 *
 * A compaction boundary in range sets `compactedAfter` on the newest message
 * before it. Each message carries `hidden` per `isHiddenMessage`; with
 * `limitCountsShown`, hidden messages don't count toward `limit`.
 *
 * Chunks of a single API message (same message.id) are concatenated.
 */
export function extractRecentRenderedMessages(
  entries: SessionLogEntry[],
  beforeIndex: number,
  limit: number,
  opts: { branchIndices?: Set<number> | null; limitCountsShown?: boolean } = {},
): RenderedMessage[] {
  if (limit <= 0) return [];
  const { branchIndices, limitCountsShown } = opts;

  // Map preserves insertion order — we walk backward, so first key inserted is
  // newest. Each bucket collects the chunks of one API message (same message.id).
  type Bucket = {
    chunks: { texts: string[]; lineNum: number }[];
    timestamp?: string;
    compactedAfter?: boolean;
    automatic?: boolean;
  };
  const buckets = new Map<string, Bucket>();
  // Set on passing a boundary, taken by the next (older) message.
  let pendingCompaction = false;
  // Messages whose turn's first user entry hasn't been passed yet.
  let awaitingTrigger: Bucket[] = [];
  // Messages that also called a tool: written mid-turn.
  const toolUseIds = new Set<string>();

  for (let i = beforeIndex - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    if (branchIndices && !branchIndices.has(i)) continue;

    if (isCompactBoundary(entry)) {
      pendingCompaction = true;
      continue;
    }
    if (entry.type === "progress" || entry.type === "system") continue;
    if (entry.type === "file-history-snapshot") continue;
    if (entry.type === "queue-operation") continue;
    if (entry.type === "user") {
      const trigger = turnTrigger(entry);
      if (trigger) {
        for (const b of awaitingTrigger) b.automatic = trigger === "automatic";
        awaitingTrigger = [];
      }
      continue;
    }
    if (entry.type !== "assistant") continue;

    const msgId = entry.message?.id;
    if (!msgId) continue;
    const content = entry.message?.content;
    if (Array.isArray(content) && content.some((b) => b.type === "tool_use")) toolUseIds.add(msgId);
    const texts = extractTextBlocks(entry);
    if (texts.length === 0) continue;

    let bucket = buckets.get(msgId);
    if (!bucket) {
      // Without `limitCountsShown` the cap applies here; with it, hidden is
      // only known once the turn's trigger is passed, so it applies below.
      if (!limitCountsShown && buckets.size >= limit) continue;
      const ts = typeof entry.timestamp === "string" ? entry.timestamp : undefined;
      bucket = { chunks: [], timestamp: ts, ...(pendingCompaction ? { compactedAfter: true } : {}) };
      pendingCompaction = false;
      buckets.set(msgId, bucket);
      awaitingTrigger.push(bucket);
    }
    bucket.chunks.push({ texts, lineNum: i + 1 });
  }

  const messages: RenderedMessage[] = [];
  let shown = 0;
  for (const [messageId, b] of buckets) {
    // Walked backward, so reverse to restore chronological order within a message
    const chrono = b.chunks.slice().reverse();
    const text = chrono.flatMap((e) => e.texts).join("\n");
    const hidden = isHiddenMessage(text, b.automatic === true || toolUseIds.has(messageId));
    if (limitCountsShown && !hidden && shown >= limit) break;
    if (!hidden) shown++;
    messages.push({
      messageId,
      text,
      lineNumbers: chrono.map((e) => e.lineNum),
      timestamp: b.timestamp,
      ...(b.compactedAfter ? { compactedAfter: true } : {}),
      ...(hidden ? { hidden: true } : {}),
    });
  }
  return messages;
}

/**
 * High-level: read up to `limit` recent assistant messages from a session log.
 *
 * `activeBranchOnly` restricts the read to the live conversation branch, so a
 * `/rewind` doesn't surface orphaned messages, and follows the branch back
 * past compactions. Only meaningful for transcripts that carry
 * `uuid`/`parentUuid` (Claude Code); an untrustworthy or absent chain silently
 * degrades to a plain file-order read. `limitCountsShown` leaves hidden
 * messages out of the count.
 */
export function getRecentRenderedMessages(
  logPath: string,
  limit: number,
  opts: { activeBranchOnly?: boolean; limitCountsShown?: boolean } = {},
): RenderedMessage[] {
  try {
    const content = readFileSync(logPath, "utf-8");
    const entries = parseSessionLog(content);
    const branchIndices = opts.activeBranchOnly
      ? resolveActiveBranchIndices(entries)
      : null;
    return extractRecentRenderedMessages(entries, entries.length, limit, {
      branchIndices,
      limitCountsShown: opts.limitCountsShown,
    });
  } catch {
    return [];
  }
}

/**
 * The session a log belongs to, for resuming it: the id is the file name, the
 * cwd is the first one the log records (Claude Code finds the session from
 * the project folder of that directory), and the model is the one that wrote
 * the last assistant message. Null when no entry has a cwd.
 */
export function readSessionForResume(
  logPath: string,
): { sessionId: string; cwd: string; model?: string } | null {
  let text: string;
  try {
    text = readFileSync(logPath, "utf-8");
  } catch {
    return null;
  }
  let cwd: string | null = null;
  let model: string | undefined;
  for (const line of text.split("\n")) {
    const hasCwd = !cwd && line.includes('"cwd"');
    const hasModel = line.includes('"type":"assistant"') && line.includes('"model"');
    if (!hasCwd && !hasModel) continue;
    try {
      const entry = JSON.parse(line) as { cwd?: unknown; type?: unknown; message?: { model?: unknown } };
      if (hasCwd && typeof entry.cwd === "string" && entry.cwd) cwd = entry.cwd;
      const m = entry.type === "assistant" ? entry.message?.model : undefined;
      // Claude Code logs its own notices as "<synthetic>".
      if (typeof m === "string" && m && !m.startsWith("<")) model = m;
    } catch {
      // A partly written last line; keep looking.
    }
  }
  if (!cwd) return null;
  return { sessionId: basename(logPath, ".jsonl"), cwd, ...(model ? { model } : {}) };
}
