import { describe, test, expect } from 'bun:test';
import { stackLayout, isRemovalGuarded } from './attachStack';

describe('stackLayout', () => {
  test('empty', () => {
    expect(stackLayout(0, false)).toEqual({ visible: [], overflow: 0 });
    expect(stackLayout(0, true)).toEqual({ visible: [], overflow: 0 });
  });
  test('up to three collapsed tiles show without overflow', () => {
    expect(stackLayout(3, false)).toEqual({ visible: [0, 1, 2], overflow: 0 });
  });
  test('more than three collapse into +N', () => {
    expect(stackLayout(5, false)).toEqual({ visible: [0, 1, 2], overflow: 2 });
  });
  test('expanded shows every tile', () => {
    expect(stackLayout(5, true)).toEqual({ visible: [0, 1, 2, 3, 4], overflow: 0 });
  });
});

describe('isRemovalGuarded', () => {
  test('inside and outside the window', () => {
    expect(isRemovalGuarded(1000, 1100)).toBe(true);
    expect(isRemovalGuarded(1000, 1250)).toBe(false);
  });
});
