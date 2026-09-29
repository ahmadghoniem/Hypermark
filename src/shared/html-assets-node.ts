import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve as resolvePath } from "node:path";

export const MAX_HTML_ASSET_BYTES = 50 * 1024 * 1024;

/**
 * Single source of truth for "is this file inside this root?" containment used
 * by the HTML asset sinks (Bun route handler).
 * Resolves symlinks on BOTH the root and
 * the target so an in-directory symlink pointing outside the root cannot escape.
 * Keep all sinks importing this — duplicating it is how the escape was missed in
 * one runtime before (#927/#929).
 */
export function isWithinDirectory(filePath: string, root: string): boolean {
  let resolvedRoot: string;
  try {
    resolvedRoot = realpathSync(resolvePath(root));
  } catch {
    return false;
  }
  // Resolve symlinks on the asset so an in-directory symlink pointing outside
  // the root (e.g. evil.css -> ~/.ssh/id_rsa) is rejected, not followed. A
  // nonexistent target keeps the lexical path; the later read simply fails.
  let resolved = resolvePath(filePath);
  try {
    resolved = realpathSync(resolved);
  } catch {
    // asset does not exist yet — fall through with the lexical path
  }
  const rel = relative(resolvedRoot, resolved);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}
