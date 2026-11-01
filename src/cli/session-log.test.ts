/**
 * Session Log Parser Tests
 *
 * Run: bun test src/cli/session-log.test.ts
 *
 * Uses synthetic JSONL fixtures modeled after real Claude Code session logs.
 * Each test builds a minimal log and verifies the extraction logic.
 */

import { describe, expect, test } from "bun:test";
import {
  parseSessionLog,
  isHumanPrompt,
  extractRecentRenderedMessages,
  getRecentRenderedMessages,
  isHiddenMessage,
  resolveActiveBranchIndices,
  describeClaudeSessionResolutionFailure,
  projectSlugFromCwd,
  resolveClaudeSessionLog,
  readSessionForResume,
  type SessionLogEntry,
} from "./session-log";
import { chmodSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// --- Fixture Helpers ---

/** Minimal assistant entry with text content */
function assistantText(
  msgId: string,
  text: string,
  opts: { stopReason?: string | null } = {}
): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      id: msgId,
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: opts.stopReason ?? null,
    },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** Assistant entry with only a tool_use block (no text) */
function assistantToolUse(
  msgId: string,
  toolName: string,
  opts: { stopReason?: string } = {}
): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      id: msgId,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().slice(0, 12)}`,
          name: toolName,
          input: {},
        },
      ],
      stop_reason: opts.stopReason ?? "tool_use",
    },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** Assistant entry with both text and tool_use */
function assistantTextAndToolUse(
  msgId: string,
  text: string,
  toolName: string
): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      id: msgId,
      role: "assistant",
      content: [
        { type: "text", text },
        {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().slice(0, 12)}`,
          name: toolName,
          input: {},
        },
      ],
      stop_reason: "tool_use",
    },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** Human user prompt (string content) */
function userPrompt(text: string): string {
  return JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
    promptId: crypto.randomUUID(),
  });
}

/** Tool result (array content — NOT a human prompt) */
function userToolResult(toolUseId: string, output: string): string {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        { tool_use_id: toolUseId, type: "tool_result", content: output },
      ],
    },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** Progress entry (sub-agent noise) */
