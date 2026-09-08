/**
 * Hypermark Data Directory
 *
 * Returns the base directory for all Hypermark data files.
 *
 * Priority:
 *   1.  HYPERMARK_DATA_DIR environment variable (with ~ expansion)
 *   2.  ~/.hypermark when it already exists
 *   3.  $XDG_DATA_HOME/hypermark when XDG_DATA_HOME is a non-empty
 *       absolute path
 *   4.  Default: ~/.hypermark
 *
 * This allows users to relocate all data (plans, history, drafts, config,
 * hooks, sessions, debug logs, IPC registry, etc.) via a single variable —
 * useful for XDG-style home directory cleanliness on Unix systems.
 *
 * A FRESH ROOT (spec 06, decision D5). Hypermark starts at ~/.hypermark and
 * never reads ~/.plannotator. Someone who ran Plannotator keeps their plans,
 * drafts, history, feedback and config exactly where they are; this product
 * simply does not look there. Nothing is copied, moved, merged, symlinked or
 * deleted, and the old directory is not even probed. Bringing that data across
 * is an explicit import — a separate assignment with copy/no-clobber/rollback
 * semantics — not a side effect of a rename.
 *
 * The deprecated PLANNOTATOR_DATA_DIR still works, but it is not read here:
 * `@hypermark/shared/env-aliases` copies every legacy PLANNOTATOR_* value onto
 * its HYPERMARK_* name once at process start, so the precedence rule (current
 * name wins whenever set, empty included) lives in one tested place instead of
 * being restated at each reader.
 *
 * The XDG fallback follows git's legacy-first pattern: an existing
 * ~/.hypermark always wins, so an install never relocates itself. Only when
 * that directory is absent AND XDG_DATA_HOME is explicitly set does the XDG
 * location apply. Deliberately NOT implemented: the spec's implicit
 * ~/.local/share default (defaults stay unchanged when XDG_DATA_HOME is unset)
 * and any config/data/cache split — Hypermark uses one monolithic directory.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

/**
 * Resolve the Hypermark data directory.
 *
 * If HYPERMARK_DATA_DIR is set and non-empty, the value is used as the base
 * directory. Leading ~ is expanded to the user's home directory.
 *
 * Otherwise, ~/.hypermark is used when it exists; failing that,
 * $XDG_DATA_HOME/hypermark when XDG_DATA_HOME holds an absolute path; failing
 * that, ~/.hypermark.
 */
export function getHypermarkDataDir(): string {
  const home = homedir();

  const envDir = process.env.HYPERMARK_DATA_DIR?.trim();
  if (envDir) {
    // Expand ~ to home directory
    if (envDir === "~") return home;
    if (envDir.startsWith("~/") || envDir.startsWith("~\\")) {
      return join(home, envDir.slice(2));
    }
    return resolve(envDir);
  }

  const dataDir = join(home, ".hypermark");
  if (existsSync(dataDir)) return dataDir;

  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  if (xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, "hypermark");
  }

  return dataDir;
}
