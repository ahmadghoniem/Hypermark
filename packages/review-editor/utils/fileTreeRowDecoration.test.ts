import { describe, it, expect } from 'bun:test';
import { FileTree as TreesFileTree } from '@pierre/trees';
import type { DiffFile } from '../types';
import { buildRowDecoration } from './fileTreeRowDecoration';
import { buildFileTreePaths } from './fileTreeAdapter';

const diffFile = (path: string, overrides: Partial<DiffFile> = {}): DiffFile => ({
  path,
  patch: '',
  additions: 0,
  deletions: 0,
  status: 'modified',
  ...overrides,
});

const base = {
  annotationCount: 0,
};

const textOf = (file: DiffFile, overrides: Partial<Parameters<typeof buildRowDecoration>[0]> = {}) =>
  buildRowDecoration({ file, ...base, ...overrides })?.text;

const partsOf = (file: DiffFile, overrides: Partial<Parameters<typeof buildRowDecoration>[0]> = {}) =>
  buildRowDecoration({ file, ...base, ...overrides })?.parts ?? [];

describe('buildRowDecoration — retained per-row metadata (spec 04:67-68)', () => {
  it('renders the additions/deletions pair with distinct colors', () => {
    const parts = partsOf(diffFile('src/a.ts', { additions: 12, deletions: 4 }));
    const add = parts.find(part => part.text === '+12');
    const del = parts.find(part => part.text === '-4');
    expect(add).toBeDefined();
    expect(del).toBeDefined();
    expect(add!.color).not.toBe(del!.color);
  });

  it('omits a zero side rather than printing +0 or -0', () => {
    expect(textOf(diffFile('src/a.ts', { additions: 5, deletions: 0 }))).toContain('+5');
    expect(textOf(diffFile('src/a.ts', { additions: 5, deletions: 0 }))).not.toContain('-0');
    expect(textOf(diffFile('src/b.ts', { additions: 0, deletions: 3 }))).not.toContain('+0');
  });

  it('shows the annotation count and pluralizes its tooltip', () => {
    const one = buildRowDecoration({ file: diffFile('src/a.ts'), ...base, annotationCount: 1 });
    const many = buildRowDecoration({ file: diffFile('src/a.ts'), ...base, annotationCount: 3 });
    expect(one!.title).toContain('1 annotation');
    expect(one!.title).not.toContain('1 annotations');
    expect(many!.text).toContain('3');
    expect(many!.title).toContain('3 annotations');
  });

  it('omits the annotation bit entirely at zero', () => {
    expect(textOf(diffFile('src/a.ts'), { annotationCount: 0 })).not.toContain('✎');
  });

  it('carries the change-type letter for each status', () => {
    expect(textOf(diffFile('a.ts', { status: 'added' }))).toContain('A');
    expect(textOf(diffFile('a.ts', { status: 'deleted' }))).toContain('D');
    expect(textOf(diffFile('a.ts', { status: 'renamed' }))).toContain('R');
    expect(textOf(diffFile('a.ts', { status: 'modified' }))).toContain('M');
  });

  it('names the rename source in the tooltip, and never in the visible text', () => {
    const decoration = buildRowDecoration({
      file: diffFile('src/new.ts', { status: 'renamed', oldPath: 'src/old.ts' }),
      ...base,
    });
    expect(decoration!.title).toContain('Renamed from src/old.ts');
    expect(decoration!.text).not.toContain('src/old.ts');
  });

  it('distinguishes committed and untracked in since-base mode', () => {
    const committed = buildRowDecoration({
      file: diffFile('src/a.ts'),
      ...base,
      sectionEntry: { group: 'committed' },
    });
    expect(committed!.title).toContain('Committed since base');

    const untracked = buildRowDecoration({
      file: diffFile('src/b.ts'),
      ...base,
      sectionEntry: { group: 'untracked' },
    });
    expect(untracked!.text).toContain('U');
    expect(untracked!.title).toContain('Untracked file');
  });

  it('uses theme custom properties, never hard-coded colors', () => {
    // Hard-coded hex would break the seven-palette contract from spec 03.
    const parts = partsOf(diffFile('src/a.ts', { status: 'added', additions: 3, deletions: 1 }), {
      annotationCount: 2,
    });
    for (const part of parts) {
      if (part.color) expect(part.color).toMatch(/^var\(--/);
    }
  });

  it('orders the row as type, dot, annotations, then counts', () => {
    const decoration = buildRowDecoration({
      file: diffFile('src/a.ts', { status: 'added', additions: 7, deletions: 2 }),
      ...base,
      annotationCount: 4,
      sectionEntry: { group: 'committed' },
    });
    const text = decoration!.text;
    expect(text.indexOf('A')).toBeLessThan(text.indexOf('●'));
    expect(text.indexOf('●')).toBeLessThan(text.indexOf('✎4'));
    expect(text.indexOf('✎4')).toBeLessThan(text.indexOf('+7'));
    expect(text.indexOf('+7')).toBeLessThan(text.indexOf('-2'));
  });

  it('keeps text and parts in agreement', () => {
    const decoration = buildRowDecoration({
      file: diffFile('src/a.ts', { status: 'renamed', oldPath: 'src/b.ts', additions: 1, deletions: 1 }),
      ...base,
      annotationCount: 2,
    });
    expect(decoration!.text).toBe(decoration!.parts.map(part => part.text).join(' '));
  });
});

describe('the fixed tree contract (spec 04:39-48)', () => {
  const files = [
    diffFile('src/deep/a/b/c/leaf.ts'),
    diffFile('src/top.ts'),
    diffFile('README.md'),
  ];

  const makeModel = () =>
    new TreesFileTree({
      paths: buildFileTreePaths(files),
      initialExpansion: 'open',
      flattenEmptyDirectories: true,
      search: true,
      fileTreeSearchMode: 'hide-non-matches',
      icons: 'complete',
    });

  it('opens folders on a fresh tree', () => {
    const model = makeModel();
    const src = model.getItem('src');
    expect(src).not.toBeNull();
    expect('isExpanded' in src! && src!.isExpanded()).toBe(true);
  });

  it('reaches a deeply nested file through opened ancestors', () => {
    const model = makeModel();
    expect(model.getItem('src/deep/a/b/c/leaf.ts')).not.toBeNull();
  });

  it('never registers a path the file set does not contain', () => {
    const model = makeModel();
    expect(model.getItem('src/nope.ts')).toBeNull();
  });

  it('hides non-matches when a query is set, and restores them when cleared', () => {
    const model = makeModel();
    model.setSearch('README');
    expect(model.getItem('README.md')).not.toBeNull();
    model.setSearch(null);
    expect(model.getItem('src/top.ts')).not.toBeNull();
  });
});