function progress(subtype: string = "agent_progress"): string {
  return JSON.stringify({
    type: "progress",
    data: { type: subtype },
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** System entry (hook summary, etc.) */
function systemEntry(subtype: string = "stop_hook_summary"): string {
  return JSON.stringify({
    type: "system",
    subtype,
    uuid: crypto.randomUUID(),
    parentUuid: crypto.randomUUID(),
  });
}

/** File history snapshot */
function fileSnapshot(): string {
  return JSON.stringify({
    type: "file-history-snapshot",
    uuid: crypto.randomUUID(),
  });
}

/** Queue operation (background agent completed) */
function queueOp(): string {
  return JSON.stringify({
    type: "queue-operation",
    uuid: crypto.randomUUID(),
  });
}

/** Bookkeeping entry with no id at all — Claude Code often writes these last. */
function lastPromptEntry(lastPrompt: string, leafUuid: string): string {
  return JSON.stringify({ type: "last-prompt", lastPrompt, leafUuid });
}

/**
 * Link fixture lines into one parent chain, the way Claude Code records a
 * conversation. The individual helpers assign random `parentUuid`s, which would
 * otherwise leave every entry an orphan and make branch resolution untestable.
 * Entries with no `uuid` (bookkeeping types) are passed through untouched.
 */
function linkChain(lines: string[], parentUuid: string | null = null): string[] {
  let previous = parentUuid;
  return lines.map((line) => {
    const entry = JSON.parse(line);
    if (typeof entry.uuid !== "string") {
      return JSON.stringify(entry);
    }
    entry.parentUuid = previous;
    previous = entry.uuid;
    return JSON.stringify(entry);
  });
}

/** Last `uuid` in a set of already-linked lines. */
function tailUuid(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const entry = JSON.parse(lines[i]);
    if (typeof entry.uuid === "string") {
      return entry.uuid;
    }
  }
  throw new Error("no id-bearing entry in lines");
}

function buildLog(...lines: string[]): string {
  return linkChain(lines).join("\n");
}

/**
 * A log recording a `/rewind`. `kept` runs to the rewind target, `abandoned` is
 * orphaned by the rewind but stays in the file, and `resumed` re-parents back to
 * the target. File order stays kept → abandoned → resumed, because the
 * transcript is append-only and the rewind itself writes nothing.
 */
function buildRewoundLog(opts: {
  kept: string[];
  abandoned: string[];
  resumed: string[];
}): string {
  const kept = linkChain(opts.kept);
  const forkPoint = tailUuid(kept);
  return [
    ...kept,
    ...linkChain(opts.abandoned, forkPoint),
    ...linkChain(opts.resumed, forkPoint),
  ].join("\n");
}

// --- Tests ---

describe("projectSlugFromCwd", () => {
  test("converts Unix absolute path to slug", () => {
    expect(projectSlugFromCwd("/Users/alex/example/example-app/feat-annotate-last")).toBe(
      "-Users-alex-example-example-app-feat-annotate-last"
    );
  });

  test("handles root path", () => {
    expect(projectSlugFromCwd("/")).toBe("-");
  });

  test("converts Windows backslashes to dashes", () => {
    expect(projectSlugFromCwd("C:\\Users\\alexey\\Documents\\project")).toBe(
      "C--Users-alexey-Documents-project"
    );
  });

  test("converts non-ASCII characters (Cyrillic) to dashes", () => {
    expect(projectSlugFromCwd("C:\\Users\\alexey\\Documents\\1С_конфигурации\\ERP_Medicine")).toBe(
      "C--Users-alexey-Documents-1---------------ERP-Medicine"
    );
  });

  test("converts underscores to dashes", () => {
    expect(projectSlugFromCwd("/home/user/my_project")).toBe(
      "-home-user-my-project"
    );
  });

  test("preserves hyphens and alphanumeric characters", () => {
    expect(projectSlugFromCwd("/home/user/my-project-123")).toBe(
      "-home-user-my-project-123"
    );
  });

  test("converts spaces and special characters to dashes", () => {
    expect(projectSlugFromCwd("/home/user/my project (v2)")).toBe(
      "-home-user-my-project--v2-"
    );
  });

  test("replaces dots in path components (e.g. .worktrees)", () => {
    expect(projectSlugFromCwd("/Users/alex/project/.worktrees/my-branch")).toBe(
      "-Users-alex-project--worktrees-my-branch"
    );
  });

  test("replaces underscores in path components (e.g. feat_branch)", () => {
    expect(projectSlugFromCwd("/Users/alex/project/.worktrees/feat_ticket-1234-desc")).toBe(
      "-Users-alex-project--worktrees-feat-ticket-1234-desc"
    );
  });

  test("handles path with mixed special characters", () => {
    expect(projectSlugFromCwd("/Users/alex/Code/org/apa/.worktrees/feat_ticket-2506-agent-scaffolding")).toBe(
      "-Users-alex-Code-org-apa--worktrees-feat-ticket-2506-agent-scaffolding"
    );
  });
});

describe("isHumanPrompt", () => {
  test("identifies human prompt (string content)", () => {
    const entry = JSON.parse(userPrompt("hello"));
    expect(isHumanPrompt(entry)).toBe(true);
  });

  test("rejects tool result (array content)", () => {
    const entry = JSON.parse(userToolResult("toolu_123", "output"));
    expect(isHumanPrompt(entry)).toBe(false);
  });

  test("rejects assistant entries", () => {
    const entry = JSON.parse(assistantText("msg_1", "hello"));
    expect(isHumanPrompt(entry)).toBe(false);
  });
});

describe("extractRecentRenderedMessages (picker)", () => {
  test("returns newest-first across turn boundaries", () => {
    // Multiple turns — picker must surface assistant bubbles from all of them,
    // not stop at the most recent turn boundary like extractLastRenderedMessage does.
    const log = buildLog(
      userPrompt("first"),
      assistantText("msg_1", "First response"),
      userPrompt("second"),
      assistantText("msg_2", "Second response"),
      userPrompt("third"),
      assistantText("msg_3", "Third response"),
    );
    const entries = parseSessionLog(log);
    const result = extractRecentRenderedMessages(entries, entries.length, 5);
    expect(result.map((m) => m.text)).toEqual([
      "Third response",
      "Second response",
      "First response",
    ]);
    expect(result.map((m) => m.messageId)).toEqual(["msg_3", "msg_2", "msg_1"]);
  });

  test("honors limit", () => {
    const log = buildLog(
      userPrompt("first"),
      assistantText("a", "A"),
      userPrompt("second"),
      assistantText("b", "B"),
      userPrompt("third"),
      assistantText("c", "C"),
    );
    const entries = parseSessionLog(log);
    const result = extractRecentRenderedMessages(entries, entries.length, 2);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.text)).toEqual(["C", "B"]);
  });

  test("empty log → empty list", () => {
    const result = extractRecentRenderedMessages([], 0, 5);
    expect(result).toEqual([]);
  });

  test("limit of zero → empty list", () => {
    const log = buildLog(userPrompt("first"), assistantText("a", "A"));
    const entries = parseSessionLog(log);
    expect(extractRecentRenderedMessages(entries, entries.length, 0)).toEqual([]);
  });

  test("skips assistant entries with no text (tool_use only)", () => {
    const log = buildLog(
      userPrompt("first"),
      assistantText("msg_1", "Hello"),
      assistantToolUse("msg_tool", "Bash"),
      userPrompt("second"),
      assistantText("msg_2", "World"),
    );
    const entries = parseSessionLog(log);
    const result = extractRecentRenderedMessages(entries, entries.length, 5);
    expect(result.map((m) => m.text)).toEqual(["World", "Hello"]);
  });
});

