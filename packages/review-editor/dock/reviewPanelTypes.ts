/**
 * Review-specific dockview panel type constants and ID factory functions.
 *
 * The "review-" prefix scopes these to the code review context,
 * distinguishing them from any future plan editor panel types.
 */

export const REVIEW_PANEL_TYPES = {
  ALL_FILES: 'review-all-files',
  CODE_NAV: 'review-code-nav',
  SEMANTIC_DIFF: 'review-semantic-diff',
  CALL_FLOW: 'review-call-flow',
} as const;

export const REVIEW_ALL_FILES_PANEL_ID = 'review-all-files';
export const REVIEW_CODE_NAV_PANEL_ID = 'review-code-nav';
export const REVIEW_SEMANTIC_DIFF_PANEL_ID = 'review-semantic-diff';
export const REVIEW_CALL_FLOW_PANEL_ID = 'review-call-flow';
