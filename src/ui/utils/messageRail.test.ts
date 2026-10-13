import { describe, test, expect } from 'bun:test';
import { createWheelStepper, formatRelativeTime, isShortMessage, railPreview, railTickWidth } from './messageRail';

describe('railTickWidth', () => {
  test('at rest the open message is longer', () => {
    expect(railTickWidth(3, null, 3)).toBe(20);
    expect(railTickWidth(2, null, 3)).toBe(12);
  });
  test('hover falls off with distance', () => {
    expect(railTickWidth(5, 5, 0)).toBe(32);
    expect(railTickWidth(4, 5, 0)).toBe(22);
    expect(railTickWidth(7, 5, 0)).toBe(14);
    expect(railTickWidth(0, 5, 0)).toBe(8);
  });
  test('dialled sizes, with the floor holding', () => {
    expect(railTickWidth(2, null, 2, { open: 28, rest: 8 })).toBe(28);
    expect(railTickWidth(5, 5, 0, { hoverMax: 24 })).toBe(24);
    expect(railTickWidth(7, 5, 0, { hoverMax: 24 })).toBe(8);
  });
});

describe('railPreview', () => {
  test('skips blank lines and markdown marks', () => {
    expect(railPreview('\n\n## Remove the agent terminal\nmore')).toBe('Remove the agent terminal');
    expect(railPreview('- item one')).toBe('item one');
  });
  test('caps long lines', () => {
    expect(railPreview('a'.repeat(200), 10)).toBe('aaaaaaaaa…');
  });
});

describe('isShortMessage', () => {
  test('one line up to the cap', () => {
    expect(isShortMessage('  Approved.  ')).toBe(true);
    expect(isShortMessage('a'.repeat(200))).toBe(true);
    expect(isShortMessage('a'.repeat(201))).toBe(false);
  });
  test('any line break makes it long', () => {
    expect(isShortMessage('Done.\n\nTests pass.')).toBe(false);
    expect(isShortMessage('Done.\n')).toBe(true);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  test('buckets', () => {
    expect(formatRelativeTime('2026-09-16T11:59:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-09-16T11:55:00Z', now)).toBe('5m ago');
    expect(formatRelativeTime('2026-09-16T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-09-14T12:00:00Z', now)).toBe('2d ago');
  });
  test('missing or invalid', () => {
    expect(formatRelativeTime(undefined, now)).toBeNull();
    expect(formatRelativeTime('nope', now)).toBeNull();
  });
});

describe('createWheelStepper', () => {
  const run = (events: [deltaY: number, time: number, deltaMode?: number][]) => {
    const stepper = createWheelStepper();
    return events.map(([deltaY, timeStamp, deltaMode = 0]) => stepper({ deltaY, deltaMode, timeStamp }));
  };
  test('one mouse notch is one step, either way', () => {
    expect(run([[100, 0]])).toEqual([1]);
    expect(run([[-100, 0]])).toEqual([-1]);
    expect(run([[3, 0, 1]])).toEqual([1]);
  });
  test('small trackpad amounts add up to one step', () => {
    expect(run([[5, 0], [6, 16], [7, 32], [4, 48]])).toEqual([0, 0, 0, 1]);
  });
  test('a fast spin steps once per cooldown', () => {
    expect(run([[100, 0], [100, 40], [100, 120], [100, 170], [100, 200]])).toEqual([1, 0, 1, 0, 0]);
  });
  test('amounts the other way cancel out', () => {
    expect(run([[15, 0], [-10, 16], [10, 32], [5, 48]])).toEqual([0, 0, 0, 1]);
  });
});
