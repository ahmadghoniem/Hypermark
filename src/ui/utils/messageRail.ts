/** Tick width at rest: the open message, and every other one. */
export const RAIL_TICK_OPEN = 20;
export const RAIL_TICK_REST = 12;
/** Width of the hovered tick; its neighbours fall off from it. */
export const RAIL_TICK_HOVER_MAX = 32;
/** Floor for ticks far from the pointer. */
const RAIL_TICK_MIN = 8;

export interface RailTickSizes {
  open?: number;
  rest?: number;
  hoverMax?: number;
}

/**
 * Tick width in px. At rest the open message is 20 and the rest 12. While a
 * tick is hovered or focused, widths fall off with distance from it: 32, 22,
 * 14, then 8.
 */
export function railTickWidth(
  index: number,
  activeIndex: number | null,
  selectedIndex: number,
  sizes: RailTickSizes = {},
): number {
  const { open = RAIL_TICK_OPEN, rest = RAIL_TICK_REST, hoverMax = RAIL_TICK_HOVER_MAX } = sizes;
  if (activeIndex === null) return index === selectedIndex ? open : rest;
  const falloff = [hoverMax, hoverMax - 10, hoverMax - 18];
  return Math.max(RAIL_TICK_MIN, falloff[Math.abs(index - activeIndex)] ?? RAIL_TICK_MIN);
}

/** First non-empty line of a message, without leading markdown marks, capped. */
export function railPreview(text: string, max = 90): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '').trim())
    .find((l) => l.length > 0) ?? '';
  const flat = line.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * A message the rail can hide: one line with no line breaks, at most `max`
 * characters ("Approved.", "API Error: …").
 */
export function isShortMessage(text: string, max = 200): boolean {
  const trimmed = text.trim();
  return !trimmed.includes('\n') && trimmed.length <= max;
}

/** "just now", "5m ago", "3h ago", "2d ago"; null for a missing or invalid time. */
export function formatRelativeTime(timestamp: string | undefined, now: number): string | null {
  if (!timestamp) return null;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The parts of a WheelEvent the stepper reads. */
export interface WheelStepInput {
  deltaY: number;
  deltaMode: number;
  timeStamp: number;
}

/**
 * Turns wheel events into steps of one message (-1 up, 1 down, 0 none).
 * Scroll amounts add up until they pass `step` px, so a mouse notch (100px in
 * Chrome) is one step and a trackpad's small events add up to one. After a
 * step, amounts are dropped for `cooldown` ms, so a fast spin doesn't skip
 * past messages.
 */
export function createWheelStepper({ step = 20, cooldown = 100 } = {}) {
  let total = 0;
  let lockedUntil = -Infinity;
  return ({ deltaY, deltaMode, timeStamp }: WheelStepInput): -1 | 0 | 1 => {
    if (timeStamp < lockedUntil) return 0;
    // deltaMode 1 counts lines, 2 pages.
    total += deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1);
    if (Math.abs(total) < step) return 0;
    const direction = total > 0 ? 1 : -1;
    total = 0;
    lockedUntil = timeStamp + cooldown;
    return direction;
  };
}
