import { createShortcutRegistry, type ShortcutRegistry } from './core';
import { historyShortcuts } from './history.shortcuts';

import { annotationModeShortcuts } from './document/annotationMode.shortcuts';
import { annotationPanelShortcuts } from './document/annotationPanel.shortcuts';
import { commentPopoverShortcuts } from './document/commentPopover.shortcuts';
import { viewerShortcuts } from './document/viewer.shortcuts';

/**
 * Which scopes make up each app, so one place can answer "what are the
 * shortcuts here?".
 *
 * The scope files have always been the runtime's source of truth — every
 * handler that dispatches through `useShortcutScope` reads its binding from
 * one. What was missing was the other half: nothing aggregated them, so the
 * Settings panel rendered a SECOND, hand-typed list of the same keys. The two
 * drifted exactly as you would expect. They listed shortcuts that had been
 * deleted (`A` to stage a file, `Alt Alt` to switch feedback destination, both
 * gone with the features they belonged to) and omitted ones that worked
 * (annotation undo and redo, among others).
 *
 * `createShortcutRegistry` rejects a duplicate scope id, so a scope can be
 * listed on more than one surface but never twice on the same one.
 */

/** Annotate: reading a document or message and marking it up. */
export const annotateShortcutRegistry: ShortcutRegistry = createShortcutRegistry([
  historyShortcuts,
  annotationModeShortcuts,
  annotationPanelShortcuts,
  commentPopoverShortcuts,
  viewerShortcuts,
]);

export type ShortcutSurfaceMode = 'annotate';

/** The registry backing one app's help panel. */
export function getShortcutRegistryForMode(_mode: ShortcutSurfaceMode): ShortcutRegistry {
  return annotateShortcutRegistry;
}
