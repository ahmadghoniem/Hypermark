/**
 * Side chat endpoint tests
 *
 * Run: bun test src/server/side-chat.test.ts
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSideChatPrompt,
  collectToolCalls,
  handleSideChat,
  logSideChat,
  type SideChatToolCall,
  parseSideQuestion,
  MESSAGE_START,
  parseStreamLine,
  readRefusalExplanation,
  refusalAnswer,
  type SideChatRunner,
} from "./side-chat";
import { SIDE_CHAT_BASH_RULE } from "./side-chat-hook";

const SESSION = { sessionId: "abc", cwd: "/project" };

describe("side chat tool log", () => {
  test("collects tool calls and marks the refused ones", () => {
    const calls = new Map<string, SideChatToolCall>();
    const lines = [
      { type: "assistant", message: { content: [
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "rg -n foo src" } },
        { type: "tool_use", id: "t2", name: "Edit", input: { file_path: "src/a.ts", old_string: "a" } },
        { type: "tool_use", id: "t3", name: "ToolSearch", input: { max_results: 5 } },
      ] } },
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "t1", content: "src/a.ts:1:foo" },
        { type: "tool_result", tool_use_id: "t2", is_error: true, content: "read-only" },
      ] } },
      { type: "stream_event", event: { type: "message_start" } },
    ];
    for (const line of lines) collectToolCalls(JSON.stringify(line), calls);
    collectToolCalls("not json", calls);
    expect([...calls.values()]).toEqual([
      { tool: "Bash", detail: "rg -n foo src", refused: false },
      { tool: "Edit", detail: "src/a.ts", refused: true },
      { tool: "ToolSearch", refused: false },
    ]);
  });

  test("appends one record per question", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-side-chat-log-"));
    try {
      const question = { question: "Why?", quote: "a day", thread: [] };
      logSideChat(question, { ...SESSION, model: "opus" }, [{ tool: "Read", detail: "a.ts", refused: false }], dir);
      logSideChat({ ...question, quote: "" }, SESSION, [], dir);
      const records = readFileSync(join(dir, "side-chat-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ question: "Why?", quoted: true, followUp: false, model: "opus", tools: [{ tool: "Read" }] });
      expect(records[1]).toMatchObject({ quoted: false, tools: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function post(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/side-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal,
  });
}

describe("parseSideQuestion", () => {
  test("trims the question and keeps the thread", () => {
    expect(parseSideQuestion({
      question: "  why?  ",
      quote: "q",
      thread: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }],
    })).toEqual({ question: "why?", quote: "q", thread: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }] });
  });

  test("rejects an empty question, a missing quote, and a bad thread entry", () => {
    expect(parseSideQuestion({ question: "  ", quote: "", thread: [] })).toBeNull();
    expect(parseSideQuestion({ question: "why?", thread: [] })).toBeNull();
    expect(parseSideQuestion({ question: "why?", quote: "", thread: [{ role: "system", text: "x" }] })).toBeNull();
    expect(parseSideQuestion(null)).toBeNull();
  });
});

describe("buildSideChatPrompt", () => {
  test("quotes the passage, lists the earlier side chat, and ends with the question", () => {
    const prompt = buildSideChatPrompt({
      question: "And the cost?",
      quote: "line one\nline two",
      thread: [{ role: "user", text: "Why 24h?" }, { role: "assistant", text: "The daily peak." }],
    });
    expect(prompt).toContain("> line one\n> line two");
    expect(prompt).toContain("User: Why 24h?\n\nYou: The daily peak.");
    expect(prompt.endsWith("Question: And the cost?")).toBe(true);
  });

  test("starts with the side chat's read-only instructions", () => {
    const prompt = buildSideChatPrompt({ question: "Why?", quote: "", thread: [] });
    expect(prompt.startsWith("This is a side chat from Hypermark")).toBe(true);
    expect(prompt).toContain(SIDE_CHAT_BASH_RULE);
    expect(prompt).toContain("Editing files and starting agents are refused");
  });

  test("leaves out the passage and history when there are none", () => {
    const prompt = buildSideChatPrompt({ question: "Why?", quote: " ", thread: [] });
    expect(prompt).not.toContain(">");
    expect(prompt).not.toContain("Earlier in this side chat");
  });
});

describe("parseStreamLine", () => {
  test("returns the text of a text delta", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
    });
    expect(parseStreamLine(line)).toBe("Hi");
  });

  test("marks the start of a new assistant message", () => {
    expect(parseStreamLine(JSON.stringify({ type: "stream_event", event: { type: "message_start" } }))).toBe(MESSAGE_START);
  });

  test("returns the answer of a successful result", () => {
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: false, result: "Hi" }))).toEqual({ result: "Hi" });
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: false }))).toEqual({ result: "" });
  });

  test("skips the empty turn a resumed session runs for its stopped background tasks", () => {
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: false, num_turns: 0, result: "" }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: false, num_turns: 2, result: "Two." })))
      .toEqual({ result: "Two." });
  });

  test("ignores other events and lines that aren't JSON", () => {
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } },
    }))).toBeNull();
    expect(parseStreamLine("not json")).toBeNull();
  });

  test("marks a refusal, even one that comes as an error result", () => {
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: true, stop_reason: "refusal", result: "x" })))
      .toEqual({ result: "", refused: true });
  });

  test("throws the message of an error result", () => {
    expect(() => parseStreamLine(JSON.stringify({ type: "result", is_error: true, result: "No conversation found" })))
      .toThrow("No conversation found");
  });
});

describe("readRefusalExplanation", () => {
  test("reads the explanation of a refused assistant message", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { stop_reason: "refusal", stop_details: { explanation: "It asks for credentials." } },
    });
    expect(readRefusalExplanation(line)).toBe("It asks for credentials.");
  });

  test("reads the explanation of the refusal notice", () => {
    expect(readRefusalExplanation(JSON.stringify({
      type: "system", subtype: "model_refusal_no_fallback", api_refusal_explanation: "Not allowed.",
    }))).toBe("Not allowed.");
  });

  test("ignores other lines", () => {
    expect(readRefusalExplanation(JSON.stringify({ type: "assistant", message: { stop_reason: "end_turn" } }))).toBeNull();
    expect(readRefusalExplanation("not json")).toBeNull();
  });

  test("the answer names the refusal, with the reason when there is one", () => {
    expect(refusalAnswer("Not allowed.")).toBe("Claude declined to answer this. Not allowed.");
    expect(refusalAnswer(null)).toBe("Claude declined to answer this.");
  });
});

describe("handleSideChat", () => {
  const body = { question: "Why?", quote: "q", thread: [] };

  test("answers 501 without a session to resume", async () => {
    const res = await handleSideChat(post(body), undefined);
    expect(res.status).toBe(501);
  });

  test("answers 400 on an invalid body", async () => {
    const res = await handleSideChat(post("{"), SESSION, async function* () {});
    expect(res.status).toBe(400);
  });

  test("streams the runner's chunks as plain text, with the prompt and session it was given", async () => {
    let seen: { prompt: string; session: unknown } | null = null;
    const run: SideChatRunner = async function* (prompt, session) {
      seen = { prompt, session };
      yield "Because ";
      yield "of the peak.";
    };
    const res = await handleSideChat(post(body), SESSION, run);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("Because of the peak.");
    expect(seen!.session).toEqual(SESSION);
    expect(seen!.prompt.endsWith("Question: Why?")).toBe(true);
  });

  test("ends the stream with an error when the runner fails", async () => {
    const run: SideChatRunner = async function* () {
      yield "Partly";
      throw new Error("boom");
    };
    const res = await handleSideChat(post(body), SESSION, run);
    await expect(res.text()).rejects.toThrow();
  });

  test("cancelling the response aborts the runner", async () => {
    let signal: AbortSignal | null = null;
    const run: SideChatRunner = async function* (_prompt, _session, s) {
      signal = s;
      yield "first";
      await new Promise((r) => setTimeout(r, 1000));
      yield "never";
    };
    const res = await handleSideChat(post(body), SESSION, run);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(signal!.aborted).toBe(true);
  });

  test("aborting the request aborts the runner", async () => {
    const request = new AbortController();
    let signal: AbortSignal | null = null;
    const run: SideChatRunner = async function* (_prompt, _session, s) {
      signal = s;
      yield "first";
    };
    const res = await handleSideChat(post(body, request.signal), SESSION, run);
    await res.body!.getReader().read();
    request.abort();
    expect(signal!.aborted).toBe(true);
  });
});
