import { readFileSync } from "node:fs";
import { join } from "node:path";

const HELP_FLAGS = new Set(["--help", "-h"]);

/** True when any token is a help flag (`--help` / `-h`). */
export function hasHelpFlag(args: string[]): boolean {
  return args.some((arg) => HELP_FLAGS.has(arg));
}

export function isTopLevelHelpInvocation(args: string[]): boolean {
  return args.length > 0 && HELP_FLAGS.has(args[0]);
}

export function isVersionInvocation(args: string[]): boolean {
  return args[0] === "--version" || args[0] === "-v";
}

/** The checkout's `package.json` version; hypermark always runs from source. */
export function formatVersion(): string {
  const { version } = JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf8")) as { version: string };
  return `hypermark ${version}`;
}

export function isInteractiveNoArgInvocation(
  args: string[],
  stdinIsTTY: boolean | undefined,
): boolean {
  return args.length === 0 && stdinIsTTY === true;
}

export function formatTopLevelHelp(): string {
  return [
    "Usage:",
    "  hypermark --help",
    "  hypermark --version, -v",
    "  hypermark annotate <file.md | file.txt>",
    "  hypermark annotate-last [--stdin]",
    "  hypermark last",
    "  hypermark sessions",
    "",
    "Run 'hypermark <command> --help' for command-specific usage.",
  ].join("\n");
}

// Per-subcommand usage text. Keyed by the canonical subcommand token; aliases
// (e.g. `last` → `annotate-last`) are resolved in formatSubcommandHelp().
//
// These exist so an agent (or human) probing `hypermark <sub> --help` gets
// usage on stdout instead of accidentally launching the browser UI.
// Exported so the documented surface can be diffed against the real one.
export const SUBCOMMAND_HELP: Record<string, string> = {
  annotate: [
    "Usage:",
    "  hypermark annotate <file.md | file.txt>",
    "",
    "Open a markdown or text file in the annotation UI.",
  ].join("\n"),
  "annotate-last": [
    "Usage:",
    "  hypermark annotate-last [--stdin]",
    "  hypermark last [--stdin]",
    "",
    "Annotate the last assistant message from the current agent session.",
    "",
    "Options:",
    "  --stdin       Read the message content from stdin instead of session logs",
  ].join("\n"),
  sessions: [
    "Usage:",
    "  hypermark sessions [--open [N]] [--clean] [--kill [N|all]]",
    "",
    "List active Hypermark server sessions.",
    "",
    "Options:",
    "  --open [N]    Reopen session #N (default 1) in the browser",
    "  --clean       Remove stale session entries",
    "  --kill [N|all]",
    "                Terminate session #N (default 1), or every active session",
    "                with 'all'. Use when a session's Claude Code process was",
    "                closed in a way the parent watcher didn't catch.",
  ].join("\n"),
};

// Aliases share another subcommand's help text.
// Exported for the same freshness test as SUBCOMMAND_HELP.
export const SUBCOMMAND_HELP_ALIASES: Record<string, string> = {
  last: "annotate-last",
};

/**
 * Returns the canonical subcommand name when `args` is a `<sub> ... --help`
 * invocation for a user-facing subcommand, or null otherwise. Lets the CLI
 * print usage and exit before a subcommand branch can launch the UI.
 */
export function isSubcommandHelpInvocation(args: string[]): string | null {
  const sub = args[0];
  if (!sub) return null;
  const canonical = SUBCOMMAND_HELP_ALIASES[sub] ?? sub;
  if (!(canonical in SUBCOMMAND_HELP)) return null;
  return hasHelpFlag(args.slice(1)) ? canonical : null;
}

/** Usage text for a canonical subcommand (falls back to top-level help). */
export function formatSubcommandHelp(subcommand: string): string {
  return SUBCOMMAND_HELP[subcommand] ?? formatTopLevelHelp();
}

export function formatInteractiveNoArgClarification(): string {
  return [
    "hypermark (without arguments) does nothing in an interactive terminal.",
    "",
    "Try:",
    "  hypermark annotate <file.md | file.txt>",
    "  hypermark last",
    "  hypermark sessions",
    "",
    "Run 'hypermark --help' for top-level usage.",
  ].join("\n");
}