describe("resolveActiveBranchIndices", () => {
  test("a linear log puts every id-bearing entry on the branch", () => {
    const log = buildLog(
      userPrompt("first"),
      assistantText("msg_1", "First response"),
      userPrompt("second"),
      assistantText("msg_2", "Second response"),
    );
    const entries = parseSessionLog(log);
    expect(resolveActiveBranchIndices(entries)).toEqual(new Set([0, 1, 2, 3]));
  });

  test("a rewind drops the orphaned entries", () => {
    const log = buildRewoundLog({
      kept: [userPrompt("keep me"), assistantText("msg_keep", "Kept")],
      abandoned: [userPrompt("rewound away"), assistantText("msg_gone", "Orphaned")],
      resumed: [userPrompt("after rewind")],
    });
    const entries = parseSessionLog(log);
    // Lines 2 and 3 are the abandoned branch; they stay in the file but are
    // not part of the conversation any more.
    expect(resolveActiveBranchIndices(entries)).toEqual(new Set([0, 1, 4]));
  });

  test("walks back from a tail that carries no id", () => {
    // Claude Code frequently writes a `last-prompt` entry as the final line.
    const linked = linkChain([
      userPrompt("first"),
      assistantText("msg_1", "Response"),
    ]);
    const log = [...linked, lastPromptEntry("first", tailUuid(linked))].join("\n");
    const entries = parseSessionLog(log);
    expect(resolveActiveBranchIndices(entries)).toEqual(new Set([0, 1]));
  });

  test("null when entries carry no ids at all", () => {
    const entries = parseSessionLog(
      [
        JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
        JSON.stringify({
          type: "assistant",
          message: { id: "m", role: "assistant", content: [{ type: "text", text: "yo" }] },
        }),
      ].join("\n"),
    );
    expect(resolveActiveBranchIndices(entries)).toBeNull();
  });

  test("null when the chain dead-ends instead of reaching the root", () => {
    // Unlinked lines: each helper assigns a random parentUuid that matches
    // nothing in the file. A partial walk must not be mistaken for a branch.
    const log = [userPrompt("first"), assistantText("msg_1", "Response")].join("\n");
    const entries = parseSessionLog(log);
    expect(resolveActiveBranchIndices(entries)).toBeNull();
  });

  test("null on a cycle", () => {
    const a = JSON.stringify({ type: "user", message: { role: "user", content: "a" }, uuid: "u-a", parentUuid: "u-b" });
    const b = JSON.stringify({ type: "user", message: { role: "user", content: "b" }, uuid: "u-b", parentUuid: "u-a" });
    expect(resolveActiveBranchIndices(parseSessionLog([a, b].join("\n")))).toBeNull();
  });

  test("empty log → null", () => {
    expect(resolveActiveBranchIndices([])).toBeNull();
  });
});

