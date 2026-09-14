export * from './core';
export * from './runtime';
export { historyShortcuts, useHistoryShortcuts } from './history.shortcuts';
export { decisionControlShortcuts } from './decisionControl.shortcuts';

// plan-review scopes
export { annotationModeShortcuts, useAnnotationModeShortcuts } from './plan-review/annotationMode.shortcuts';
export { annotationToolbarShortcuts } from './plan-review/annotationToolbar.shortcuts';
export { annotationPanelShortcuts } from './plan-review/annotationPanel.shortcuts';
export { commentPopoverShortcuts } from './plan-review/commentPopover.shortcuts';
export { inputMethodShortcuts } from './plan-review/inputMethod.shortcuts';
export { htmlAnnotateShortcuts, useHtmlAnnotateShortcuts } from './plan-review/htmlAnnotate.shortcuts';
export { viewerShortcuts } from './plan-review/viewer.shortcuts';
export { documentViewShortcuts, useDocumentViewShortcuts } from './plan-review/documentView.shortcuts';
export { goalSetupShortcuts } from './plan-review/goalSetup.shortcuts';
export { annotateSidebarShortcuts, useAnnotateSidebarShortcuts } from './plan-review/sidebar.shortcuts';

// code-review scopes
export { reviewAnnotationToolbarShortcuts, useReviewAnnotationToolbarShortcuts } from './code-review/annotationToolbar.shortcuts';
export { reviewFileTreeShortcuts } from './code-review/fileTree.shortcuts';
export { reviewAllFilesDiffShortcuts } from './code-review/allFilesDiff.shortcuts';
export { reviewChromeShortcuts } from './code-review/reviewChrome.shortcuts';

// surface registries (which scopes make up each app)
export * from './surfaces';

