/**
 * Hypermark Config
 *
 * Reads/writes ~/.hypermark/config.json for persistent user settings.
 * Runtime-agnostic: uses only node:fs, node:os, node:child_process.
 */

import { join } from "path";
import { getHypermarkDataDir } from "./data-dir";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  writeSync,
  closeSync,
  statSync,
  unlinkSync,
  renameSync,
  realpathSync,
} from "fs";
import { execSync } from "child_process";

import type { DefaultDiffType, DiffLineBgIntensity, DiffOptions, ThemeConfig } from '@hypermark/core/config-types';
import { isFaviconStyle, type FaviconStyle } from './favicon';
export type { DefaultDiffType, DiffLineBgIntensity, DiffOptions, ThemeConfig, FaviconStyle };

export type PromptSectionOverrides = Record<string, string | undefined>;

export type PromptRuntime = "claude-code";

interface PromptSectionConfig {
  [key: string]: string | Partial<Record<PromptRuntime, PromptSectionOverrides>> | undefined;
  runtimes?: Partial<Record<PromptRuntime, PromptSectionOverrides>>;
}

export interface PromptConfig {
  review?: PromptSectionConfig & {
    approved?: string;
    approvedWithNotes?: string;
    denied?: string;
  };
  plan?: PromptSectionConfig & {
    approved?: string;
    approvedWithNotes?: string;
    autoApproved?: string;
    denied?: string;
  };
  annotate?: PromptSectionConfig & {
    fileFeedback?: string;
    messageFeedback?: string;
    approved?: string;
    approvedWithNotes?: string;
  };
}

const PROMPT_SECTIONS = ["review", "plan", "annotate"] as const;

export function mergePromptConfig(
  current?: PromptConfig,
  partial?: PromptConfig,
): PromptConfig | undefined {
  if (!current && !partial) return undefined;

  const result: Record<string, any> = { ...current, ...partial };

  for (const section of PROMPT_SECTIONS) {
    const cur = current?.[section];
    const par = partial?.[section];
    if (cur || par) {
      result[section] = {
        ...cur,
        ...par,
        runtimes: (cur?.runtimes || par?.runtimes)
          ? { ...cur?.runtimes, ...par?.runtimes }
          : undefined,
      };
    }
  }

  return result as PromptConfig;
}

