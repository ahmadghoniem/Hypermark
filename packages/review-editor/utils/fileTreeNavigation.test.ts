import { describe, it, expect } from 'bun:test';
import { FileTree as TreesFileTree } from '@pierre/trees';
import type { DiffFile } from '../types';
import {
  buildFileTreePaths,
  getKeyboardFileOrder,
  getVisibleFiles,
  resolveFileTreeTargetFromComposedPath,
  revealFileInTree,
} from './fileTreeAdapter';

const diffFile = (path: string, overrides: Partial<DiffFile> = {}): DiffFile => ({
  path,
  patch: '',
  additions: 0,
  deletions: 0,
  status: 'modified',
  ...overrides,
});

const added = diffFile('src/added.ts', { status: 'added', additions: 5, deletions: 0 });
const deleted = diffFile('src/deleted.ts', { status: 'deleted', additions: 0, deletions: 3 });
const renamed = diffFile('src/new-name.ts', {
  oldPath: 'src/old-name.ts',
  status: 'renamed',
  additions: 2,
  deletions: 1,
});
const binary = diffFile('assets/logo.png', { status: 'modified' });
const deeplyNested = diffFile('src/a/b/c/d/e/deep.ts');
const other = diffFile('src/other.ts');

const files: DiffFile[] = [added, deleted, renamed, binary, deeplyNested, other];

describe('fileTreeAdapter — resolveFileTreeTargetFromComposedPath (double-click target resolution)', () => {
  it('resolves a normal row by data-item-path to canonical target and fileIndex', () => {
    const rowEl = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'src/added.ts' : null),
    };
    const innerEl = { getAttribute: () => null };
    const composedPath = [innerEl, rowEl];

    const target = resolveFileTreeTargetFromComposedPath(files, composedPath);
    expect(target).not.toBeNull();
    expect(target?.canonicalPath).toBe('src/added.ts');
    expect(target?.fileIndex).toBe(0);
    expect(target?.file).toBe(added);
  });

  it('resolves a renamed file when data-item-path is oldPath to the canonical path and index', () => {
    const renamedRowEl = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'src/old-name.ts' : null),
    };
    const target = resolveFileTreeTargetFromComposedPath(files, [renamedRowEl]);
    expect(target).not.toBeNull();
    expect(target?.canonicalPath).toBe('src/new-name.ts');
    expect(target?.fileIndex).toBe(2);
    expect(target?.file).toBe(renamed);
  });

  it('returns null when no element in composedPath has data-item-path', () => {
    const plainEl = { getAttribute: () => null };
    expect(resolveFileTreeTargetFromComposedPath(files, [plainEl, {}])).toBeNull();
    expect(resolveFileTreeTargetFromComposedPath(files, [])).toBeNull();
  });

  it('returns null when data-item-path is a folder path (not in files array)', () => {
    const folderRowEl = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'src' : null),
    };
    expect(resolveFileTreeTargetFromComposedPath(files, [folderRowEl])).toBeNull();
  });

  it('returns null when data-item-path points to an unknown path', () => {
    const unknownEl = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'nonexistent/file.ts' : null),
    };
    expect(resolveFileTreeTargetFromComposedPath(files, [unknownEl])).toBeNull();
  });

  it('picks the first element carrying data-item-path in composedPath order', () => {
    const firstRow = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'src/added.ts' : null),
    };
    const secondRow = {
      getAttribute: (name: string) => (name === 'data-item-path' ? 'src/other.ts' : null),
    };
    const target = resolveFileTreeTargetFromComposedPath(files, [firstRow, secondRow]);
    expect(target?.fileIndex).toBe(0);
  });
});