describe("extractRecentRenderedMessages — after a rewind", () => {
  const rewoundLog = () =>
    buildRewoundLog({
      kept: [
        userPrompt("are the remotes named weirdly?"),
        assistantText("msg_target", "They're inverted from the GitHub convention."),
      ],
      abandoned: [
        userPrompt("nah, use the standard convention"),
        assistantText("msg_orphan", "Pushed. All three are on 68c1291c."),
      ],
      resumed: [userPrompt("/hypermark-last")],
    });

  test("the default pick is the live message, not the orphan", () => {
    const entries = parseSessionLog(rewoundLog());
    const result = extractRecentRenderedMessages(entries, entries.length, 25, {
      branchIndices: resolveActiveBranchIndices(entries),
    });
    expect(result[0].messageId).toBe("msg_target");
    expect(result.map((m) => m.messageId)).not.toContain("msg_orphan");
  });

  test("orphaned messages are absent from the picker list", () => {
    const entries = parseSessionLog(rewoundLog());
    const result = extractRecentRenderedMessages(entries, entries.length, 25, {
      branchIndices: resolveActiveBranchIndices(entries),
    });
    expect(result).toHaveLength(1);
  });

  test("without branchIndices the orphan still wins (unchanged file-order read)", () => {
    // Documents the plain file-order read, and the bug branchIndices fixes.
    const entries = parseSessionLog(rewoundLog());
    const result = extractRecentRenderedMessages(entries, entries.length, 25);
    expect(result[0].messageId).toBe("msg_orphan");
  });

  test("line numbers still point at real file positions", () => {
    const entries = parseSessionLog(rewoundLog());
    const result = extractRecentRenderedMessages(entries, entries.length, 25, {
      branchIndices: resolveActiveBranchIndices(entries),
    });
    // msg_target is file line 2 (index 1), even though lines 3-4 were skipped.
    expect(result[0].lineNumbers).toEqual([2]);
  });

  test("an untrustworthy chain degrades to the file-order read", () => {
    // resolveActiveBranchIndices returns null here; passing it through must not
    // filter everything out.
    const log = [userPrompt("first"), assistantText("msg_1", "Response")].join("\n");
    const entries = parseSessionLog(log);
    const result = extractRecentRenderedMessages(entries, entries.length, 25, {
      branchIndices: resolveActiveBranchIndices(entries),
    });
    expect(result.map((m) => m.messageId)).toEqual(["msg_1"]);
  });
});

