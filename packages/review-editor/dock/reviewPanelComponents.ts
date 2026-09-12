import { REVIEW_PANEL_TYPES } from './reviewPanelTypes';
import { ReviewAllFilesDiffPanel } from './panels/ReviewAllFilesDiffPanel';
import { ReviewCodeNavPanel } from './panels/ReviewCodeNavPanel';
import { ReviewSemanticDiffPanel } from './panels/ReviewSemanticDiffPanel';
import { ReviewCallFlowPanel } from './panels/ReviewCallFlowPanel';

/**
 * Component registry for dockview — maps panel type strings to React components.
 * Passed to <DockviewReact components={...} />.
 */
export const reviewPanelComponents = {
  [REVIEW_PANEL_TYPES.ALL_FILES]: ReviewAllFilesDiffPanel,
  [REVIEW_PANEL_TYPES.CODE_NAV]: ReviewCodeNavPanel,
  [REVIEW_PANEL_TYPES.SEMANTIC_DIFF]: ReviewSemanticDiffPanel,
  [REVIEW_PANEL_TYPES.CALL_FLOW]: ReviewCallFlowPanel,
} as const;
