/** After a removal, further removals are ignored for this long. */
export const STACK_REMOVE_GUARD_MS = 250;

/** True when a removal at `now` falls inside the guard window of the last one. */
export function isRemovalGuarded(lastRemovalAt: number, now: number, guardMs = STACK_REMOVE_GUARD_MS): boolean {
  return now - lastRemovalAt < guardMs;
}