describe('fileTreeAdapter — getVisibleFiles (visible file subset)', () => {
  it('returns all files unmodified when hideViewedFiles is false', () => {
    const viewed = new Set<string>(['src/added.ts', 'src/other.ts']);
    const result = getVisibleFiles(files, viewed, false, 'src/added.ts');
    expect(result).toBe(files as DiffFile[]);
  });

  it('filters out viewed files when hideViewedFiles is true', () => {
    const viewed = new Set<string>(['src/added.ts', 'src/other.ts']);
    const result = getVisibleFiles(files, viewed, true, 'src/deleted.ts');
    expect(result.map((f) => f.path)).toEqual([
      'src/deleted.ts',
      'src/new-name.ts',
      'assets/logo.png',
      'src/a/b/c/d/e/deep.ts',
    ]);
  });

  it('retains the active file even when viewed under hideViewedFiles', () => {
    const viewed = new Set<string>(['src/added.ts', 'src/other.ts']);
    // Active file is viewed, but must NOT drop out of the tree
    const result = getVisibleFiles(files, viewed, true, 'src/added.ts');
    expect(result.map((f) => f.path)).toContain('src/added.ts');
    expect(result.map((f) => f.path)).not.toContain('src/other.ts');
  });
});

describe('fileTreeAdapter — getKeyboardFileOrder (visible keyboard traversal)', () => {
  it('maps visible files to their canonical indices in the full files array', () => {
    // Subset with deleted (index 1) and other (index 5)
    const visible = [deleted, other];
    const order = getKeyboardFileOrder(files, visible);
    expect(order).toEqual([1, 5]);
  });

  it('never selects a viewed file that the tree is not showing when hideViewedFiles is on', () => {
    const viewed = new Set<string>(['src/deleted.ts', 'assets/logo.png', 'src/other.ts']);
    const visible = getVisibleFiles(files, viewed, true, 'src/added.ts');
    const order = getKeyboardFileOrder(files, visible);

    // Filtered out viewed files must not be reachable via keyboard order
    expect(order).not.toContain(files.indexOf(deleted));
    expect(order).not.toContain(files.indexOf(binary));
    expect(order).not.toContain(files.indexOf(other));

    // Active file and unviewed files are reachable
    expect(order).toContain(files.indexOf(added));
    expect(order).toContain(files.indexOf(renamed));
    expect(order).toContain(files.indexOf(deeplyNested));
  });

  it('returns empty array when visibleFiles is empty', () => {
    expect(getKeyboardFileOrder(files, [])).toEqual([]);
  });

  it('preserves folders-first visual order in keyboard traversal', () => {
    const order = getKeyboardFileOrder(files, files);
    expect(order.length).toBe(files.length);
    // All indices from files must be present
    for (let i = 0; i < files.length; i++) {
      expect(order).toContain(i);
    }
  });
});

function isDirectoryExpanded(model: TreesFileTree, path: string): boolean {
  const item = model.getItem(path);
  return Boolean(item && 'isExpanded' in item && (item as { isExpanded: () => boolean }).isExpanded());
}

describe('fileTreeAdapter — reveal surviving path-set changes', () => {
  it('re-selects active file and expands ancestors after model.resetPaths resets expansion', () => {
    const model = new TreesFileTree({ paths: buildFileTreePaths(files), initialExpansion: 'closed' });
    try {
      // Initially ancestors start closed
      expect(isDirectoryExpanded(model, 'src/a')).toBe(false);

      // Revealing deep file expands ancestors and selects it
      revealFileInTree(model, files, 'src/a/b/c/d/e/deep.ts');
      expect(model.getSelectedPaths()).toEqual(['src/a/b/c/d/e/deep.ts']);
      expect(isDirectoryExpanded(model, 'src/a')).toBe(true);

      // resetPaths (e.g. from hideViewedFiles toggle) clears selection if the file drops out
      model.resetPaths(['src/added.ts']);
      expect(model.getSelectedPaths()).toEqual([]);

      // When the path set resets and reveal runs, it re-expands ancestors and selects the file
      model.resetPaths(buildFileTreePaths(files));
      expect(isDirectoryExpanded(model, 'src/a')).toBe(false); // resetPaths resets expansion to initial
      const revealed = revealFileInTree(model, files, 'src/a/b/c/d/e/deep.ts');
      expect(revealed?.canonicalPath).toBe('src/a/b/c/d/e/deep.ts');
      expect(model.getSelectedPaths()).toEqual(['src/a/b/c/d/e/deep.ts']);
      expect(model.getFocusedPath()).toBe('src/a/b/c/d/e/deep.ts');
      expect(isDirectoryExpanded(model, 'src/a')).toBe(true);
    } finally {
      model.cleanUp();
    }
  });
});
