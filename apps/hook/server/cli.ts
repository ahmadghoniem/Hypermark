const HELP_FLAGS = new Set(["--help", "-h"]);

export interface ParsedStrictAnnotateOptions {
  requireApproval: boolean;
  resultFile?: string;
  remainingArgs: string[];
}

export interface ParsedUninstallOptions {
  purge: boolean;
  yes: boolean;
  dryRun: boolean;
}

/**
 * Parse the deliberately small, non-overlapping uninstall flag surface.
 */
export function parseUninstallOptions(
  args: readonly string[],
): ParsedUninstallOptions {
  let purge = false;
  let yes = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--purge") {
      if (purge) throw new Error("--purge may only be specified once");
      purge = true;
    } else if (arg === "--yes" || arg === "-y") {
      if (yes) throw new Error("--yes/-y may only be specified once");
      yes = true;
    } else if (arg === "--dry-run") {
      if (dryRun) throw new Error("--dry-run may only be specified once");
      dryRun = true;
    } else {
      throw new Error(`Unknown uninstall option: ${arg}`);
    }
  }

  return { purge, yes, dryRun };
}

/**
 * Normal uninstall accepts y/yes. Purge intentionally requires an exact,
 * explicit word so an accidental return key cannot destroy local data.
 */
export function isUninstallConfirmationAccepted(
  answer: string,
  purge: boolean,
): boolean {
  const normalized = answer.trim().toLowerCase();
  return purge
    ? normalized === "purge"
    : normalized === "y" || normalized === "yes";
}

export function parseStrictAnnotateOptions(
  args: string[],
): ParsedStrictAnnotateOptions {
  let requireApproval = false;
  let resultFile: string | undefined;
  const remainingArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--require-approval") {
      if (requireApproval) {
        throw new Error("--require-approval may only be specified once");
      }
      requireApproval = true;
      continue;
    }
    if (arg === "--result-file") {
      if (resultFile !== undefined) {
        throw new Error("--result-file may only be specified once");
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --result-file");
      }
      resultFile = value;
      index += 1;
      continue;
    }
    remainingArgs.push(arg);
  }

  if (!requireApproval && resultFile === undefined) {
    return { requireApproval: false, remainingArgs };
  }
  if (remainingArgs[0] !== "annotate") {
    throw new Error(
      "--require-approval and --result-file are only valid with annotate",
    );
  }
  if (!remainingArgs.includes("--gate") || !remainingArgs.includes("--json")) {
    throw new Error(
      "--require-approval and --result-file require --gate --json",
    );
  }
  if (remainingArgs.includes("--hook")) {
    throw new Error(
      "--require-approval and --result-file cannot be used with --hook",
    );
  }

  return { requireApproval, resultFile, remainingArgs };
}

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

declare const __CLI_VERSION__: string;

export function formatVersion(): string {
  return `hypermark ${typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "dev"}`;
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
    "  hypermark [--browser <name>]",
    "  hypermark review [--git]",
    "  hypermark annotate <file.md | file.txt | file.html | https://... | folder/>  [--markdown] [--no-jina] [--gate] [--json] [--hook] [--require-approval] [--result-file <path>]",
    "  hypermark annotate-last [--stdin] [--gate] [--json] [--hook]",
    "  hypermark last",
    "  hypermark archive",
    "  hypermark sessions",
    "  hypermark uninstall [--purge] [--yes] [--dry-run]",
    "  hypermark improve-context",
    "",
    "Run 'hypermark <command> --help' for command-specific usage.",
    "",
    "Note:",
    "  running 'hypermark' without arguments is for hook integration and expects JSON on stdin",
  ].join("\n");
}

// Per-subcommand usage text. Keyed by the canonical subcommand token; aliases
// (e.g. `last` → `annotate-last`) are resolved in formatSubcommandHelp().
//
// These exist so an agent (or human) probing `hypermark <sub> --help` gets
// usage on stdout instead of accidentally launching the browser UI — running
// `review --help` used to fall through to local review mode and open a tab.
// Exported so the documented surface can be diffed against the real one.
export const SUBCOMMAND_HELP: Record<string, string> = {
  review: [
    "Usage:",
    "  hypermark review [--git]",
    "",
    "Review local VCS changes in the browser.",
    "",
    "Options:",
    "  --git         Force git as the VCS (skip auto-detection)",
    "",
    "Examples:",
    "  hypermark review",
    "  hypermark review --git",
  ].join("\n"),
  annotate: [
    "Usage:",
    "  hypermark annotate <file.md | file.txt | file.html | https://... | folder/> [--markdown] [--no-jina] [--gate] [--json] [--hook] [--require-approval] [--result-file <path>]",
    "",
    "Open a markdown/text/HTML file, a URL, or a folder of documents in the annotation UI.",
    "",
    "Options:",
    "  --markdown    Convert HTML input to markdown instead of rendering it raw",
    "  --no-jina     Fetch URLs with fetch+Turndown instead of Jina Reader",
    "  --gate        Add an Approve button (review-gate UX)",
    "  --json        Emit a structured decision JSON on stdout",
    "  --hook        Emit hook-native JSON (block/pass) for PostToolUse/Stop hooks",
    "  --require-approval",
    "                Exit 1 unless the reviewer approves (requires --gate --json;",
    "                usage/startup errors exit 2)",
    "  --result-file <path>",
    "                Atomically publish the stdout JSON (requires --gate --json)",
  ].join("\n"),
  "annotate-last": [
    "Usage:",
    "  hypermark annotate-last [--stdin] [--gate] [--json] [--hook]",
    "  hypermark last [--stdin] [--gate] [--json] [--hook]",
    "",
    "Annotate the last assistant message from the current agent session.",
    "",
    "Options:",
    "  --stdin       Read the message content from stdin instead of session logs",
    "  --gate        Add an Approve button (review-gate UX)",
    "  --json        Emit a structured decision JSON on stdout",
    "  --hook        Emit hook-native JSON (block/pass) for PostToolUse/Stop hooks",
  ].join("\n"),
  archive: [
    "Usage:",
    "  hypermark archive",
    "",
    "Open a read-only browser for saved plan decisions in ~/.hypermark/plans/.",
  ].join("\n"),
  "improve-context": [
    "Usage:",
    "  hypermark improve-context",
    "",
    "Hook-integration command spawned by the PreToolUse hook on EnterPlanMode.",
    "Reads the hook event on stdin and emits additionalContext JSON (PFM reminder",
    "and/or compound improvement hook), or exits silently when nothing is enabled.",
    "Not intended to be run directly.",
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
  uninstall: [
    "Usage:",
    "  hypermark uninstall [--purge] [--yes | -y] [--dry-run]",
    "",
    "Remove Hypermark-installed components. Local plans, history, drafts,",
    "settings, and other Hypermark data are preserved by default.",
    "",
    "Options:",
    "  --purge       Also permanently delete known local Hypermark data",
    "  --yes, -y     Skip the interactive confirmation (required without a TTY)",
    "  --dry-run     Preview recognized removal work without changing anything",
    "",
    "Purge data is local-only: it is not stored on a Hypermark server and",
    "cannot be recovered after purge. Unrecognized custom files are preserved.",
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
    "hypermark (without arguments) is usually launched automatically by Claude Code hooks.",
    "It expects hook JSON on stdin.",
    "",
    "For interactive use, try:",
    "  hypermark review",
    "  hypermark annotate <file.md | file.txt | file.html | https://...>",
    "  hypermark last",
    "  hypermark archive",
    "  hypermark sessions",
    "  hypermark uninstall",
    "",
    "Run 'hypermark --help' for top-level usage.",
  ].join("\n");
}
