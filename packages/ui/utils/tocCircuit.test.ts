import { describe, test, expect } from 'bun:test';
import { buildTocActivePath, buildTocCircuitPath, tocLineX } from './tocCircuit';

describe('tocLineX', () => {
  test('levels 1 and 2 share the outer track', () => {
    expect(tocLineX(1)).toBe(6);
    expect(tocLineX(2)).toBe(6);
    expect(tocLineX(3)).toBe(18);
  });
});

describe('buildTocCircuitPath', () => {
  test('empty', () => {
    expect(buildTocCircuitPath([])).toBe('');
  });
  test('single row', () => {
    expect(buildTocCircuitPath([2])).toBe('M 6 6 L 6 22');
  });
  test('bends inward for a level-3 heading', () => {
    expect(buildTocCircuitPath([1, 2, 3])).toBe('M 6 6 L 6 28 L 6 49 C 6 56, 18 56, 18 63 L 18 78');
  });
  test('bends back out', () => {
    expect(buildTocCircuitPath([3, 2])).toBe('M 18 6 L 18 21 C 18 28, 6 28, 6 35 L 6 50');
  });
  test('dialled row height and tracks', () => {
    expect(buildTocCircuitPath([1, 3], 32, 8, 24)).toBe('M 8 6 L 8 25 C 8 32, 24 32, 24 39 L 24 58');
  });
});

describe('buildTocActivePath', () => {
  test('active segment sits on its row track', () => {
    expect(buildTocActivePath([1, 2, 3], 2)).toBe('M 18 63 L 18 79');
  });
  test('no active heading', () => {
    expect(buildTocActivePath([1, 2], -1)).toBe('');
  });
});
