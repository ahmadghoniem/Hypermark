export * from './core';
export * from './runtime';
export { historyShortcuts, useHistoryShortcuts } from './history.shortcuts';
export { decisionControlShortcuts } from './decisionControl.shortcuts';

// plan-review scopes
export { annotationModeShortcuts } from './plan-review/annotationMode.shortcuts';
export { annotationToolbarShortcuts } from './plan-review/annotationToolbar.shortcuts';
export { annotationPanelShortcuts } from './plan-review/annotationPanel.shortcuts';
export { commentPopoverShortcuts } from './plan-review/commentPopover.shortcuts';
export { viewerShortcuts } from './plan-review/viewer.shortcuts';

// surface registries (which scopes make up each app)
export * from './surfaces';

