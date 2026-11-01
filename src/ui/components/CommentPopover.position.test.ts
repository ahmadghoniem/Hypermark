import { describe, expect, test } from 'bun:test';
import { computeCommentPopoverPosition } from './CommentPopover';

const bounds = (height: number) => ({ top: 0, left: 0, right: 1200, bottom: height, width: 1200, height });
const anchor = (top: number, bottom: number) => ({ top, bottom, left: 500, right: 600, width: 100 });

describe('computeCommentPopoverPosition', () => {
  test('end alignment puts the right edge at the anchor, clamped to the window', () => {
    const rect = { top: 100, bottom: 120, left: 800, right: 820, width: 20 };
    expect(computeCommentPopoverPosition(rect, bounds(900), 'end').left).toBe(820 - 320);
    const nearLeft = { ...rect, left: 40, right: 60 };
    expect(computeCommentPopoverPosition(nearLeft, bounds(900), 'end').left).toBe(0);
  });

  test('opens below the anchor when there is room', () => {
    const pos = computeCommentPopoverPosition(anchor(100, 120), bounds(900));
    expect(pos.flipAbove).toBe(false);
    expect(pos.top).toBe(128);
    expect(pos.maxHeight).toBe(900 - 128);
  });

  test('flips above when only the space above has room', () => {
    const pos = computeCommentPopoverPosition(anchor(700, 800), bounds(900));
    expect(pos.flipAbove).toBe(true);
    expect(pos.top).toBe(692);
  });

  // A highlight taller than the window: the composer stays a popover and
  // overlaps the anchor at the window's edge instead of opening a dialog.
  test('overlaps the anchor inside the window when neither side has room', () => {
    const below = computeCommentPopoverPosition(anchor(50, 800), bounds(900));
    expect(below.flipAbove).toBe(false);
    expect(below.top).toBe(900 - 280);
    expect(below.maxHeight).toBe(280);

    const above = computeCommentPopoverPosition(anchor(200, 890), bounds(900));
    expect(above.flipAbove).toBe(true);
    expect(above.top).toBe(280);
    expect(above.maxHeight).toBe(280);
  });

  test('a window shorter than the minimum gets the whole height', () => {
    const pos = computeCommentPopoverPosition(anchor(20, 200), bounds(220));
    expect(pos.maxHeight).toBe(220);
    expect(pos.top).toBe(0);
  });
});
