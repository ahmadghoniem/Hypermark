import { describe, expect, test } from 'bun:test';
import { fileName, pathSegments, shortPath } from './displayPath';

// Windows paths are built from this rather than written inline: a literal
// backslash in a test fixture is one editor away from being eaten silently,
// and a separator test that stopped containing separators still passes.
const BACK = String.fromCharCode(92);
const win = (...segments: string[]) => segments.join(BACK);

describe('fileName', () => {
  test('reads both separators', () => {
    expect(fileName('packages/editor/App.tsx')).toBe('App.tsx');
    expect(fileName(win('C:', 'Users', 'Ada', 'Hypermark', 'App.tsx'))).toBe('App.tsx');
    expect(fileName(win('C:', 'Users') + '/Ada/' + win('editor', 'App.tsx'))).toBe('App.tsx');
  });

  test('a bare name is already the answer', () => {
    expect(fileName('App.tsx')).toBe('App.tsx');
  });

  test('a trailing separator does not yield an empty name', () => {
    expect(fileName('packages/editor/')).toBe('editor');
    expect(fileName(win('C:', 'Users', 'Ada', ''))).toBe('Ada');
  });
});

describe('shortPath', () => {
  test('keeps the tail and marks what it dropped', () => {
    expect(shortPath(win('C:', 'Users', 'Ada', 'Hypermark', 'editor', 'App.tsx')))
      .toBe('…/editor/App.tsx');
    expect(shortPath('packages/editor/App.tsx', 3)).toBe('packages/editor/App.tsx');
  });

  test('a path already short enough is left unmarked', () => {
    expect(shortPath('editor/App.tsx')).toBe('editor/App.tsx');
    expect(shortPath('App.tsx')).toBe('App.tsx');
  });

  test('always renders with forward slashes', () => {
    expect(shortPath(win('C:', 'Users', 'Ada', 'App.tsx'))).toBe('…/Ada/App.tsx');
  });
});

describe('pathSegments', () => {
  test('drops the empties a leading or doubled separator leaves', () => {
    expect(pathSegments('/a//b/')).toEqual(['a', 'b']);
    expect(pathSegments(win('', '', 'server', 'share', 'f.ts'))).toEqual(['server', 'share', 'f.ts']);
  });
});
