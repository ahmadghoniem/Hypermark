/**
 * DocBadges — repo / branch / plan-diff / demo / linked-doc badge cluster.
 *
 * Extracted from Viewer.tsx so the same markup can render in two places:
 *   - layout="column": original location at the top-left of the plan card (absolute)
 *   - layout="row":   compact context inside the legacy sticky header lane
 *   - layout="header": complete context inside Viewer's in-flow shared header
 *
 * In row layout, the demo badge and linked-doc breadcrumb are dropped —
 * everything else is decorative top-of-doc context except the plan-diff
 * badge, which is NOT suppressed by linkedDocInfo: `planDiffStats`/
 * `hasPreviousVersion` already arrive pre-scoped to whichever document is
 * currently active (root, or a folder/linked doc with its own diff
 * baseline), so it renders in linked-doc mode exactly when that document
 * actually has a previous version to diff against.
 */

import React from 'react';
import { PlanDiffBadge } from './plan-diff/PlanDiffBadge';
import type { PlanDiffStats } from '../utils/planDiffEngine';
import { fileName as pathFileName } from '../utils/displayPath';

import { ArrowLeft, GitBranch01 } from '@untitledui/icons';
export interface LinkedDocBadgeInfo {
  filepath: string;
  onBack: () => void;
  label?: string;
  backLabel?: string;
  variant?: 'breadcrumb' | 'folder-file';
}

export interface DocBadgesProps {
  layout: 'column' | 'row' | 'header';
  repoInfo?: { display: string; branch?: string } | null;
  planDiffStats?: PlanDiffStats | null;
  isPlanDiffActive?: boolean;
  hasPreviousVersion?: boolean;
  onPlanDiffToggle?: () => void;
  /** Baseline suffix + tooltip for the plan-diff badge — annotate/folder
   *  sessions pass "since last review" so the badge's numbers read against
   *  the right baseline. See PlanDiffBadge. Plan review passes nothing. */
  planDiffBaselineLabel?: string;
  planDiffBaselineTooltip?: string;
  showDemoBadge?: boolean;
  linkedDocInfo?: LinkedDocBadgeInfo | null;
}

export const DocBadges: React.FC<DocBadgesProps> = ({
  layout,
  repoInfo,
  planDiffStats,
  isPlanDiffActive,
  hasPreviousVersion,
  onPlanDiffToggle,
  planDiffBaselineLabel,
  planDiffBaselineTooltip,
  showDemoBadge,
  linkedDocInfo,
}) => {
  const isRow = layout === 'row';
  const isHorizontal = layout !== 'column';
  // In row layout, only PlanDiffBadge (when it has stats to show) actually
  // renders — everything else is hidden. Check what will truly produce
  // visible output to avoid an empty wrapper div. PlanDiffBadge is not
  // linkedDocInfo-gated — see the header comment.
  const anything = isRow
    ? hasPreviousVersion && planDiffStats
    : repoInfo || hasPreviousVersion || showDemoBadge || linkedDocInfo;
  if (!anything) return null;

  // Row layout: single horizontal line. Column layout: stacked rows.
  const outerClass = isHorizontal
    ? `flex items-center gap-1.5 text-micro text-muted-foreground/70 font-mono ${layout === 'header' ? 'flex-wrap' : ''}`
    : 'flex flex-col items-start gap-1 text-micro text-muted-foreground/50 font-mono';

  return (
    <div className={outerClass}>
      {/* Legacy row layout omits repo/branch to keep the ghost bar compact —
          they'd otherwise push the container wide enough to visually extend
          under the action buttons. The Viewer-owned header measures and wraps
          the complete badge set, so its `header` layout keeps this context. */}
      {repoInfo && !linkedDocInfo && !isRow && (
        <div className="flex items-center gap-1.5">
          <span
            className="px-1.5 py-0.5 bg-muted/50 rounded-sm truncate max-w-64"
            title={repoInfo.display}
          >
            {repoInfo.display}
          </span>
          {repoInfo.branch && (
            <span
              className="px-1.5 py-0.5 bg-muted/30 rounded-sm max-w-48 flex items-center gap-1 overflow-hidden"
              title={repoInfo.branch}
            >
              <GitBranch01 className="size-2.5 shrink-0" />
              <span className="truncate">{repoInfo.branch}</span>
            </span>
          )}
        </div>
      )}

      {onPlanDiffToggle && (
        <PlanDiffBadge
          stats={planDiffStats ?? null}
          isActive={isPlanDiffActive ?? false}
          onToggle={onPlanDiffToggle}
          hasPreviousVersion={hasPreviousVersion ?? false}
          baselineLabel={planDiffBaselineLabel}
          baselineTooltip={planDiffBaselineTooltip}
        />
      )}

      {/* Demo badge: only in column (top-of-doc) layout */}
      {!isRow && showDemoBadge && !linkedDocInfo && (
        <span className="px-1.5 py-0.5 rounded-sm text-micro font-mono bg-warning/15 text-foreground">
          Demo
        </span>
      )}

      {/* Linked-doc breadcrumb: only in column layout (sticky lane is hidden in linked-doc mode) */}
      {!isRow && linkedDocInfo && (
        linkedDocInfo.variant === 'folder-file' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={linkedDocInfo.onBack}
              className="rounded-sm text-micro font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Close
            </button>
            <span
              className="truncate rounded-sm bg-muted/50 px-1.5 py-0.5 text-micro text-muted-foreground max-w-55"
              title={linkedDocInfo.filepath}
            >
              {pathFileName(linkedDocInfo.filepath)}
            </span>
            </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={linkedDocInfo.onBack}
              className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="size-2.5" strokeWidth={2.5} />
              {linkedDocInfo.backLabel || 'plan'}
            </button>
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary/80 rounded-sm">
              {linkedDocInfo.label || 'Linked File'}
            </span>
            <span
              className="px-1.5 py-0.5 bg-muted/50 text-muted-foreground rounded-sm truncate max-w-50"
              title={linkedDocInfo.filepath}
            >
              {pathFileName(linkedDocInfo.filepath)}
            </span>
            </div>
        )
      )}
    </div>
  );
};