export interface HypermarkConfig {
  displayName?: string;
  diffOptions?: DiffOptions;
  /**
   * Appearance: which mode, plus the palette assigned to each half of the
   * light/dark pair. Written by the UI through POST /api/config, so a choice
   * made in one session is picked up by the next one (each hook invocation
   * runs on its own random port).
   */
  theme?: ThemeConfig;
  prompts?: PromptConfig;
  /**
   * Enable `gh attestation verify` during CLI installation/upgrade.
   * Read by scripts/install.sh|ps1|cmd on every run (not by any runtime code).
   * When true, the installer runs build-provenance verification after the
   * SHA256 checksum check; requires `gh` CLI installed and authenticated
   * (`gh auth login`). OS-level opt-in only — no UI surface. Default: false.
   */
  verifyAttestation?: boolean;
  /**
   * Installer opt-out for the skills / slash-command checkout. Read by
   * scripts/install.sh|ps1|cmd on every run (not by any runtime code).
   * When true, the installer fetches nothing and writes nothing to the
   * Claude Code or ~/.agents skill scopes, reports the skip honestly, and
   * never removes a skill a previous install already wrote. Overridden by
   * the HYPERMARK_SKIP_SKILLS_INSTALL env var, which is in turn overridden
   * by the --skip-skills flag. Default: off.
   *
   * The per-agent entries this object used to
   * carry went with the integrations spec 02 removed. It stays an object
   * rather than a bare boolean so an existing config.json carrying those
   * keys still parses; unknown keys are simply not read.
   */
  skipInstall?: {
    skills?: boolean;
  };
  /**
   * Save per-file version history when annotating local files. Powers the
   * annotate version diff ("what changed since I last looked"). NOTE: this
   * writes a copy of each annotated file's content under
   * ~/.hypermark/history/ (or HYPERMARK_DATA_DIR). Set to false to keep
   * annotate sessions fully stateless. Default: true.
   */
  annotateHistory?: boolean;
  /**
   * Durably archive every submitted review under ~/.hypermark/feedback/
   * (or HYPERMARK_DATA_DIR): one append-only JSONL record per submission
   * plus a markdown sidecar for the ones that carry content. NOTE: this
   * writes the user's own feedback text and the document/code excerpts it
   * quotes to disk, and nothing prunes the directory. Set to false to never
   * write. Default: true. Annotate-surface records additionally honor
   * `annotateHistory`, so the stateless-annotate promise is unchanged.
   */
  feedbackHistory?: boolean;
  /**
   * Extra file extensions annotate treats as markdown (#1307), e.g.
   * [".livemd"] for Livebook notebooks. Listed extensions are accepted
   * everywhere .md is accepted on the annotate path and render as markdown.
   * Entries must start with a dot and carry no path separators or globs;
   * invalid entries are dropped and `.env` can never be registered (annotate
   * copies file contents into the data dir). Resolved by
   * `resolveMarkdownExtensions` in ./markdown-extensions. Default: none.
   */
  markdownExtensions?: string[];
  /**
   * Inject a Hypermark Flavored Markdown reminder into every EnterPlanMode
   * call so the agent is aware it can enrich plans with code-file links,
   * callouts, tables, diagrams, task lists, and the other PFM extensions.
   * Read by the `improve-context` PreToolUse handler. Default: false.
   */
  pfmReminder?: boolean;
  /**
   * Open Hypermark in a Glimpse native window when available.
   * When true (default), the server spawns `glimpseui` if it is on PATH,
   * no explicit browser is configured, and the session is local.
   * Set to false to always use the system browser even when Glimpse is installed.
   */
  glimpse?: boolean;
  /**
   * Mirror the approved plan checklist into an editable todo provider during
   * execution (issue #484). "auto" (default) syncs whenever a provider is
   * detected — currently pi-todos. Detection checks the configured todo
   * directory; PI_TODO_PATH only redirects which directory is checked.
   *
   * The mirror is additive: the progress widget is left alone. pi-todos has no
   * live surface of its own (its list renders on demand in `/todos`), so the
   * widget stays the at-a-glance tracker while the provider contributes
   * editable, session-durable todos. Sync is one-way; provider-side edits are
   * never read back. Failures are non-fatal.
   */
  todoProvider?: "auto" | "off";
  /**
   * Selected favicon style for Hypermark application surfaces:
   * 'classic' (historical dark-navy P tile).
   */
  favicon?: FaviconStyle;
}

// Resolved per call, not at module scope: tests sandbox the data dir by
// setting HYPERMARK_DATA_DIR at runtime, and a module-scope constant would
// freeze whatever the env held at first import (bun runs every test file in
// one process).
function getConfigDir(): string {
  return getHypermarkDataDir();
}
function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Load config from ~/.hypermark/config.json.
 * Returns {} on missing file or malformed JSON.
 */
export function loadConfig(): HypermarkConfig {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) return {};
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    process.stderr.write(`[hypermark] Warning: failed to read config.json: ${e}\n`);
    return {};
  }
}

