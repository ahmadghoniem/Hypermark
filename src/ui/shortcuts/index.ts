export * from './core';
export * from './runtime';
export { historyShortcuts, useHistoryShortcuts } from './history.shortcuts';

// document scopes
export { annotationModeShortcuts } from './document/annotationMode.shortcuts';
export { annotationPanelShortcuts } from './document/annotationPanel.shortcuts';
export { commentPopoverShortcuts } from './document/commentPopover.shortcuts';
export { viewerShortcuts } from './document/viewer.shortcuts';

// surface registries (which scopes make up each app)
export * from './surfaces';

