/**
 * PlanDiffViewer — Orchestrator for plan diff views
 *
 * Replaces the Viewer component when plan diff mode is active.
 * Renders the document card with the same styling, but shows
 * diff content instead of the annotatable plan.
 */

import React, { useState } from "react";
import type { PlanDiffBlock, PlanDiffStats } from "../../utils/planDiffEngine";
import type { Annotation, EditorMode } from "../../types";
import {
  PlanDiffModeSwitcher,
  type PlanDiffMode,
} from "./PlanDiffModeSwitcher";
import { PlanCleanDiffView } from "./PlanCleanDiffView";
import { PlanRawDiffView } from "./PlanRawDiffView";
import { PlanDiffBadge } from "./PlanDiffBadge";

interface PlanDiffViewerProps {
  diffBlocks: PlanDiffBlock[];
  diffStats: PlanDiffStats;
  diffMode: PlanDiffMode;
  onDiffModeChange: (mode: PlanDiffMode) => void;
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
  mode?: EditorMode;
}

export const PlanDiffViewer: React.FC<PlanDiffViewerProps> = ({
  diffBlocks,
  diffStats,
  diffMode,
  onDiffModeChange,
  onPlanDiffToggle,
  repoInfo,
  baseVersionLabel,
  baseVersion,
  maxWidth,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
  mode,
}) => {

  return (
    <div className="relative z-chrome w-full" style={maxWidth ? { maxWidth } : { maxWidth: 832 }}>
      <article className="w-full bg-card border border-border/50 rounded-xl shadow-xl p-5 md:p-8 lg:p-10 xl:p-12 relative">
        {/* Top-left: repo info + diff badge — matches Viewer layout (flex-col) so badge doesn't jump position */}
        <div className="absolute top-3 left-3 md:top-4 md:left-5 flex flex-col items-start gap-1 text-4xs text-muted-foreground/50 font-mono">
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
                  <svg
                    className="size-2.5 shrink-0"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                  </svg>
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
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back to plan view"
          >
            <span className="hidden md:inline text-3xs font-medium">Exit Diff</span>
            <svg
              className="size-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Diff mode switcher + version label + VS Code button */}
        <div className="my-6 flex items-center gap-3">
          <PlanDiffModeSwitcher mode={diffMode} onChange={onDiffModeChange} />
          {baseVersionLabel && (
            <span className="text-3xs text-muted-foreground">
              vs {baseVersionLabel}
            </span>
          )}
        </div>

        {/* Diff content */}
        {diffMode === "raw" ? (
          <PlanRawDiffView blocks={diffBlocks} />
        ) : (
          <PlanCleanDiffView
            blocks={diffBlocks}
            annotations={annotations}
            onAddAnnotation={onAddAnnotation}
            onSelectAnnotation={onSelectAnnotation}
            selectedAnnotationId={selectedAnnotationId}
            mode={mode}
            wordLevel={diffMode === "clean"}
          />
        )}
      </article>
    </div>
  );
};