// --- config.json write serialization ----------------------------------------
//
// saveConfig is a read-merge-write, and one data dir is routinely shared by
// several Hypermark processes (an annotate session and a review session at
// once is ordinary). Two of them settling a POST /api/config in the same
// window both read the pre-change file, both merge onto it, and the second
// write silently drops the first writer's key while both callers are told the
// save succeeded. An advisory lockfile makes the read-merge-write a critical
// section across processes.
//
// Advisory, bounded, and never fatal, in that order of priority:
//  - O_EXCL create of `${configDir}/config.json.lock` is the only primitive
//    required, so this stays node:fs-only and portable to every runtime that
//    vendors this file (no flock, no native deps, no fcntl semantics).
//  - A lock whose mtime is older than the stale window is assumed to belong
//    to a process that died holding it and is taken over. Holding the lock
//    spans one read plus one write, i.e. microseconds, so a lock this old is
//    not a live writer.
//  - Waiting is bounded by the wait budget. When the budget runs out the
//    write proceeds unlocked with a warning: a lost update is a bad outcome,
//    a server wedged forever on a lockfile is a worse one.
//
// Residual failure mode, stated plainly: two writers that both judge the same
// lock stale in the same instant can both take it, and one update is lost
// exactly as it was before. That needs a >1.5s stall inside a critical
// section that costs microseconds, and the cost of closing it (owner tokens,
// re-verification, a second lock) is not worth paying for a settings file.

const CONFIG_LOCK_SUFFIX = ".lock";
const DEFAULT_CONFIG_LOCK_WAIT_BUDGET_MS = 3000;
const DEFAULT_CONFIG_LOCK_STALE_MS = 1500;
const CONFIG_LOCK_POLL_MS = 10;

let configLockWaitBudgetMs = DEFAULT_CONFIG_LOCK_WAIT_BUDGET_MS;
let configLockStaleMs = DEFAULT_CONFIG_LOCK_STALE_MS;

/**
 * Test-only seam for the lock windows. The bounded-wait and stale-takeover
 * paths are otherwise only reachable by waiting out multi-second real time
 * inside a synchronous function, which no test should do. Pass null to
 * restore the shipping values.
 */
export function __setConfigLockTimingsForTest(
  timings: { waitBudgetMs?: number; staleMs?: number } | null,
): void {
  configLockWaitBudgetMs = timings?.waitBudgetMs ?? DEFAULT_CONFIG_LOCK_WAIT_BUDGET_MS;
  configLockStaleMs = timings?.staleMs ?? DEFAULT_CONFIG_LOCK_STALE_MS;
}

/**
 * Test-only seam: runs inside the lock, after the config has been read and
 * before the merged result is written. It exists so a test can inspect the
 * critical section itself (is the lock actually held across the merge?)
 * rather than racing two writers and hoping the interleaving reproduces.
 */
let configSaveMergeWindowHook: (() => void) | null = null;
export function __setConfigSaveMergeWindowHookForTest(hook: (() => void) | null): void {
  configSaveMergeWindowHook = hook;
}

export function getConfigLockPath(): string {
  return getConfigPath() + CONFIG_LOCK_SUFFIX;
}

/** Block the calling thread without a timer: saveConfig is synchronous, so an
 * event-loop-based sleep would never run. Falls back to a spin when
 * SharedArrayBuffer/Atomics.wait is unavailable on the host runtime. */
function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) { /* spin */ }
  }
}

/**
 * Take the advisory config lock, or return false when the wait budget ran out
 * (the caller then writes unlocked rather than hanging).
 */
function acquireConfigLock(lockPath: string): boolean {
  const deadline = Date.now() + configLockWaitBudgetMs;
  for (;;) {
    try {
      // wx: create-exclusive. Whoever wins the create owns the section.
      const handle = openSync(lockPath, "wx");
      try {
        writeSync(handle, `${process.pid} ${new Date().toISOString()}\n`);
      } catch { /* the lock is the file's existence, not its contents */ }
      closeSync(handle);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") {
        // Unwritable directory, read-only fs: locking is not available here,
        // so do not let it block the write it was only meant to serialize.
        return false;
      }
    }

    // Held by someone else. Take it over once it is too old to be live.
    try {
      const age = Date.now() - statSync(lockPath).mtimeMs;
      if (age > configLockStaleMs) {
        unlinkSync(lockPath);
        continue;
      }
    } catch { /* vanished between the create and the stat: just retry */ }

    if (Date.now() >= deadline) return false;
    sleepSync(CONFIG_LOCK_POLL_MS);
  }
}

function releaseConfigLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch { /* already gone (stale takeover by another writer): nothing to do */ }
}

/**
 * Write config.json in one step so a concurrent reader never observes a
 * half-written file: readers deliberately take no lock, and loadConfig treats
 * malformed JSON as an empty config, which would silently present as "all
 * settings reset". Writes through an existing symlink rather than replacing
 * it, so a dotfile-managed config.json keeps its link.
 */
function writeConfigAtomic(configPath: string, contents: string): void {
  let targetPath = configPath;
  try {
    if (existsSync(configPath)) targetPath = realpathSync(configPath);
  } catch { /* unreadable link: fall back to the literal path */ }
  // Rename replaces the destination's metadata with the temp file's, so carry
  // the existing file's permissions across instead of re-deciding them.
  let mode = 0o600;
  try {
    if (existsSync(targetPath)) mode = statSync(targetPath).mode & 0o777;
  } catch { /* new file: keep the private default */ }
  const tempPath = `${targetPath}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    writeFileSync(tempPath, contents, { encoding: "utf-8", mode });
    renameSync(tempPath, targetPath);
  } catch {
    try {
      unlinkSync(tempPath);
    } catch { /* nothing to clean up */ }
    // Same-directory rename should not fail, but a write that lands is better
    // than a settings change that is lost to an exotic filesystem.
    writeFileSync(targetPath, contents, "utf-8");
  }
}

/**
 * Save config by merging partial values into the existing file.
 * Creates ~/.hypermark/ directory if needed.
 *
 * The read-merge-write runs under an advisory lockfile so concurrent writers
 * (in this process or another one sharing the data dir) cannot drop each
 * other's keys. See the lock notes above for the failure mode: it degrades to
 * the old unlocked behavior with a warning, never to a hang.
 */
export function saveConfig(partial: Partial<HypermarkConfig>): void {
  let lockPath: string | null = null;
  let locked = false;
  try {
    mkdirSync(getConfigDir(), { recursive: true });
    lockPath = getConfigLockPath();
    locked = acquireConfigLock(lockPath);
    if (!locked) {
      process.stderr.write(
        `[hypermark] Warning: config.json lock unavailable after ${configLockWaitBudgetMs}ms; `
        + `saving without it (a concurrent save may be overwritten).\n`,
      );
    }

    const current = loadConfig();
    configSaveMergeWindowHook?.();
    const mergedDiffOptions = (current.diffOptions || partial.diffOptions)
      ? { ...current.diffOptions, ...partial.diffOptions }
      : undefined;
    const mergedTheme = (current.theme || partial.theme)
      ? { ...current.theme, ...partial.theme }
      : undefined;
    const mergedPrompts = mergePromptConfig(current.prompts, partial.prompts);
    const merged = {
      ...current,
      ...partial,
      diffOptions: mergedDiffOptions,
      theme: mergedTheme,
      prompts: mergedPrompts,
    };
    writeConfigAtomic(getConfigPath(), JSON.stringify(merged, null, 2) + "\n");
  } catch (e) {
    process.stderr.write(`[hypermark] Warning: failed to write config.json: ${e}\n`);
  } finally {
    if (locked && lockPath) releaseConfigLock(lockPath);
  }
}

/**
 * Detect the git user name from `git config user.name`.
 * Returns null if git is unavailable, not in a repo, or user.name is not set.
 */
export function detectGitUser(): string | null {
  try {
    const name = execSync("git config user.name", { encoding: "utf-8", timeout: 3000 }).trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Build the serverConfig payload for API responses.
 * Reads config.json fresh each call so the response reflects the latest file on disk.
 */
export function getServerConfig(gitUser: string | null): {
  displayName?: string;
  diffOptions?: DiffOptions;
  theme?: ThemeConfig;
  favicon?: FaviconStyle;
  gitUser?: string;
} {
  const cfg = loadConfig();
  return {
    displayName: cfg.displayName,
    diffOptions: cfg.diffOptions,
    ...(cfg.theme !== undefined && { theme: cfg.theme }),
    ...(isFaviconStyle(cfg.favicon) && { favicon: cfg.favicon }),
    gitUser: gitUser ?? undefined,
  };
}

/**
 * Read the user's preferred default diff type from config, falling back to
 * 'since-base' (the composite "what would GitHub show" view). Users with an
 * explicit defaultDiffType keep their choice.
 */
export function resolveDefaultDiffType(cfg?: HypermarkConfig): DefaultDiffType {
  const v = cfg?.diffOptions?.defaultDiffType as string | undefined;
  if (v === 'branch') return 'merge-base';
  return v === 'since-base' || v === 'local-vs-remote' || v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : 'since-base';
}

/**
 * Coerce a config.json value that should be a boolean. JSON parsing preserves
 * whatever type the user typed, so a hand-edited `"false"` (quoted) arrives as
 * a string and would fail `=== false` checks downstream. Accepts real booleans
 * plus "true"/"false"/"1"/"0" strings; anything else falls back to the default.
 */
function coerceConfigBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return fallback;
}

/**
 * Resolve whether to use Glimpse native window.
 *
 * Priority (highest wins):
 *   HYPERMARK_GLIMPSE env var  →  config.glimpse  →  default true
 */
export function resolveUseGlimpse(config: HypermarkConfig): boolean {
  const envVal = process.env.HYPERMARK_GLIMPSE;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }
  return coerceConfigBoolean(config.glimpse, true);
}

/**
 * Resolve whether annotate mode saves per-file version history.
 *
 * Priority (highest wins):
 *   HYPERMARK_ANNOTATE_HISTORY env var  →  config.annotateHistory  →  default true
 */
export function resolveAnnotateHistory(config: HypermarkConfig): boolean {
  const envVal = process.env.HYPERMARK_ANNOTATE_HISTORY;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }
  return coerceConfigBoolean(config.annotateHistory, true);
}

/**
 * Resolve whether submitted feedback is archived under feedback/.
 *
 * Priority (highest wins):
 *   HYPERMARK_FEEDBACK_HISTORY env var  →  config.feedbackHistory  →  default true
 *
 * Deliberately a separate knob from annotateHistory: that one governs copying
 * ANNOTATED CONTENT into the data dir, this one governs keeping the user's own
 * SUBMISSIONS, and a code-review user must be able to control the second
 * without touching the first. Annotate surfaces honor both.
 */
export function resolveFeedbackHistory(config: HypermarkConfig): boolean {
  const envVal = process.env.HYPERMARK_FEEDBACK_HISTORY;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }
  return coerceConfigBoolean(config.feedbackHistory, true);
}

/**
 * Resolve whether the approved plan checklist is mirrored into an editable todo
 * provider during execution.
 *
 * Priority (highest wins):
 *   HYPERMARK_TODO_PROVIDER env var  →  config.todoProvider  →  default auto
 *
 * Env values `off` / `0` / `false` / `disabled` turn the mirror off, matching
 * the vocabulary the other flags accept; anything else — including `auto` —
 * keeps it on. Enabled only means "sync when a provider is detected": with no
 * provider present, the progress widget is the whole experience either way.
 */
export function resolveTodoProviderEnabled(config: HypermarkConfig): boolean {
  const envVal = process.env.HYPERMARK_TODO_PROVIDER;
  if (envVal !== undefined) {
    const v = envVal.toLowerCase();
    return v !== "off" && v !== "0" && v !== "false" && v !== "disabled";
  }
  if (config.todoProvider !== undefined) return config.todoProvider !== "off";
  return true;
}
