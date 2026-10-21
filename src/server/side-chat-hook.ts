/**
 * The side chat's PreToolUse hook. Claude Code runs it before every tool call
 * in a side chat (see `side-chat-settings.json`) with the call as JSON on
 * stdin. Exit 0 lets the call run; exit 2 refuses it, and the reason on stderr
 * goes back to the model.
 *
 * Read-only tools pass: reading files, searching the web, loading deferred
 * tool schemas, the docs lookups, and Bash when the command only reads
 * (`rg`, `git log`, `cat` and the like, optionally piped into `head`).
 */

const READ_ONLY_TOOLS = new Set(["Read", "Grep", "Glob", "WebSearch", "WebFetch", "ToolSearch"]);
const READ_ONLY_MCP = /^mcp__plugin_context7_context7__(resolve-library-id|query-docs|get-library-docs)$/;

/** Commands that only read, with the git subcommands that only read. */
const READ_ONLY_COMMANDS = new Set(["rg", "cat", "head", "tail", "wc", "ls", "sort", "uniq", "pwd"]);
const READ_ONLY_GIT = new Set(["log", "show", "diff", "status", "blame", "ls-files", "grep", "rev-parse", "branch"]);

/** Shell syntax that can write, chain or run more than the command itself. */
const UNSAFE_SHELL = /[;&<>`\n]|\$\(|\|\|/;

function bashVerdict(command: string): string | null {
  const refused = "The side chat only runs read-only commands (rg, git log/show/diff/status, cat, head, ls), without redirects or chaining.";
  if (UNSAFE_SHELL.test(command)) return refused;
  for (const segment of command.split("|")) {
    const words = segment.trim().split(/\s+/);
    const [name, sub] = words;
    if (!name) return refused;
    if (name === "git") {
      if (!sub || !READ_ONLY_GIT.has(sub)) return refused;
      if (words.some((w) => /^--(output|ext-diff)/.test(w))) return refused;
    } else if (name === "sed") {
      // Only `sed -n '<lines>p' <file>`: other scripts can write (`w`) or run (`e`).
      if (words[1] !== "-n" || !/^'?\d+(,\d+)?p'?$/.test(words[2] ?? "")) return refused;
    } else if (!READ_ONLY_COMMANDS.has(name)) {
      return refused;
    } else if (name === "rg" && words.some((w) => w.startsWith("--pre"))) {
      return refused;
    }
  }
  return null;
}

/** Null when the call may run, otherwise the reason it's refused. */
export function sideChatToolVerdict(toolName: string, input: unknown): string | null {
  if (READ_ONLY_TOOLS.has(toolName) || READ_ONLY_MCP.test(toolName)) return null;
  if (toolName === "Bash") {
    const command = (input as { command?: unknown } | null)?.command;
    return typeof command === "string" ? bashVerdict(command.trim()) : "No command given.";
  }
  return `The side chat is read-only: ${toolName} isn't available here. Answer from what you can read.`;
}

if (import.meta.main) {
  let reason: string | null;
  try {
    const call = JSON.parse(await Bun.stdin.text()) as { tool_name?: unknown; tool_input?: unknown };
    reason = sideChatToolVerdict(String(call.tool_name ?? ""), call.tool_input);
  } catch {
    reason = "The side chat couldn't read this tool call.";
  }
  if (reason) {
    process.stderr.write(reason);
    process.exit(2);
  }
}
