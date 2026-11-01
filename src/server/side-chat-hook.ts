/**
 * The side chat's PreToolUse hook. Claude Code runs it before every tool call
 * in a side chat (see `side-chat-settings.json`) with the call as JSON on
 * stdin. Exit 0 lets the call run; exit 2 refuses it, and the reason on stderr
 * goes back to the model.
 *
 * Read-only tools pass: reading files, searching the web, loading deferred
 * tool schemas, the docs lookups, and Bash when every command in it only reads
 * (`rg`, `git log`, `cat` and the like, chained or piped).
 */
const READ_ONLY_TOOLS = new Set(["Read", "Grep", "Glob", "WebSearch", "WebFetch", "ToolSearch"]);
const READ_ONLY_MCP = /^mcp__plugin_context7_context7__(resolve-library-id|query-docs|get-library-docs)$/;

/** Commands that only read, with the git subcommands that only read. */
const READ_ONLY_COMMANDS = new Set([
  "rg", "grep", "cat", "head", "tail", "wc", "ls", "sort", "uniq", "cut", "tr",
  "pwd", "echo", "cd", "find", "diff", "du", "which", "stat",
]);
const READ_ONLY_GIT = new Set([
  "log", "show", "diff", "status", "blame", "ls-files", "grep", "rev-parse", "rev-list", "merge-base", "check-ignore", "branch",
]);
/** The `git branch` flags that only list branches; anything else creates, renames or deletes one. */
const GIT_BRANCH_LIST_FLAGS = new Set(["-a", "-r", "-v", "-vv", "--all", "--remotes", "--verbose", "--show-current"]);
/** A sed script that only prints lines: `10,40p`, `$p`, `/^export/,/^}/p`, joined by `;`. */
const SED_LINE = String.raw`(\d+|\$|/([^/\\]|\\.)*/)`;
const SED_PRINT = new RegExp(`^${SED_LINE}(,${SED_LINE})?p(;${SED_LINE}(,${SED_LINE})?p)*$`);
/** The `find` actions that run a program, delete or write a file. */
const FIND_ACTIONS = new Set(["-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprint0", "-fprintf", "-fls"]);

/**
 * Splits a command as the shell reads it into its commands (separated by `|`,
 * `&&`, `||`, `;` or a line break), each a list of words with their quotes
 * removed. Redirects may only throw output away or join two outputs
 * (`2>/dev/null`, `2>&1`). Null when the shell would run or expand something
 * the words don't show: a command substitution, `${…}`, `$'…'`, a brace
 * expansion, a subshell, a background job, any other redirect, or a quote
 * left open.
 */
export function parseCommands(command: string): string[][] | null {
  const commands: string[][] = [[]];
  let word: string | null = null;
  let quote: "'" | '"' | null = null;
  const add = (text: string) => { word = (word ?? "") + text; };
  const endWord = () => {
    if (word !== null) commands[commands.length - 1].push(word);
    word = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1] ?? "";
    if (quote === "'") {
      if (c === "'") quote = null;
      else add(c);
      continue;
    }
    if (c === "\\" && next === "\n") {
      i++;
      continue;
    }
    if (c === "`" || (c === "$" && (next === "(" || next === "{" || (!quote && (next === "'" || next === '"'))))) return null;
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && '"\\$`'.includes(next)) add(command[++i]);
      else add(c);
    } else if (c === "'" || c === '"') {
      quote = c;
      add("");
    } else if (c === "\\") {
      add(command[++i] ?? "");
    } else if (c === "#" && word === null) {
      while (i + 1 < command.length && command[i + 1] !== "\n") i++;
    } else if (c === ">" || (c === "&" && next === ">")) {
      // A digit right before `>` names the output it redirects, not a word.
      if (word !== null && /^\d$/.test(word)) word = null;
      endWord();
      const redirect = /^&?>>?(\s*\/dev\/null|&\d)(?![^\s;&|])/.exec(command.slice(i));
      if (!redirect) return null;
      i += redirect[0].length - 1;
    } else if (c === "|" || c === ";" || c === "\n" || (c === "&" && next === "&")) {
      if ((c === "|" || c === "&") && next === c) i++;
      endWord();
      commands.push([]);
    } else if ("&<(){".includes(c)) {
      return null;
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      add(c);
    }
  }
  if (quote) return null;
  endWord();
  return commands.filter((words) => words.length > 0);
}

/** Whether one command, as its words, only reads. */
function readsOnly(words: string[]): boolean {
  const [name] = words;
  const args = words.slice(1);
  if (name === "git") {
    // `-C <dir>` and `--no-pager` may come before the subcommand; `-c` can't, as it sets config.
    let at = 0;
    while (args[at] === "-C" || args[at] === "--no-pager") at += args[at] === "-C" ? 2 : 1;
    const [sub, ...rest] = args.slice(at);
    if (!sub || !READ_ONLY_GIT.has(sub)) return false;
    if (sub === "branch" && rest.some((w) => !GIT_BRANCH_LIST_FLAGS.has(w))) return false;
    // `--output` writes a file; `--ext-diff` and `-O` (git grep's pager) run a program.
    return !rest.some((w) => /^(--output|--ext-diff|--open-files-in-pager|-O)/.test(w));
  }
  if (name === "sed") {
    // Only `sed -n '<lines>p;…' <file>`: other scripts can write (`w`) or run
    // (`e`), and `-i` rewrites the file.
    return args[0] === "-n" && SED_PRINT.test(args[1] ?? "") && !args.slice(2).some((w) => w.startsWith("-"));
  }
  if (!READ_ONLY_COMMANDS.has(name)) return false;
  if (name === "rg") return !args.some((w) => w.startsWith("--pre"));
  if (name === "find") return !args.some((w) => FIND_ACTIONS.has(w));
  // `-o` writes the sorted output to a file; `--compress-program` runs one.
  if (name === "sort") return !args.some((w) => /^(-[^-]*o|--output|--compress-program)/.test(w));
  // A second file name is where uniq writes.
  if (name === "uniq") return args.filter((w) => !w.startsWith("-")).length <= 1;
  return true;
}

/** How the side chat's prompt and the Bash refusal describe the rule above, so the two stay the same. */
export const SIDE_CHAT_BASH_RULE =
  "Bash runs only commands that read, such as rg, find, cat, sed -n and git log or diff, alone, piped or chained; any other command is refused with the reason.";

const BASH_REFUSAL =
  `${SIDE_CHAT_BASH_RULE} The commands that read: ${[...READ_ONLY_COMMANDS].join(", ")}, sed -n, ` +
  `and git ${[...READ_ONLY_GIT].join(", ")}.`;

function bashVerdict(command: string): string | null {
  const commands = parseCommands(command);
  if (commands && commands.length > 0 && commands.every(readsOnly)) return null;
  return BASH_REFUSAL;
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
