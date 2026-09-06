/**
 * @pierre/trees identity-safe adapter (spec 04, step 2).
 *
 * This is the ONE place that maps this app's review identity — canonical
 * `DiffFile.path`, display-only `oldPath`, status-independent change counts,
 * annotation counts, viewed state, and selection/reveal targeting — onto
 * `@pierre/trees`' path-first API. Every version-sensitive `@pierre/trees`
 * call (a live model's `getItem`/`focusPath`/`scrollToPath`/selection) lives
 * here so a future beta bump only needs re-review of this one file.
 *
 * Identity rules this module exists to protect (see `buildFileTree.ts` and
 * `App.tsx`'s `openDiffFile`, which this mirrors exactly):
 *  - The tree is keyed on `DiffFile.path` ONLY. `oldPath` is resolved on the
 *    way IN (a caller may hand us a stale `oldPath` from a rename) but is
 *    NEVER used to place, select, or expand a tree node.
 *  - Path comparison is exact-string (case-sensitive) — two case-distinct
 *    paths are two distinct files, never collapsed.
 *  - This module does not mutate `files`, `annotations`, or `viewedFiles`;
 *    every export here is a pure read or a call into a caller-supplied
 *    `@pierre/trees` model instance.
 *
 * Step 2 builds this adapter only. Wiring it into `FileTree.tsx`'s render
 * path and applying the fixed `paths`/`initialExpansion`/... configuration is
 * step 3 — nothing here changes any user-visible behavior yet.
 */
import type { FileTree as TreesFileTreeModel } from '@pierre/trees';
import type { CodeAnnotation } from '@plannotator/ui/types';
import type { DiffFile } from '../types';
import { buildFileTree, getAncestorPaths, getVisualFileOrder } from './buildFileTree';

/** A file resolved to its canonical identity: the single-file navigation target. */
export interface FileTreeTarget {
  /** `DiffFile.path` — canonical, never `oldPath`. */
  canonicalPath: string;
  /** Index into the `files` array this target was resolved against. */
  fileIndex: number;
  file: DiffFile;
}

/** A file's position in the "All files" surface, alongside its single-file identity. */
export interface AllFilesTarget {
  fileIndex: number;
  /** Index within `getVisualFileOrder(buildFileTree(files))` — the same
   *  folders-first order `AllFilesCodeView` re-derives for `fileOrder: 'tree'`. */
  visualIndex: number;
}

/**
 * Resolves an arbitrary identifier (a current `path` OR a rename's `oldPath`)
 * to its canonical target, byte-for-byte mirroring `openDiffFile`'s
 * resolution in `App.tsx`: match by `path` OR `oldPath`, then normalize to
 * `file.path`. Every tree selection/reveal call must funnel through this (or
 * `openDiffFile` itself) — the reverse dockview→tree sync matches by `path`
 * only, so anything that selects a raw `oldPath` without this normalization
 * would silently fail to re-highlight later.
 */
export function resolveFileTreeTarget(files: readonly DiffFile[], identifier: string): FileTreeTarget | null {
  const file = files.find(candidate => candidate.path === identifier || candidate.oldPath === identifier);
  if (!file) return null;
  const fileIndex = files.findIndex(candidate => candidate.path === file.path);
  if (fileIndex === -1) return null;
  return { canonicalPath: file.path, fileIndex, file };
}

/**
 * The `paths` input for `@pierre/trees`' `FileTreeOptions` — one canonical
 * `DiffFile.path` per file, in `files` order. `oldPath` is never included:
 * a rename places exactly one node, at its new path, exactly like
 * `buildFileTree`'s trie does today.
 */
export function buildFileTreePaths(files: readonly DiffFile[]): string[] {
  return files.map(file => file.path);
}

/**
 * Ancestor folder paths to force-open when revealing `identifier` (a path or
 * oldPath). Resolves through `resolveFileTreeTarget` first so a rename's
 * `oldPath` still expands the file's CURRENT ancestry, then delegates to the
 * shared `getAncestorPaths` identity helper (also used by `AllFilesCodeView`)
 * rather than re-deriving path segmentation.
 */
