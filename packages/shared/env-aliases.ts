/**
 * Legacy environment-variable aliases.
 *
 * Hypermark reads `HYPERMARK_*` variables. The fork was called Plannotator and
 * read `PLANNOTATOR_*`, and those names are still sitting in people's shell
 * profiles, wrapper scripts, CI jobs and container definitions. This module is
 * the one place that bridges the two, so the ~200 call sites can each read a
 * single name and stay readable.
 *
 * It runs once, at process start, BEFORE anything reads configuration: it
 * copies each legacy value onto its current name and then gets out of the way.
 * The alternative — a two-name fallback at every call site — would put the
 * precedence rule in 200 places and guarantee it drifts in a few of them.
 *
 * PRECEDENCE, stated once and tested:
 *
 *   1. `HYPERMARK_X` wins whenever it is SET, including when it is set to an
 *      empty string.
 *   2. `PLANNOTATOR_X` fills in only when `HYPERMARK_X` is not set at all.
 *
 * The empty case is the one worth being careful about. Across this codebase a
 * set-but-empty variable already means "no value, deliberately" — that is how a
 * wrapper suppresses something the parent environment exported. If an empty
 * `HYPERMARK_X` fell through to the alias, then
 *
 *     HYPERMARK_DATA_DIR= hypermark review
 *
 * would silently obey a stale `PLANNOTATOR_DATA_DIR` from the user's profile,
 * which is the opposite of what clearing a variable means. So empty suppresses,
 * exactly as it does for the current name.
 *
 * This is a rename bridge, not a migration: nothing is written to disk, no
 * directory is created, moved or read, and the legacy variables are left in the
 * environment untouched so a child process still sees whatever it was given.
 */

/**
 * The legacy prefix and its replacement. Aliasing is purely mechanical on the
 * prefix, so a variable added later needs no change here.
 */
const LEGACY_PREFIX = "PLANNOTATOR_";
const CURRENT_PREFIX = "HYPERMARK_";

export interface EnvLike {
  [key: string]: string | undefined;
}

/**
 * Copy every `PLANNOTATOR_*` value onto its `HYPERMARK_*` name, unless that
 * name is already set (empty included).
 *
 * Idempotent: a second call is a no-op, because the first call leaves every
 * aliased name defined. Returns the current names it filled in, newest-caller
 * first, so a CLI can warn about deprecated variables without re-deriving the
 * list.
 */
export function applyLegacyEnvAliases(env: EnvLike = process.env): string[] {
  const applied: string[] = [];

  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;

    const value = env[key];
    if (value === undefined) continue;

    const currentKey = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
    // Set — even to "" — means the caller has spoken. Only an absent name
    // defers to the legacy one.
    if (env[currentKey] !== undefined) continue;

    env[currentKey] = value;
    applied.push(currentKey);
  }

  return applied.sort();
}

/**
 * The deprecation notice for a set of aliased names, or null when none were
 * applied. Kept next to the aliasing so the wording and the rule cannot drift
 * apart; callers decide whether and where to print it.
 */
export function legacyEnvAliasNotice(applied: string[]): string | null {
  if (applied.length === 0) return null;
  const names = applied
    .map((key) => LEGACY_PREFIX + key.slice(CURRENT_PREFIX.length))
    .join(", ");
  const plural = applied.length === 1 ? "variable is" : "variables are";
  return `[hypermark] note: ${names} ${plural} deprecated; use ${applied.join(", ")} instead.`;
}
