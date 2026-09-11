import { createShortcutRegistry, type ShortcutRegistry } from './core';
import { decisionControlShortcuts } from './decisionControl.shortcuts';
import { historyShortcuts } from './history.shortcuts';

import { annotationModeShortcuts } from './plan-review/annotationMode.shortcuts';
import { annotationPanelShortcuts } from './plan-review/annotationPanel.shortcuts';
import { annotationToolbarShortcuts } from './plan-review/annotationToolbar.shortcuts';
import { annotateSidebarShortcuts } from './plan-review/sidebar.shortcuts';
import { commentPopoverShortcuts } from './plan-review/commentPopover.shortcuts';
import { documentViewShortcuts } from './plan-review/documentView.shortcuts';
import { htmlAnnotateShortcuts } from './plan-review/htmlAnnotate.shortcuts';
import { inputMethodShortcuts } from './plan-review/inputMethod.shortcuts';
import { viewerShortcuts } from './plan-review/viewer.shortcuts';

import { reviewAllFilesDiffShortcuts } from './code-review/allFilesDiff.shortcuts';
import { reviewAnnotationToolbarShortcuts } from './code-review/annotationToolbar.shortcuts';
import { reviewChromeShortcuts } from './code-review/reviewChrome.shortcuts';
import { reviewFileTreeShortcuts } from './code-review/fileTree.shortcuts';
import { reviewPrCommentsShortcuts } from './code-review/prComments.shortcuts';

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

/** Plan review: reading a proposed plan and deciding on it. */
export const planShortcutRegistry: ShortcutRegistry = createShortcutRegistry([
  decisionControlShortcuts,
  historyShortcuts,
  documentViewShortcuts,
  inputMethodShortcuts,
  annotationModeShortcuts,
  annotationToolbarShortcuts,
  annotationPanelShortcuts,
  commentPopoverShortcuts,
  viewerShortcuts,
  htmlAnnotateShortcuts,
]);

/** Annotate: the same document surface, plus its own sidebar rail. */
export const annotateShortcutRegistry: ShortcutRegistry = createShortcutRegistry([
  ...planShortcutRegistry,
  annotateSidebarShortcuts,
]);

/** Code review: diffs, files, and the review decision. */
export const reviewShortcutRegistry: ShortcutRegistry = createShortcutRegistry([
  decisionControlShortcuts,
  historyShortcuts,
  reviewChromeShortcuts,
  reviewFileTreeShortcuts,
  reviewAllFilesDiffShortcuts,
  reviewAnnotationToolbarShortcuts,
  reviewPrCommentsShortcuts,
]);

export type ShortcutSurfaceMode = 'plan' | 'annotate' | 'review';

/** The registry backing one app's help panel. */
export function getShortcutRegistryForMode(mode: ShortcutSurfaceMode): ShortcutRegistry {
  if (mode === 'review') return reviewShortcutRegistry;
  if (mode === 'annotate') return annotateShortcutRegistry;
  return planShortcutRegistry;
}