describe("getRecentRenderedMessages — across compactions", () => {
  // A compact boundary is a new root (`parentUuid: null`) whose
  // `logicalParentUuid` is the last entry before the compaction.
  const boundary = (uuid: string, logicalParentUuid: string | null) =>
    JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      uuid,
      parentUuid: null,
      ...(logicalParentUuid ? { logicalParentUuid } : {}),
    });
  const summary = (uuid: string, parentUuid: string) =>
    JSON.stringify({
      type: "user",
      isCompactSummary: true,
      message: { role: "user", content: "Summary of the conversation so far" },
      uuid,
      parentUuid,
    });
  const turns = (ids: string[], parentUuid: string | null) =>
    linkChain(ids.flatMap((id) => [userPrompt(`ask ${id}`), assistantText(id, `Answer ${id}`)]), parentUuid);

  /**
   * Segments of answers with a compaction between each pair. `brokenLink`
   * points every boundary at an entry that isn't in the log.
   */
  function compactedLog(segments: string[][], opts: { brokenLink?: boolean } = {}): string {
    const lines: string[] = [];
    let parent: string | null = null;
    segments.forEach((ids, n) => {
      if (n > 0) {
        lines.push(boundary(`u-compact-${n}`, opts.brokenLink ? "u-not-in-log" : parent));
        lines.push(summary(`u-summary-${n}`, `u-compact-${n}`));
        parent = `u-summary-${n}`;
      }
      const chain = turns(ids, parent);
      lines.push(...chain);
      if (chain.length > 0) parent = tailUuid(chain);
    });
    return lines.join("\n");
  }

  function read(log: string, limit = 20) {
    const dir = join(tmpdir(), `hypermark-compact-${process.pid}-${crypto.randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "session.jsonl");
    try {
      writeFileSync(logPath, log);
      return getRecentRenderedMessages(logPath, limit, { activeBranchOnly: true })
        .map((m) => (m.compactedAfter ? `${m.messageId}|` : m.messageId));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("the active branch continues through a compact boundary", () => {
    const entries = parseSessionLog(compactedLog([["a1"], ["b1"]]));
    expect(resolveActiveBranchIndices(entries)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  // `|` marks a message with a compaction after it.
  test("lists the messages from before a compaction after the newer ones", () => {
    expect(read(compactedLog([["a1", "a2"], ["b1"]]))).toEqual(["b1", "a2|", "a1"]);
  });

  test("right after a compaction, lists the messages from before it", () => {
    expect(read(compactedLog([["a1", "a2"], []]))).toEqual(["a2|", "a1"]);
  });

  test("goes back through several compactions", () => {
    expect(read(compactedLog([["a1"], ["b1"], ["c1"]]))).toEqual(["c1", "b1|", "a1|"]);
  });

  test("stops at the cap before reaching a compaction", () => {
    expect(read(compactedLog([["a1"], ["b1", "b2", "b3"]]), 2)).toEqual(["b3", "b2"]);
  });

  test("stops at the cap partway through the messages before a compaction", () => {
    expect(read(compactedLog([["a1", "a2", "a3"], ["b1"]]), 3)).toEqual(["b1", "a3|", "a2"]);
  });

  test("leaves out messages a /rewind discarded before the compaction", () => {
    const kept = turns(["a_keep"], null);
    const discarded = turns(["a_gone"], tailUuid(kept));
    const resumed = turns(["a_resumed"], tailUuid(kept));
    const log = [
      ...kept,
      ...discarded,
      ...resumed,
      boundary("u-compact", tailUuid(resumed)),
      summary("u-summary", "u-compact"),
      ...turns(["b1"], "u-summary"),
    ].join("\n");
    expect(read(log)).toEqual(["b1", "a_resumed|", "a_keep"]);
  });

  test("leaves out messages a /rewind discarded after the compaction", () => {
    const before = turns(["a1"], null);
    const kept = turns(["b_keep"], "u-summary");
    const log = [
      ...before,
      boundary("u-compact", tailUuid(before)),
      summary("u-summary", "u-compact"),
      ...kept,
      ...turns(["b_gone"], tailUuid(kept)),
      ...turns(["b_new"], tailUuid(kept)),
    ].join("\n");
    expect(read(log)).toEqual(["b_new", "b_keep", "a1|"]);
  });

  test("stops at a compaction whose link back is missing", () => {
    expect(read(compactedLog([["a1"], ["b1"]], { brokenLink: true }))).toEqual(["b1"]);
    expect(read(compactedLog([["a1"], []], { brokenLink: true }))).toEqual([]);
  });
});

describe("isHiddenMessage", () => {
  const status = "The agent finished.\n\n" + "It found one issue in the parser. ".repeat(6);

  test("hides system lines of any length", () => {
    expect(isHiddenMessage("API Error: 529 overloaded", false)).toBe(true);
    expect(isHiddenMessage("[Request interrupted by user]", false)).toBe(true);
    expect(isHiddenMessage(`You've hit your limit. ${"x".repeat(300)}`, false)).toBe(true);
  });

  test("hides one unstructured paragraph up to 200 characters", () => {
    expect(isHiddenMessage("  No feedback.  ", false)).toBe(true);
    expect(isHiddenMessage("Done.\nTests pass.", false)).toBe(true);
    expect(isHiddenMessage("a".repeat(200), false)).toBe(true);
    expect(isHiddenMessage("a".repeat(201), false)).toBe(false);
    expect(isHiddenMessage("Done.\n\nTests pass.", false)).toBe(false);
  });

  test("keeps structured text", () => {
    expect(isHiddenMessage("- one\n- two", false)).toBe(false);
    expect(isHiddenMessage("## Done", true)).toBe(false);
    expect(isHiddenMessage("```\nls\n```", true)).toBe(false);
  });

  test("hides automatic status notes up to two paragraphs and 450 characters", () => {
    expect(isHiddenMessage(status, true)).toBe(true);
    expect(isHiddenMessage(status, false)).toBe(false);
    expect(isHiddenMessage(`${status}\n\nThird paragraph.`, true)).toBe(false);
    expect(isHiddenMessage("a".repeat(300) + "\n\n" + "b".repeat(151), true)).toBe(false);
  });
});

