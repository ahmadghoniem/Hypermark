import { describe, expect, test } from 'bun:test';
import { CANVAS_GROUPS, CANVAS_OMISSIONS } from './canvasManifest';

describe('canvas manifest', () => {
  test('group ids are unique', () => {
    const ids = CANVAS_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every group has slots with unique ids and labels', () => {
    for (const group of CANVAS_GROUPS) {
      expect(group.slots.length).toBeGreaterThan(0);
      const ids = group.slots.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const slot of group.slots) expect(slot.label.trim()).not.toBe('');
      expect(group.columns).toBeGreaterThan(0);
      expect(group.slotWidth).toBeGreaterThan(0);
    }
  });

  test('every omission says why', () => {
    for (const omission of CANVAS_OMISSIONS) {
      expect(omission.what.trim()).not.toBe('');
      expect(omission.why.trim()).not.toBe('');
    }
  });
});
