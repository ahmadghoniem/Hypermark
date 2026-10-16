import { describe, test, expect } from 'bun:test';
import { isRemovalGuarded } from './attachStack';

describe('isRemovalGuarded', () => {
  test('inside and outside the window', () => {
    expect(isRemovalGuarded(1000, 1100)).toBe(true);
    expect(isRemovalGuarded(1000, 1250)).toBe(false);
  });
});
