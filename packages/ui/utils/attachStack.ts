/** Collapsed attachment stack: how many tiles show before a +N tile. */
export const STACK_MAX_COLLAPSED = 3;
/** Delay before a spread stack collapses once the pointer or focus leaves. */
export const STACK_COLLAPSE_DELAY_MS = 150;
/** After a removal, further removals are ignored for this long. */
export const STACK_REMOVE_GUARD_MS = 250;

export interface StackLayout {
  /** Indexes of the tiles to render, in order. */
  visible: number[];
  /** Tiles folded into the +N tile; 0 when there is none. */
  overflow: number;
}

export function stackLayout(count: number, expanded: boolean, maxCollapsed = STACK_MAX_COLLAPSED): StackLayout {
  if (count <= 0) return { visible: [], overflow: 0 };
  const shown = expanded ? count : Math.min(count, maxCollapsed);
  return {
    visible: Array.from({ length: shown }, (_, i) => i),
    overflow: count - shown,
  };
}

/** True when a removal at `now` falls inside the guard window of the last one. */
export function isRemovalGuarded(lastRemovalAt: number, now: number, guardMs = STACK_REMOVE_GUARD_MS): boolean {
  return now - lastRemovalAt < guardMs;
}
