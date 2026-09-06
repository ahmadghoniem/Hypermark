import { describe, it, expect } from 'bun:test';
import { FileTree as TreesFileTree } from '@pierre/trees';
import type { DiffFile } from '../types';
import type { CodeAnnotation } from '@plannotator/ui/types';
import {
  resolveFileTreeTarget,
  buildFileTreePaths,
  getRevealAncestorPaths,
  getAllFilesTarget,
  getChangeCounts,
  buildAnnotationCountMap,
  isFileViewed,
  getSelectedPaths,
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

const annotation = (filePath: string, overrides: Partial<CodeAnnotation> = {}): CodeAnnotation => ({
  id: `ann-${filePath}-${Math.random()}`,
  type: 'comment',
  filePath,
  lineStart: 1,
  lineEnd: 1,
  side: 'new',
  createdAt: 0,
  ...overrides,
});

/**
 * The seven synthetic fixtures spec 04 step 2 requires, plus a couple of
 * supporting files so the set has real folder structure to navigate through.
 * `generated` isn't a `DiffFile` field (generated-ness lives in App.tsx's own
 * `generatedFiles: Set<string>`, entirely outside this contract) — its case
 * proves the adapter's identity mapping is unaffected by that external set.
 */
const added = diffFile('src/added.ts', { status: 'added', additions: 12, deletions: 0 });
const deleted = diffFile('src/deleted.ts', { status: 'deleted', additions: 0, deletions: 8 });
const renamed = diffFile('src/new-name.ts', {
  oldPath: 'src/old-name.ts',
  status: 'renamed',
  additions: 2,
  deletions: 1,
});
const binary = diffFile('assets/logo.png', {
  status: 'modified',
  additions: 0,
  deletions: 0,
  patch: 'diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n',
});
const generated = diffFile('dist/bundle.min.js', { status: 'modified', additions: 500, deletions: 3 });
const caseUpper = diffFile('src/Utils/Helper.ts', { additions: 4, deletions: 0 });
const caseLower = diffFile('src/utils/helper.ts', { additions: 1, deletions: 1 });
const deeplyNested = diffFile('src/a/b/c/d/e/deep.ts', { additions: 3, deletions: 0 });

const files: DiffFile[] = [added, deleted, renamed, binary, generated, caseUpper, caseLower, deeplyNested];
const generatedFilesSet = new Set<string>([generated.path]);

describe('fileTreeAdapter — resolveFileTreeTarget (single-file target)', () => {
  it('resolves an added file by its canonical path', () => {
    const target = resolveFileTreeTarget(files, 'src/added.ts');
    expect(target).toEqual({ canonicalPath: 'src/added.ts', fileIndex: 0, file: added });
  });

  it('resolves a deleted file by its canonical path', () => {
    const target = resolveFileTreeTarget(files, 'src/deleted.ts');
    expect(target).toEqual({ canonicalPath: 'src/deleted.ts', fileIndex: 1, file: deleted });
  });

  it('resolves a renamed file by its NEW path', () => {
    const target = resolveFileTreeTarget(files, 'src/new-name.ts');
    expect(target?.canonicalPath).toBe('src/new-name.ts');
    expect(target?.fileIndex).toBe(2);
  });

  it('resolves a renamed file by its OLD path to the same canonical target', () => {
    const target = resolveFileTreeTarget(files, 'src/old-name.ts');
    expect(target?.canonicalPath).toBe('src/new-name.ts');
    expect(target?.fileIndex).toBe(2);
    expect(target?.file).toBe(renamed);
  });

  it('resolves a binary file (no hunks, 0/0 counts) by its canonical path', () => {
    const target = resolveFileTreeTarget(files, 'assets/logo.png');
    expect(target?.canonicalPath).toBe('assets/logo.png');
    expect(target?.fileIndex).toBe(3);
  });

  it('resolves a generated file identically whether or not it is in the external generatedFiles set', () => {
    const target = resolveFileTreeTarget(files, 'dist/bundle.min.js');
    expect(target?.canonicalPath).toBe('dist/bundle.min.js');
    expect(target?.fileIndex).toBe(4);
    expect(generatedFilesSet.has(target!.canonicalPath)).toBe(true);
  });

  it('keeps case-distinct paths as two separate targets — never collapses them', () => {
    const upper = resolveFileTreeTarget(files, 'src/Utils/Helper.ts');
    const lower = resolveFileTreeTarget(files, 'src/utils/helper.ts');
    expect(upper?.fileIndex).toBe(5);
    expect(lower?.fileIndex).toBe(6);
    expect(upper?.canonicalPath).not.toBe(lower?.canonicalPath);
    // Cross-case lookups must not match the other file.
    expect(resolveFileTreeTarget(files, 'src/UTILS/HELPER.TS')).toBeNull();
  });

  it('resolves a deeply nested file by its full canonical path', () => {
    const target = resolveFileTreeTarget(files, 'src/a/b/c/d/e/deep.ts');
    expect(target?.canonicalPath).toBe('src/a/b/c/d/e/deep.ts');
    expect(target?.fileIndex).toBe(7);
  });

  it('returns null for an identifier that matches nothing', () => {
    expect(resolveFileTreeTarget(files, 'does/not/exist.ts')).toBeNull();
  });

  it('returns null for an empty file list', () => {
    expect(resolveFileTreeTarget([], 'src/added.ts')).toBeNull();
  });
});

describe('fileTreeAdapter — buildFileTreePaths', () => {
  it('emits exactly one canonical path per file, never oldPath, in file order', () => {
    expect(buildFileTreePaths(files)).toEqual([
      'src/added.ts',
      'src/deleted.ts',
      'src/new-name.ts',
      'assets/logo.png',
      'dist/bundle.min.js',
      'src/Utils/Helper.ts',
      'src/utils/helper.ts',
      'src/a/b/c/d/e/deep.ts',
    ]);
    expect(buildFileTreePaths(files)).not.toContain('src/old-name.ts');
  });

  it('returns an empty array for zero files', () => {
    expect(buildFileTreePaths([])).toEqual([]);
  });
});

describe('fileTreeAdapter — getRevealAncestorPaths', () => {
  it('returns [] for a true root-level file (no directory segments)', () => {
    const rootFiles = [...files, diffFile('README.md')];
    expect(getRevealAncestorPaths(rootFiles, 'README.md')).toEqual([]);
  });

  it('returns the immediate parent for a file one directory deep', () => {
    expect(getRevealAncestorPaths(files, 'assets/logo.png')).toEqual(['assets']);
  });

  it('returns every ancestor for a deeply nested file', () => {
    expect(getRevealAncestorPaths(files, 'src/a/b/c/d/e/deep.ts')).toEqual([
      'src',
      'src/a',
      'src/a/b',
      'src/a/b/c',
      'src/a/b/c/d',
      'src/a/b/c/d/e',
    ]);
  });

  it('resolves ancestors for a rename via its OLD path (current ancestry, not stale)', () => {
    expect(getRevealAncestorPaths(files, 'src/old-name.ts')).toEqual(['src']);
  });

  it('returns [] when the identifier does not resolve', () => {
    expect(getRevealAncestorPaths(files, 'nope.ts')).toEqual([]);
  });
});

describe('fileTreeAdapter — getAllFilesTarget (all-files target)', () => {
  it('places every fixture file somewhere in the folders-first visual order', () => {
    for (const file of files) {
      const target = getAllFilesTarget(files, file.path);
      expect(target).not.toBeNull();
      expect(target!.fileIndex).toBe(files.indexOf(file));
      expect(target!.visualIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('resolves a renamed file\'s all-files target via its OLD path', () => {
    const byOld = getAllFilesTarget(files, 'src/old-name.ts');
    const byNew = getAllFilesTarget(files, 'src/new-name.ts');
    expect(byOld).toEqual(byNew);
  });

  it('gives case-distinct siblings distinct, deterministic all-files positions', () => {
    const upper = getAllFilesTarget(files, 'src/Utils/Helper.ts');
    const lower = getAllFilesTarget(files, 'src/utils/helper.ts');
    expect(upper!.fileIndex).not.toBe(lower!.fileIndex);
    expect(upper!.visualIndex).not.toBe(lower!.visualIndex);
  });

  it('returns null when the identifier does not resolve', () => {
    expect(getAllFilesTarget(files, 'nope.ts')).toBeNull();
  });

  it('returns null for an empty file list', () => {
    expect(getAllFilesTarget([], 'src/added.ts')).toBeNull();
  });
});

describe('fileTreeAdapter — status-independent change counts', () => {
  it('reports raw additions/deletions regardless of status, including 0/0 for a binary file', () => {
    expect(getChangeCounts(added)).toEqual({ additions: 12, deletions: 0 });
    expect(getChangeCounts(deleted)).toEqual({ additions: 0, deletions: 8 });
    expect(getChangeCounts(renamed)).toEqual({ additions: 2, deletions: 1 });
    expect(getChangeCounts(binary)).toEqual({ additions: 0, deletions: 0 });
    expect(getChangeCounts(generated)).toEqual({ additions: 500, deletions: 3 });
  });
});

describe('fileTreeAdapter — annotation counts', () => {
  it('counts annotations per canonical path, ignoring any oldPath', () => {
    const annotations = [
      annotation('src/added.ts'),
      annotation('src/added.ts'),
      annotation('src/new-name.ts'),
    ];
    const counts = buildAnnotationCountMap(annotations);
    expect(counts.get('src/added.ts')).toBe(2);
    expect(counts.get('src/new-name.ts')).toBe(1);
    expect(counts.get('src/old-name.ts')).toBeUndefined();
  });

  it('returns an empty map for no annotations', () => {
    expect(buildAnnotationCountMap([]).size).toBe(0);
  });

  it('keeps case-distinct paths as separate annotation buckets', () => {
    const counts = buildAnnotationCountMap([annotation('src/Utils/Helper.ts'), annotation('src/utils/helper.ts')]);
    expect(counts.get('src/Utils/Helper.ts')).toBe(1);
    expect(counts.get('src/utils/helper.ts')).toBe(1);
  });
});

describe('fileTreeAdapter — viewed state', () => {
  it('reads viewed state off the canonical path only', () => {
    const viewed = new Set<string>(['src/new-name.ts', 'assets/logo.png']);
    expect(isFileViewed(viewed, renamed)).toBe(true);
    expect(isFileViewed(viewed, binary)).toBe(true);
    expect(isFileViewed(viewed, added)).toBe(false);
  });

  it('does not treat a marked oldPath as viewed for the renamed file', () => {
    const viewed = new Set<string>(['src/old-name.ts']);
    expect(isFileViewed(viewed, renamed)).toBe(false);
  });
});

describe('fileTreeAdapter — selection', () => {
  it('selects only the active file\'s canonical path', () => {
    expect(getSelectedPaths(files, 2)).toEqual(['src/new-name.ts']);
  });

  it('selects nothing when activeFileIndex is -1 (All files / other panels active)', () => {
    expect(getSelectedPaths(files, -1)).toEqual([]);
  });

  it('selects nothing when activeFileIndex is out of range', () => {
    expect(getSelectedPaths(files, 99)).toEqual([]);
  });
});

describe('fileTreeAdapter — revealFileInTree against a live @pierre/trees model', () => {
  function makeModel() {
    return new TreesFileTree({ paths: buildFileTreePaths(files), initialExpansion: 'closed' });
  }

  it('selecting/revealing an added (top-level-in-folder) file reaches the correct single-file and all-files target', () => {
    const model = makeModel();
    try {
      const target = revealFileInTree(model, files, 'src/added.ts');
      expect(target?.canonicalPath).toBe('src/added.ts');
      expect(model.getSelectedPaths()).toEqual(['src/added.ts']);
      expect(model.getFocusedPath()).toBe('src/added.ts');
      const allFiles = getAllFilesTarget(files, 'src/added.ts');
      expect(allFiles?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('selecting/revealing a deleted file reaches the correct single-file and all-files target', () => {
    const model = makeModel();
    try {
      const target = revealFileInTree(model, files, 'src/deleted.ts');
      expect(target?.canonicalPath).toBe('src/deleted.ts');
      expect(model.getSelectedPaths()).toEqual(['src/deleted.ts']);
      expect(getAllFilesTarget(files, 'src/deleted.ts')?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('revealing a renamed file by its OLD path selects the tree node at the NEW path', () => {
    const model = makeModel();
    try {
      const target = revealFileInTree(model, files, 'src/old-name.ts');
      expect(target?.canonicalPath).toBe('src/new-name.ts');
      expect(model.getSelectedPaths()).toEqual(['src/new-name.ts']);
      expect(model.getFocusedPath()).toBe('src/new-name.ts');
      // The model was never asked about the old path directly.
      expect(model.getItem('src/old-name.ts')).toBeNull();
      expect(getAllFilesTarget(files, 'src/new-name.ts')?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('selecting/revealing a binary file reaches the correct single-file and all-files target', () => {
    const model = makeModel();
    try {
      const target = revealFileInTree(model, files, 'assets/logo.png');
      expect(target?.canonicalPath).toBe('assets/logo.png');
      expect(model.getSelectedPaths()).toEqual(['assets/logo.png']);
      expect(getAllFilesTarget(files, 'assets/logo.png')?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('selecting/revealing a generated file reaches the correct single-file and all-files target', () => {
    const model = makeModel();
    try {
      const target = revealFileInTree(model, files, 'dist/bundle.min.js');
      expect(target?.canonicalPath).toBe('dist/bundle.min.js');
      expect(model.getSelectedPaths()).toEqual(['dist/bundle.min.js']);
      expect(getAllFilesTarget(files, 'dist/bundle.min.js')?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('selecting/revealing case-distinct siblings reaches two DIFFERENT single-file and all-files targets', () => {
    const model = makeModel();
    try {
      const upperTarget = revealFileInTree(model, files, 'src/Utils/Helper.ts');
      expect(model.getSelectedPaths()).toEqual(['src/Utils/Helper.ts']);

      const lowerTarget = revealFileInTree(model, files, 'src/utils/helper.ts');
      // Revealing the lower-case sibling deselects the upper-case one — single-select.
      expect(model.getSelectedPaths()).toEqual(['src/utils/helper.ts']);
      expect(model.getFocusedPath()).toBe('src/utils/helper.ts');

      expect(upperTarget?.canonicalPath).not.toBe(lowerTarget?.canonicalPath);
      const upperAllFiles = getAllFilesTarget(files, 'src/Utils/Helper.ts');
      const lowerAllFiles = getAllFilesTarget(files, 'src/utils/helper.ts');
      expect(upperAllFiles?.fileIndex).not.toBe(lowerAllFiles?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('selecting/revealing a deeply nested file expands every ancestor and reaches the correct targets', () => {
    const model = makeModel();
    try {
      // Closed initial expansion: ancestors start collapsed.
      for (const ancestor of getRevealAncestorPaths(files, 'src/a/b/c/d/e/deep.ts')) {
        const item = model.getItem(ancestor);
        expect(item && 'isExpanded' in item && item.isExpanded()).toBe(false);
      }

      const target = revealFileInTree(model, files, 'src/a/b/c/d/e/deep.ts');
      expect(target?.canonicalPath).toBe('src/a/b/c/d/e/deep.ts');
      expect(model.getSelectedPaths()).toEqual(['src/a/b/c/d/e/deep.ts']);
      expect(model.getFocusedPath()).toBe('src/a/b/c/d/e/deep.ts');

      for (const ancestor of getRevealAncestorPaths(files, 'src/a/b/c/d/e/deep.ts')) {
        const item = model.getItem(ancestor);
        expect(item && 'isExpanded' in item && item.isExpanded()).toBe(true);
      }

      expect(getAllFilesTarget(files, 'src/a/b/c/d/e/deep.ts')?.fileIndex).toBe(target?.fileIndex);
    } finally {
      model.cleanUp();
    }
  });

  it('reveal is a no-op (no selection change, no throw) for an identifier that does not resolve', () => {
    const model = makeModel();
    try {
      revealFileInTree(model, files, 'src/added.ts');
      const before = model.getSelectedPaths();
      const result = revealFileInTree(model, files, 'does/not/exist.ts');
      expect(result).toBeNull();
      expect(model.getSelectedPaths()).toEqual(before);
    } finally {
      model.cleanUp();
    }
  });
});