export function getRevealAncestorPaths(files: readonly DiffFile[], identifier: string): string[] {
  const target = resolveFileTreeTarget(files, identifier);
  if (!target) return [];
  return getAncestorPaths(target.canonicalPath);
}

/**
 * Where `identifier` lands in the "All files" visual order (the folders-first
 * order `getVisualFileOrder`/`AllFilesCodeView` use), alongside its
 * single-file `fileIndex`. Returns null when `identifier` does not resolve to
 * any file in this set.
 */
export function getAllFilesTarget(files: readonly DiffFile[], identifier: string): AllFilesTarget | null {
  const target = resolveFileTreeTarget(files, identifier);
  if (!target) return null;
  const visualOrder = getVisualFileOrder(buildFileTree(files as DiffFile[]));
  const visualIndex = visualOrder.indexOf(target.fileIndex);
  if (visualIndex === -1) return null;
  return { fileIndex: target.fileIndex, visualIndex };
}

/**
 * Status-independent per-file change counts, straight off `DiffFile`. Never
 * derived from `DiffFileStatus` — a binary/generated/renamed file reports
 * whatever `additions`/`deletions` its patch actually carries (typically 0/0
 * for binary).
 */
export function getChangeCounts(file: DiffFile): { additions: number; deletions: number } {
  return { additions: file.additions, deletions: file.deletions };
}

/**
 * Per-canonical-path annotation counts, keyed by `CodeAnnotation.filePath`
 * (always canonical — annotations are never authored against an `oldPath`).
 * Mirrors `FileTree.tsx`'s existing `annotationCountMap`.
 */
export function buildAnnotationCountMap(annotations: readonly CodeAnnotation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    counts.set(annotation.filePath, (counts.get(annotation.filePath) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether `file` is viewed. `viewedFiles` is already keyed by canonical
 * `DiffFile.path` at its source (`App.tsx`'s `handleToggleViewed`), so this
 * is a guarded passthrough — kept here so no caller reads the set by a raw,
 * possibly-stale identifier.
 */
export function isFileViewed(viewedFiles: ReadonlySet<string>, file: DiffFile): boolean {
  return viewedFiles.has(file.path);
}

/**
 * The tree's selected-path set for a given `activeFileIndex`. Mirrors
 * `FileTree.tsx`'s existing rule that `activeFileIndex` is forced to `-1`
 * while All files/Semantic/Call flow/PR panels are active: returns an empty
 * selection rather than guessing at a fallback file.
 */
export function getSelectedPaths(files: readonly DiffFile[], activeFileIndex: number): string[] {
  const file = activeFileIndex >= 0 ? files[activeFileIndex] : undefined;
  return file ? [file.path] : [];
}

/**
 * Selects and reveals `identifier` (a path or oldPath) against a live
 * `@pierre/trees` model instance: expands every ancestor directory, clears
 * any existing selection and selects only the canonical path (this app is
 * single-select even though the underlying model supports multi-select), and
 * focuses/scrolls to it. Returns the resolved target — callers cross-check
 * the single-file destination (`fileIndex`/`canonicalPath`) and the
 * all-files destination via `getAllFilesTarget`. Does nothing and returns
 * null when `identifier` does not resolve, so a stale reveal request can
 * never partially mutate the model's selection/expansion state.
 *
 * This is the one place a live `@pierre/trees` model is driven for
 * selection/reveal; step 3 wires this into `FileTree`'s presentation layer.
 */
export function revealFileInTree(
  model: TreesFileTreeModel,
  files: readonly DiffFile[],
  identifier: string,
): FileTreeTarget | null {
  const target = resolveFileTreeTarget(files, identifier);
  if (!target) return null;

  for (const ancestorPath of getAncestorPaths(target.canonicalPath)) {
    const item = model.getItem(ancestorPath);
    if (item && 'expand' in item) item.expand();
  }

  for (const selectedPath of model.getSelectedPaths()) {
    if (selectedPath !== target.canonicalPath) model.getItem(selectedPath)?.deselect();
  }
  model.getItem(target.canonicalPath)?.select();
  model.focusPath(target.canonicalPath);
  model.scrollToPath(target.canonicalPath);

  return target;
}
