/**
 * PlanDiffCard — the plan card with its content swapped for the diff.
 *
 * Shown in place of Viewer while "Show changes" is on. It uses Viewer's card
 * shell and header (repo chips top left, the switch top right), so turning
 * the switch on changes the content and nothing around it.
 */

import React, { useEffect, useRef, useState } from "react";
import type { PlanDiffBlock, PlanDiffStats } from "../../utils/planDiffEngine";
import type { Annotation } from "../../types";
import { PlanCleanDiffView } from "./PlanCleanDiffView";
import { PlanDiffSwitch } from "./PlanDiffSwitch";
import { DocBadges } from "../DocBadges";

interface PlanDiffCardProps {
  diffBlocks: PlanDiffBlock[];
  diffStats: PlanDiffStats;
  /** Turns "Show changes" off. */
  onPlanDiffToggle: () => void;
  repoInfo?: { display: string; branch?: string } | null;
  baselineTooltip?: string;
  baseVersionLabel?: string;
  /** Max width in px for the card; null removes the cap entirely. */
  maxWidth?: number | null;
  annotations?: Annotation[];
  onAddAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  selectedAnnotationId?: string | null;
}

export const PlanDiffCard: React.FC<PlanDiffCardProps> = ({
  diffBlocks,
  diffStats,
  onPlanDiffToggle,
  repoInfo,
  baselineTooltip,
  baseVersionLabel,
  maxWidth,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
}) => {
  const articleRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // Same clearance rule as Viewer: the header sits in the card's top padding
  // and pushes the content down only by what overflows it.
  const [headerClearance, setHeaderClearance] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    const article = articleRef.current;
    if (!el || !article) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(article).paddingTop) || 0;
      const overflow = el.offsetTop + el.offsetHeight - pad;
      setHeaderClearance(overflow > 1 ? overflow + 4 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [repoInfo]);

  return (
    <div className="relative z-chrome w-full" style={maxWidth === null ? undefined : { maxWidth: maxWidth ?? 832 }}>
      <article ref={articleRef} className="w-full bg-card rounded-xl py-5 md:py-8 lg:py-10 xl:py-12 relative">
        <div ref={headerRef} className="absolute top-3 md:top-4 inset-x-0 flex items-start justify-between gap-3">
          <DocBadges layout="column" repoInfo={repoInfo} />
          <PlanDiffSwitch
            stats={diffStats}
            checked
            onToggle={onPlanDiffToggle}
            baselineTooltip={baselineTooltip}
            baseVersionLabel={baseVersionLabel}
          />
        </div>
        {headerClearance > 0 && <div style={{ height: headerClearance }} aria-hidden="true" />}
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