describe("extractRecentRenderedMessages — hidden messages", () => {
  const status = "The monitor reports a finished run.\n\n" + "Everything matched the last baseline. ".repeat(5);
  const notification = (text: string) =>
    JSON.stringify({
      type: "user",
      origin: { kind: "task-notification" },
      message: { role: "user", content: `<task-notification>${text}</task-notification>` },
      uuid: crypto.randomUUID(),
    });
  // `~` marks a hidden message.
  const readAll = (log: string, limit: number, limitCountsShown = false) => {
    const entries = parseSessionLog(log);
    return extractRecentRenderedMessages(entries, entries.length, limit, { limitCountsShown })
      .map((m) => (m.hidden ? `${m.messageId}~` : m.messageId));
  };

  test("a status note is hidden after a notification, shown after the user's prompt", () => {
    const log = buildLog(
      userPrompt("check the run"),
      assistantText("m_user", status),
      notification("run finished"),
      assistantText("m_monitor", status),
    );
    expect(readAll(log, 5)).toEqual(["m_monitor~", "m_user"]);
  });

  test("a status note written mid-turn is hidden", () => {
    const log = buildLog(
      userPrompt("fix it"),
      assistantTextAndToolUse("m_mid", status, "Bash"),
      userToolResult("toolu_x", "ok"),
      assistantText("m_end", status),
    );
    expect(readAll(log, 5)).toEqual(["m_end", "m_mid~"]);
  });

  test("a skill body counts as automatic", () => {
    const skill = JSON.stringify({
      type: "user",
      isMeta: true,
      message: { role: "user", content: "Skill instructions" },
      uuid: crypto.randomUUID(),
    });
    const log = buildLog(userPrompt("<command-name>/hypermark-last</command-name>"), skill, assistantText("m", status));
    expect(readAll(log, 5)).toEqual(["m~"]);
  });

  test("with limitCountsShown, hidden messages don't use up the cap", () => {
    const long = "A real answer.\n\nWith a second paragraph that makes it long enough to keep.";
    const log = buildLog(
      userPrompt("one"),
      assistantText("a", long),
      userPrompt("two"),
      assistantText("b", long),
      userPrompt("three"),
      assistantText("c", "OK."),
      userPrompt("four"),
      assistantText("d", long),
    );
    expect(readAll(log, 2)).toEqual(["d", "c~"]);
    expect(readAll(log, 2, true)).toEqual(["d", "c~", "b"]);
  });
});

describe("parseSessionLog", () => {
  test("skips malformed lines", () => {
    const log = '{"type":"user"}\nnot json\n{"type":"assistant"}';
    const entries = parseSessionLog(log);
    expect(entries).toHaveLength(2);
  });

  test("handles empty input", () => {
    expect(parseSessionLog("")).toHaveLength(0);
  });
});

