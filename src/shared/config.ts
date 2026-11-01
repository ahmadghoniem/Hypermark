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

import type { ThemeConfig } from '@/shared/config-types';
import { isFaviconStyle, type FaviconStyle } from './favicon';
export type { ThemeConfig, FaviconStyle };

export interface HypermarkConfig {
  /**
   * Appearance: which mode, plus the palette assigned to each half of the
   * light/dark pair. Written by the UI through POST /api/config, so a choice
   * made in one session is picked up by the next one (each session
   * runs on its own random port).
   */
  theme?: ThemeConfig;
  /**
   * Durably archive every submission under ~/.hypermark/feedback/
   * (or HYPERMARK_DATA_DIR): one append-only JSONL record per submission
   * plus a markdown sidecar for the ones that carry content. NOTE: this
   * writes the user's own feedback text and the document/code excerpts it
   * quotes to disk, and nothing prunes the directory. Set to false to never
   * write. Default: true.
   */
  feedbackHistory?: boolean;
  /**
   * Extra file extensions annotate treats as markdown, e.g.
   * [".livemd"] for Livebook notebooks. Listed extensions are accepted
   * everywhere .md is accepted on the annotate path and render as markdown.
   * Entries must start with a dot and carry no path separators or globs;
   * invalid entries are dropped and `.env` can never be registered (annotate
   * copies file contents into the data dir). Resolved by
   * `resolveMarkdownExtensions` in ./markdown-extensions. Default: none.
   */
  markdownExtensions?: string[];
  /**
   * Open Hypermark in a Glimpse native window when available.
   * When true (default), the server spawns `glimpseui` if it is on PATH,
   * no explicit browser is configured, and the session is local.
   * Set to false to always use the system browser even when Glimpse is installed.
   */
  glimpse?: boolean;
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
// several Hypermark processes (two annotate sessions at once is ordinary).
// Two of them settling a POST /api/config in the same
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
    const mergedTheme = (current.theme || partial.theme)
      ? { ...current.theme, ...partial.theme }
      : undefined;
    const merged = {
      ...current,
      ...partial,
      theme: mergedTheme,
    };
    writeConfigAtomic(getConfigPath(), JSON.stringify(merged, null, 2) + "\n");
  } catch (e) {
    process.stderr.write(`[hypermark] Warning: failed to write config.json: ${e}\n`);
  } finally {
    if (locked && lockPath) releaseConfigLock(lockPath);
  }
}

/**
 * Build the serverConfig payload for API responses.
 * Reads config.json fresh each call so the response reflects the latest file on disk.
 */
export function getServerConfig(): {
  theme?: ThemeConfig;
  favicon?: FaviconStyle;
} {
  const cfg = loadConfig();
  return {
    ...(cfg.theme !== undefined && { theme: cfg.theme }),
    ...(isFaviconStyle(cfg.favicon) && { favicon: cfg.favicon }),
  };
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
 * Resolve whether submitted feedback is archived under feedback/.
 *
 * Priority (highest wins):
 *   HYPERMARK_FEEDBACK_HISTORY env var  →  config.feedbackHistory  →  default true
 */
export function resolveFeedbackHistory(config: HypermarkConfig): boolean {
  const envVal = process.env.HYPERMARK_FEEDBACK_HISTORY;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }
  return coerceConfigBoolean(config.feedbackHistory, true);
}
