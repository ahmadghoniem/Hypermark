/**
 * File paths, as a reader wants to see them.
 *
 * Every display site used to call `path.split('/').pop()`. That is correct on
 * a POSIX host and wrong on Windows, where nothing splits and the reader gets
 * `C:\Users\Ada\Desktop\Hypermark\packages\editor\App.tsx` in a header sized
 * for `App.tsx`. Splitting on BOTH separators is the whole fix; the rest of
 * this module is the shortening those one-liners never did.
 *
 * Nothing here is a path operation — the returned strings are for humans.
 * Keep the original around for `title`, copy actions, and anything that has to
 * round-trip back to the filesystem.
 */

/** Split on either separator, dropping the empties a leading or doubled one leaves. */
export function pathSegments(filePath: string): string[] {
  return filePath.split(/[\\/]+/).filter((segment) => segment !== '');
}

/** Just the file's own name. Falls back to the input when there is nothing to split. */
export function fileName(filePath: string): string {
  const segments = pathSegments(filePath);
  return segments[segments.length - 1] ?? filePath;
}

/**
 * The tail of a path, at most `maxSegments` deep, always with forward slashes.
 *
 * Two segments is the default because one is ambiguous the moment a repository
 * holds more than one `index.ts`, and three already outgrows the headers these
 * strings live in. A truncated path is marked with a leading ellipsis so it
 * cannot be mistaken for a relative one.
 */
export function shortPath(filePath: string, maxSegments = 2): string {
  const segments = pathSegments(filePath);
  if (segments.length === 0) return filePath;
  if (segments.length <= maxSegments) return segments.join('/');
  return `…/${segments.slice(-maxSegments).join('/')}`;
}
