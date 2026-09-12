/**
 * Review-specific dockview panel type constants and ID factory functions.
 *
 * The "review-" prefix scopes these to the code review context,
 * distinguishing them from any future plan editor panel types.
 */

export const REVIEW_PANEL_TYPES = {
  PR_OVERVIEW: 'review-pr-overview',
  PR_ARTIFACTS: 'review-pr-artifacts',
  ALL_FILES: 'review-all-files',
  CODE_NAV: 'review-code-nav',
  SEMANTIC_DIFF: 'review-semantic-diff',
  CALL_FLOW: 'review-call-flow',
} as const;

export const REVIEW_PR_OVERVIEW_PANEL_ID = 'review-pr-overview';
export const REVIEW_PR_ARTIFACTS_PANEL_ID = 'review-pr-artifacts';
export const REVIEW_ALL_FILES_PANEL_ID = 'review-all-files';
export const REVIEW_CODE_NAV_PANEL_ID = 'review-code-nav';
export const REVIEW_SEMANTIC_DIFF_PANEL_ID = 'review-semantic-diff';
export const REVIEW_CALL_FLOW_PANEL_ID = 'review-call-flow';
