/**
 * Side chat (/sidechat) for annotate-last sessions.
 *
 * Each question resumes the reviewer's Claude Code session in print mode with
 * `--no-session-persistence`, on the session's own model: the answer sees the
 * whole conversation and nothing is written to the session. The session's
 * tools stay defined, since they lead the cached prompt and removing them
 * misses the session's prompt cache (about $0.85 instead of $0.06 per question
 * on a 120k-token Opus session); a PreToolUse hook (`side-chat-hook.ts`) lets
 * only read-only calls run instead. `--append-system-prompt` isn't applied on
 * `--resume`, so the side chat's instructions lead the question on stdin.
 * The reply's text streams back to the browser as it arrives. Each question and
 * the tools it called are appended to `side-chat-log.jsonl` in the data dir.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getHypermarkDataDir } from "@/shared/data-dir";
import { SIDE_CHAT_BASH_RULE } from "./side-chat-hook";

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

/** One tool call in a side chat, with what it read or ran. */
export interface SideChatToolCall {
  tool: string;
  /** The command, path, pattern, query or URL. */
  detail?: string;
  refused: boolean;
}

/**
 * Streams the answer's text. Stops the model when `signal` aborts. Calls
 * `onToolCalls` once the answer ends, with the tool calls it made.
 */
export type SideChatRunner = (
  prompt: string,
  session: SideChatSession,
  signal: AbortSignal,
  onToolCalls?: (calls: SideChatToolCall[]) => void,
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
    "This is a side chat from Hypermark: the user is reading your last message and asks a question about it. " +
      "This exchange isn't saved to the session, so the main conversation won't have it and can't follow up on it.",
    // The session is usually waiting on /hypermark-last, whose instructions sit just above this.
    "If a Hypermark instruction above asks you to respond to feedback or carry out requests, " +
      "it applies once the user sends their annotations. " +
      "Here, answer the question without revising your message or continuing the work.",
    "Your answer appears under the question in the comment box, and the user can continue in a side chat to ask follow-ups. " +
      "Lead with the answer, with no preamble, recap or offer of further help, and keep it to the length the question needs; " +
      "add detail or steps when the question asks for them.",
    `You can read files and search code and the web. ${SIDE_CHAT_BASH_RULE} ` +
      "Editing files and starting agents are refused too, so instructions about editing files don't apply here.",
    "Write plain text: the answer is shown as typed, so Markdown would appear as raw symbols.",
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

/** What `parseStreamLine` returns for the `result` event that ends the answer. */
export interface StreamResult {
  /** The whole answer's text, which the text deltas already carried. */
  result: string;
  /** The model declined to answer. */
  refused?: boolean;
}

/**
 * The reason the model gives for declining, from the assistant message that
 * stopped on a refusal or the `model_refusal_no_fallback` notice; null for
 * any other line.
 */
export function readRefusalExplanation(line: string): string | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (event.type === "assistant") {
    const message = event.message as { stop_reason?: unknown; stop_details?: { explanation?: unknown } } | undefined;
    const explanation = message?.stop_details?.explanation;
    return message?.stop_reason === "refusal" && typeof explanation === "string" && explanation ? explanation : null;
  }
  if (event.type === "system" && event.subtype === "model_refusal_no_fallback") {
    const explanation = event.api_refusal_explanation ?? event.content;
    return typeof explanation === "string" && explanation ? explanation : null;
  }
  return null;
}

/** The answer a declined question shows, in place of an error. */
export function refusalAnswer(explanation: string | null): string {
  return explanation ? `Claude declined to answer this. ${explanation}` : "Claude declined to answer this.";
}

/**
 * Reads one line of `--output-format stream-json`. Returns the text delta it
 * carries, `MESSAGE_START`, the `StreamResult`, or null. Throws when the line
 * is an error result.
 */
export function parseStreamLine(line: string): string | typeof MESSAGE_START | StreamResult | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  // A refusal can come as an error result, so it's checked first.
  if (event.type === "result" && event.stop_reason === "refusal") return { result: "", refused: true };
  if (event.type === "result" && event.is_error === true) {
    throw new Error(typeof event.result === "string" && event.result ? event.result : "The agent could not answer that");
  }
  // A resumed session first closes the notices of background tasks the
  // transcript left running, as a turn with no model call; the answer comes after it.
  if (event.type === "result" && event.num_turns === 0) return null;
  if (event.type === "result") return { result: typeof event.result === "string" ? event.result : "" };
  if (event.type !== "stream_event") return null;
  const inner = event.event as { type?: string; delta?: { type?: string; text?: unknown } } | undefined;
  if (inner?.type === "message_start") return MESSAGE_START;
  if (inner?.type !== "content_block_delta" || inner.delta?.type !== "text_delta") return null;
  return typeof inner.delta.text === "string" ? inner.delta.text : null;
}

const DETAIL_FIELDS = ["command", "file_path", "path", "pattern", "query", "url"] as const;

/**
 * Collects the tool calls from one line of `stream-json` into `calls`, keyed
 * by tool use id: the assistant's `tool_use` blocks, then the `tool_result`
 * that marks a refused call as an error.
 */
