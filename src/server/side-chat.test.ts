/**
 * Side chat endpoint tests
 *
 * Run: bun test src/server/side-chat.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  buildSideChatPrompt,
  handleSideChat,
  parseSideQuestion,
  MESSAGE_START,
  parseStreamLine,
  type SideChatRunner,
} from "./side-chat";

const SESSION = { sessionId: "abc", cwd: "/project" };

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

  test("ignores other events, a successful result, and lines that aren't JSON", () => {
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } },
    }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: false, result: "Hi" }))).toBeNull();
    expect(parseStreamLine("not json")).toBeNull();
  });

  test("throws the message of an error result", () => {
    expect(() => parseStreamLine(JSON.stringify({ type: "result", is_error: true, result: "No conversation found" })))
      .toThrow("No conversation found");
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