/** Build an isolated projects dir under tmpdir for a test. */
function makeTempDirs(label: string): {
  projectsDir: string;
  cleanup: () => void;
} {
  const base = join(tmpdir(), `hypermark-resolver-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const projectsDir = join(base, "projects");
  mkdirSync(projectsDir, { recursive: true });
  return {
    projectsDir,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/** Create a session jsonl for a given cwd + sessionId. */
function writeSessionLog(
  projectsDir: string,
  cwd: string,
  sessionId: string,
  content = '{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"hi"}]}}\n'
): string {
  const slug = cwd.replace(/[^a-zA-Z0-9-]/g, "-");
  const dir = join(projectsDir, slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  writeFileSync(path, content);
  return path;
}


describe("resolveClaudeSessionLog", () => {
  /** Run with CLAUDE_CODE_SESSION_ID set to `value` (or unset), restoring it after. */
  function withSessionEnv<T>(value: string | undefined, run: () => T): T {
    const previous = process.env.CLAUDE_CODE_SESSION_ID;
    if (value === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = value;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = previous;
    }
  }

  test("reads CLAUDE_CODE_SESSION_ID by default", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-default");
    try {
      const cwd = "/tmp/env";
      const logPath = writeSessionLog(projectsDir, cwd, "session-env");
      expect(withSessionEnv("session-env", () => resolveClaudeSessionLog({ cwd, projectsDir }))).toEqual({
        status: "identified",
        sessionId: "session-env",
        logPath,
      });
    } finally {
      cleanup();
    }
  });

  test("returns unavailable without a session id", () => {
    expect(withSessionEnv(undefined, () => resolveClaudeSessionLog())).toEqual({ status: "unavailable" });
  });

  test("finds the log in the cwd's project folder (after /cd)", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-cwd");
    try {
      writeSessionLog(projectsDir, "/tmp/start", "session-start");
      const logPath = writeSessionLog(projectsDir, "/tmp/moved", "session-a");
      expect(resolveClaudeSessionLog({ sessionId: "session-a", cwd: "/tmp/moved", projectsDir })).toEqual({
        status: "identified",
        sessionId: "session-a",
        logPath,
      });
    } finally {
      cleanup();
    }
  });

  test("takes the cwd folder's log over a copy in another folder", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-cwd-wins");
    try {
      writeSessionLog(projectsDir, "/tmp/other", "session-a");
      const logPath = writeSessionLog(projectsDir, "/tmp/here", "session-a");
      expect(resolveClaudeSessionLog({ sessionId: "session-a", cwd: "/tmp/here", projectsDir }))
        .toMatchObject({ logPath });
    } finally {
      cleanup();
    }
  });

  test("matches the cwd folder when the drive letter's case differs", () => {
    if (process.platform !== "win32" && process.platform !== "darwin") return;
    const { projectsDir, cleanup } = makeTempDirs("env-cwd-case");
    try {
      writeSessionLog(projectsDir, "C:\\Users\\Admin\\proj", "session-a");
      const resolution = resolveClaudeSessionLog({
        sessionId: "session-a",
        cwd: "c:\\Users\\Admin\\proj",
        projectsDir,
      });
      expect(resolution).toMatchObject({ status: "identified" });
      expect(resolution.status === "identified" && resolution.logPath).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  test("finds a session resumed from another directory in its original folder", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-scan");
    try {
      const logPath = writeSessionLog(projectsDir, "/tmp/launch", "session-a");
      expect(resolveClaudeSessionLog({ sessionId: "session-a", cwd: "/tmp/elsewhere", projectsDir })).toEqual({
        status: "identified",
        sessionId: "session-a",
        logPath,
      });
    } finally {
      cleanup();
    }
  });

  test("accepts a dotted session id", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-dotted");
    try {
      const logPath = writeSessionLog(projectsDir, "/tmp/dotted", "session.v1");
      expect(resolveClaudeSessionLog({ sessionId: "session.v1", cwd: "/tmp/dotted", projectsDir }))
        .toMatchObject({ logPath });
    } finally {
      cleanup();
    }
  });

  test.each(["../escape", "bad\\session", "bad/session", "bad\0session"])(
    "rejects malformed session id %p",
    (sessionId) => {
      const { projectsDir, cleanup } = makeTempDirs("env-malformed");
      try {
        expect(resolveClaudeSessionLog({ sessionId, cwd: "/tmp/x", projectsDir }))
          .toMatchObject({ logPath: null, reason: "invalid-id" });
      } finally {
        cleanup();
      }
    },
  );

  test("reports a missing log", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-missing");
    try {
      writeSessionLog(projectsDir, "/tmp/other", "session-other");
      expect(resolveClaudeSessionLog({ sessionId: "session-missing", cwd: "/tmp/x", projectsDir })).toEqual({
        status: "identified",
        sessionId: "session-missing",
        logPath: null,
        reason: "missing",
      });
    } finally {
      cleanup();
    }
  });

  test("refuses a log found in two folders other than the cwd's", () => {
    const { projectsDir, cleanup } = makeTempDirs("env-duplicate");
    try {
      writeSessionLog(projectsDir, "/tmp/first", "session-a");
      writeSessionLog(projectsDir, "/tmp/second", "session-a");
      expect(resolveClaudeSessionLog({ sessionId: "session-a", cwd: "/tmp/x", projectsDir }))
        .toMatchObject({ logPath: null, reason: "duplicate" });
    } finally {
      cleanup();
    }
  });

  test("reports an unreadable log", () => {
    if (process.platform === "win32") return;
    const { projectsDir, cleanup } = makeTempDirs("env-unreadable");
    try {
      const logPath = writeSessionLog(projectsDir, "/tmp/locked", "session-a");
      chmodSync(logPath, 0o000);
      expect(resolveClaudeSessionLog({ sessionId: "session-a", cwd: "/tmp/locked", projectsDir }))
        .toMatchObject({ logPath: null, reason: "unreadable" });
    } finally {
      cleanup();
    }
  });
});

describe("describeClaudeSessionResolutionFailure", () => {
  test("explains a missing session id", () => {
    expect(describeClaudeSessionResolutionFailure({ status: "unavailable" })).toContain(
      "CLAUDE_CODE_SESSION_ID is not set",
    );
  });

  test.each(["invalid-id", "missing", "duplicate", "unreadable"] as const)(
    "names the session for reason %p",
    (reason) => {
      expect(describeClaudeSessionResolutionFailure({
        status: "identified",
        sessionId: "session-fresh",
        logPath: null,
        reason,
      })).toContain("session-fresh");
    },
  );

  test("adds nothing when the transcript exists", () => {
    expect(describeClaudeSessionResolutionFailure({
      status: "identified",
      sessionId: "session-a",
      logPath: "/tmp/session-a.jsonl",
    })).toBeNull();
  });
});

describe("readSessionForResume", () => {
  test("takes the id from the file name, the first cwd, and the model of the last assistant message", () => {
    const dir = join(tmpdir(), `hypermark-resume-test-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "1f2e3d4c-session.jsonl");
    try {
      writeFileSync(logPath, [
        JSON.stringify({ type: "summary", summary: "x" }),
        JSON.stringify({ type: "user", cwd: "/work/project", message: { role: "user", content: "hi" } }),
        JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-haiku-5-5", content: [] } }),
        JSON.stringify({ type: "user", cwd: "/elsewhere", message: { role: "user", content: "later" } }),
        JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-5-5", content: [] } }),
        JSON.stringify({ type: "assistant", message: { role: "assistant", model: "<synthetic>", content: [] } }),
      ].join("\n"));
      expect(readSessionForResume(logPath)).toEqual({
        sessionId: "1f2e3d4c-session",
        cwd: "/work/project",
        model: "claude-opus-5-5",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns null for a missing file", () => {
    expect(readSessionForResume(join(tmpdir(), "hypermark-no-such-log.jsonl"))).toBeNull();
  });
});