export function collectToolCalls(line: string, calls: Map<string, SideChatToolCall>): void {
  let event: { type?: string; message?: { content?: unknown } };
  try {
    event = JSON.parse(line) as typeof event;
  } catch {
    return;
  }
  if (event.type !== "assistant" && event.type !== "user") return;
  const blocks = Array.isArray(event.message?.content) ? (event.message.content as Record<string, unknown>[]) : [];
  for (const block of blocks) {
    if (block.type === "tool_use" && typeof block.id === "string") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const field = DETAIL_FIELDS.find((name) => typeof input[name] === "string");
      calls.set(block.id, {
        tool: String(block.name ?? ""),
        ...(field ? { detail: (input[field] as string).slice(0, 300) } : {}),
        refused: false,
      });
    } else if (block.type === "tool_result" && block.is_error === true) {
      const call = calls.get(String(block.tool_use_id));
      if (call) call.refused = true;
    }
  }
}

/** Appends one side chat question and its tool calls to the log. Never throws. */
export function logSideChat(
  question: SideQuestion,
  session: SideChatSession,
  tools: SideChatToolCall[],
  dir: string = getHypermarkDataDir(),
): void {
  const record = {
    at: new Date().toISOString(),
    question: question.question,
    quoted: question.quote.length > 0,
    followUp: question.thread.length > 0,
    model: session.model,
    cwd: session.cwd,
    tools,
  };
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "side-chat-log.jsonl"), JSON.stringify(record) + "\n");
  } catch {
    // The log is for later analysis; a side chat doesn't fail without it.
  }
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

/**
 * The `--settings` file whose PreToolUse hook runs `side-chat-hook.ts` on
 * every tool call. A file, since `claude.cmd` can't take JSON in its arguments
 * on Windows. The hook's paths come in through the environment, and a hook
 * that fails to start refuses the call (exit code 2).
 */
const READ_ONLY_SETTINGS = join(import.meta.dir, "side-chat-settings.json");
const HOOK_ENV = {
  HYPERMARK_BUN: process.execPath.replaceAll("\\", "/"),
  HYPERMARK_SIDE_CHAT_HOOK: join(import.meta.dir, "side-chat-hook.ts").replaceAll("\\", "/"),
};

/** How long the process gets to exit on its own after the answer ends. */
const EXIT_GRACE_MS = 10_000;

/**
 * Runs `claude -p --resume` with the prompt on stdin. The answer ends on the
 * `result` event; the process then exits on its own (Stop hooks, telemetry),
 * and is killed if it hasn't within `EXIT_GRACE_MS`. It runs in
 * `bypassPermissions`, so the settings' `auto` mode doesn't run its classifier
 * (about 0.45 s) before each tool call; the PreToolUse hook still refuses
 * anything that isn't read-only.
 */
export const runClaudeSideChat: SideChatRunner = async function* (prompt, session, signal, onToolCalls) {
  const proc = Bun.spawn(
    [
      "claude", "-p",
      ...(session.model ? ["--model", session.model] : []),
      "--resume", session.sessionId,
      "--no-session-persistence",
      "--settings", READ_ONLY_SETTINGS,
      "--permission-mode", "bypassPermissions",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
    ],
    // No DISABLE_TELEMETRY or CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: either
    // one changes the request so it no longer reads the session's prompt cache.
    { cwd: session.cwd, env: { ...process.env, ...HOOK_ENV }, stdin: "pipe", stdout: "pipe", stderr: "ignore" },
  );
  const kill = () => killTree(proc);
  signal.addEventListener("abort", kill, { once: true });
  const calls = new Map<string, SideChatToolCall>();
  let ended = false;
  try {
    proc.stdin.write(prompt);
    await proc.stdin.end();
    let answered = false;
    let newMessage = false;
    let refusal: string | null = null;
    for await (const line of splitLines(proc.stdout)) {
      collectToolCalls(line, calls);
      refusal = readRefusalExplanation(line) ?? refusal;
      const parsed = parseStreamLine(line);
      if (parsed === MESSAGE_START) {
        newMessage = answered;
      } else if (typeof parsed === "string") {
        if (!parsed) continue;
        // The reply after a tool call starts a new paragraph.
        if (newMessage) yield "\n\n";
        newMessage = false;
        answered = true;
        yield parsed;
      } else if (parsed) {
        if (parsed.refused) {
          // The reason shows as the answer, after any text that streamed before it.
          yield answered ? `\n\n${refusalAnswer(refusal)}` : refusalAnswer(refusal);
          answered = true;
        } else if (!answered && parsed.result) {
          // A turn that streamed no text (a replayed one) answers on the result alone.
          answered = true;
          yield parsed.result;
        }
        ended = true;
        break;
      }
    }
    if (!answered && !signal.aborted) {
      const code = ended ? 0 : await proc.exited;
      throw new Error(code === 0 ? "The agent gave no answer" : "The agent could not answer that");
    }
  } finally {
    signal.removeEventListener("abort", kill);
    if (proc.exitCode === null) {
      if (ended) {
        void Promise.race([proc.exited, Bun.sleep(EXIT_GRACE_MS)]).then(() => {
          if (proc.exitCode === null) killTree(proc);
        });
      } else {
        killTree(proc);
      }
    }
    onToolCalls?.([...calls.values()]);
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
  const logTools = (tools: SideChatToolCall[]) => logSideChat(question, session, tools);
  const chunks = run(buildSideChatPrompt(question), session, abort.signal, logTools)[Symbol.asyncIterator]();
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
