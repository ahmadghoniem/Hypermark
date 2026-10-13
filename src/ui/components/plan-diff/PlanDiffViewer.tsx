/**
 * PlanDiffViewer — Orchestrator for plan diff views
 *
 * Replaces the Viewer component when plan diff mode is active.
 * Renders the document card with the same styling, but shows
 * diff content instead of the annotatable plan.
 */

import React, { useState } from "react";
import type { PlanDiffBlock, PlanDiffStats } from "../../utils/planDiffEngine";
import type { Annotation } from "../../types";
import { PlanCleanDiffView } from "./PlanCleanDiffView";
import { PlanDiffBadge } from "./PlanDiffBadge";

import { GitBranch01, XClose } from '@untitledui/icons';
interface PlanDiffViewerProps {
  diffBlocks: PlanDiffBlock[];
  diffStats: PlanDiffStats;
  onPlanDiffToggle: () => void;
  repoInfo?: { display: string; branch?: string } | null;
  baseVersionLabel?: string;
  baseVersion?: number;
  maxWidth?: number;
  // Annotation props
  annotations?: Annotation[];
  onAddAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  selectedAnnotationId?: string | null;
}

export const PlanDiffViewer: React.FC<PlanDiffViewerProps> = ({
  diffBlocks,
  diffStats,
  onPlanDiffToggle,
  repoInfo,
  baseVersionLabel,
  baseVersion,
  maxWidth,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
}) => {

  return (
    <div className="relative z-chrome w-full" style={maxWidth ? { maxWidth } : { maxWidth: 832 }}>
      <article className="w-full bg-card border border-border/50 rounded-xl shadow-xl p-5 md:p-8 lg:p-10 xl:p-12 relative">
        {/* Top-left: repo info + diff badge — matches Viewer layout (flex-col) so badge doesn't jump position */}
        <div className="absolute top-3 left-3 md:top-4 md:left-5 flex flex-col items-start gap-1 text-micro text-muted-foreground/50 font-mono">
          {repoInfo && (
            <div className="flex items-center gap-1.5">
              <span
                className="px-1.5 py-0.5 bg-muted/50 rounded-sm truncate max-w-35"
                title={repoInfo.display}
              >
                {repoInfo.display}
              </span>
              {repoInfo.branch && (
                <span
                  className="px-1.5 py-0.5 bg-muted/30 rounded-sm max-w-30 flex items-center gap-1 overflow-hidden"
                  title={repoInfo.branch}
                >
                  <GitBranch01 className="size-2.5 shrink-0" />
                  <span className="truncate">{repoInfo.branch}</span>
                </span>
              )}
            </div>
          )}
          <PlanDiffBadge
            stats={diffStats}
            isActive={true}
            onToggle={onPlanDiffToggle}
            hasPreviousVersion={true}
          />
        </div>

        {/* Top-right: back to plan view button */}
        <div className="float-right -mr-4 -mt-4 md:-mr-5 md:-mt-5 lg:-mr-7 lg:-mt-7 xl:-mr-9 xl:-mt-9 p-2">
          <button
            onClick={onPlanDiffToggle}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-caption text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back to plan view"
          >
            <span className="hidden md:inline text-micro font-semibold">Exit Diff</span>
            <XClose className="size-3.5" />
          </button>
        </div>

        {/* Version label */}
        <div className="my-6 flex items-center gap-3">
          {baseVersionLabel && (
            <span className="text-micro text-muted-foreground">
              vs {baseVersionLabel}
            </span>
          )}
        </div>

        <PlanCleanDiffView
          blocks={diffBlocks}
          annotations={annotations}
          onAddAnnotation={onAddAnnotation}
          onSelectAnnotation={onSelectAnnotation}
          selectedAnnotationId={selectedAnnotationId}
        />
      </article>
    </div>
  );
};
