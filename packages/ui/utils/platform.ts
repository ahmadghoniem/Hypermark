/**
 * Keyboard shortcut spellings.
 *
 * Canonical source — import from here instead of inlining navigator checks.
 * Used across the plan editor, code review, and shared UI components.
 *
 * Windows only: these are constants, kept as named exports so callers read
 * the same either way.
 */
export const modKey = 'Ctrl';
export const altKey = 'Alt';
export const submitHint = 'Ctrl+Enter';
/**
 * The primary modifier spelled for PROSE ("Ctrl+click"). Use this in
 * sentences; use `modKey` in key hints and shortcut chips.
 */
export const modKeyWord = 'Ctrl';
/**
 * The primary modifier's own `KeyboardEvent.key` name, for features that arm
 * on the modifier being HELD rather than on a chord. Pair with `isModKeyHeld`:
 * this identifies the key itself, that reads the held flag off any event.
 */
export const modEventKey = 'Control';
/** Whether the primary modifier is down for this event. */
export function isModKeyHeld(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.ctrlKey;
}
