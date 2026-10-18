/**
 * Side chat (/btw) for annotate-last sessions.
 *
 * Each question resumes the reviewer's Claude Code session in print mode with
 * `--no-session-persistence`, on the session's own model: the answer sees the
 * whole conversation and nothing is written to the session. The session's
 * tools stay defined, since they lead the cached prompt and removing them
 * misses the session's prompt cache (about $0.85 instead of $0.06 per question
 * on a 120k-token Opus session); a PreToolUse hook blocks every call instead.
 * The reply's text streams back to the browser as it arrives.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SideChatSession {
  /** The Claude Code session the annotated message came from. */
  sessionId: string;
  /** The session's working directory; `--resume` looks the id up from here. */
  cwd: string;
  /** The model of the session's last reply; answering on it reuses its prompt cache. */
  model?: string;
}

export interface SideChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface SideQuestion {
  question: string;
  quote: string;
  thread: SideChatMessage[];
}

/** Streams the answer's text. Stops the model when `signal` aborts. */
export type SideChatRunner = (
  prompt: string,
  session: SideChatSession,
  signal: AbortSignal,
) => AsyncIterable<string>;

/**
 * Set by the e2e tests: answer with a fixed text instead of calling the model,
 * in any annotate session, including one on a file.
 */
export const SIDE_CHAT_STUB_ENV = "HYPERMARK_SIDE_CHAT_STUB";
export const SIDE_CHAT_STUB_ANSWER = "Because a full day covers the daily traffic peak.";

export function parseSideQuestion(body: unknown): SideQuestion | null {
  if (!body || typeof body !== "object") return null;
  const { question, quote, thread } = body as Record<string, unknown>;
  if (typeof question !== "string" || !question.trim()) return null;
  if (typeof quote !== "string") return null;
  if (!Array.isArray(thread)) return null;
  const messages: SideChatMessage[] = [];
  for (const m of thread) {
    if (!m || typeof m !== "object") return null;
    const { role, text } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    messages.push({ role, text });
  }
  return { question: question.trim(), quote, thread: messages };
}

export function buildSideChatPrompt({ question, quote, thread }: SideQuestion): string {
  const parts = [
    "This is a side question from Hypermark, where the user is annotating your last message. " +
      "Answer it briefly from what is already in this conversation. Don't use tools: the side chat blocks them. " +
      "Write plain text without Markdown. " +
      "Don't continue the task, and don't treat this as feedback on your message.",
  ];
  if (quote.trim()) {
    parts.push(`The question is about this passage:\n${quote.trim().split("\n").map((l) => `> ${l}`).join("\n")}`);
  }
  if (thread.length > 0) {
    const lines = thread.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`);
    parts.push(`Earlier in this side chat:\n${lines.join("\n\n")}`);
  }
  parts.push(`Question: ${question}`);
  return parts.join("\n\n");
}

/** What `parseStreamLine` returns for the start of a new assistant message. */
export const MESSAGE_START = Symbol("message start");

/**
 * Reads one line of `--output-format stream-json`. Returns the text delta it
 * carries, `MESSAGE_START`, or null. Throws when the line is an error result.
 */
export function parseStreamLine(line: string): string | typeof MESSAGE_START | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (event.type === "result" && event.is_error === true) {
    throw new Error(typeof event.result === "string" && event.result ? event.result : "The agent could not answer that");
  }
  if (event.type !== "stream_event") return null;
  const inner = event.event as { type?: string; delta?: { type?: string; text?: unknown } } | undefined;
  if (inner?.type === "message_start") return MESSAGE_START;
  if (inner?.type !== "content_block_delta" || inner.delta?.type !== "text_delta") return null;
  return typeof inner.delta.text === "string" ? inner.delta.text : null;
}

async function* splitLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) yield buffer;
}

/**
 * Ends the process and its children. On Windows `claude` is a `.cmd` wrapper,
 * and killing it leaves the `claude.exe` it started running.
 */
function killTree(proc: { pid: number; kill(): void }): void {
  if (process.platform === "win32") {
    Bun.spawn(["taskkill", "/pid", String(proc.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
  } else {
    proc.kill();
  }
}

let settingsPath: string | null = null;

/**
 * The `--settings` file whose hook refuses every tool call (exit code 2). A
 * file, since `claude.cmd` can't take JSON in its arguments on Windows.
 */
function blockToolsSettings(): string {
  if (!settingsPath) {
    settingsPath = join(tmpdir(), "hypermark-side-chat-settings.json");
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "exit 2" }] }] },
    }));
  }
  return settingsPath;
}

/** Runs `claude -p --resume` with the prompt on stdin. */
export const runClaudeSideChat: SideChatRunner = async function* (prompt, session, signal) {
  const proc = Bun.spawn(
    [
      "claude", "-p",
      ...(session.model ? ["--model", session.model] : []),
      "--resume", session.sessionId,
      "--no-session-persistence",
      "--settings", blockToolsSettings(),
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
    ],
    { cwd: session.cwd, stdin: "pipe", stdout: "pipe", stderr: "ignore" },
  );
  const kill = () => killTree(proc);
  signal.addEventListener("abort", kill, { once: true });
  try {
    proc.stdin.write(prompt);
    await proc.stdin.end();
    let answered = false;
    let newMessage = false;
    for await (const line of splitLines(proc.stdout)) {
      const text = parseStreamLine(line);
      if (text === MESSAGE_START) {
        newMessage = answered;
      } else if (text) {
        // The reply after a refused tool call starts a new paragraph.
        if (newMessage) yield "\n\n";
        newMessage = false;
        answered = true;
        yield text;
      }
    }
    const code = await proc.exited;
    if (!answered && !signal.aborted) {
      throw new Error(code === 0 ? "The agent gave no answer" : "The agent could not answer that");
    }
  } finally {
    signal.removeEventListener("abort", kill);
    if (proc.exitCode === null) killTree(proc);
  }
};

/** The e2e stub: the fixed answer in a few chunks, so the streaming state shows. */
export const stubSideChat: SideChatRunner = async function* (_prompt, _session, signal) {
  for (const word of SIDE_CHAT_STUB_ANSWER.split(/(?<= )/)) {
    if (signal.aborted) return;
    await Bun.sleep(40);
    yield word;
  }
};

export function defaultSideChatRunner(): SideChatRunner {
  return process.env[SIDE_CHAT_STUB_ENV] ? stubSideChat : runClaudeSideChat;
}

/**
 * POST /api/side-chat. Answers 501 when the session has no Claude session to
 * resume (a file, or a message read from stdin); otherwise streams the answer
 * as plain text. A failure after the first chunk ends the stream with an error.
 */
export async function handleSideChat(
  req: Request,
  sessionToResume: SideChatSession | undefined,
  run: SideChatRunner = defaultSideChatRunner(),
): Promise<Response> {
  const session = sessionToResume
    ?? (run === stubSideChat ? { sessionId: "stub", cwd: process.cwd() } : undefined);
  if (!session) return Response.json({ error: "Side chat isn't connected yet" }, { status: 501 });
  const question = parseSideQuestion(await req.json().catch(() => null));
  if (!question) return Response.json({ error: "Invalid request" }, { status: 400 });

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const chunks = run(buildSideChatPrompt(question), session, abort.signal)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      abort.abort();
      void chunks.return?.();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
