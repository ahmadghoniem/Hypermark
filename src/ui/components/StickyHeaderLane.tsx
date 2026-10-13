/**
 * StickyHeaderLane — compact "ghost" header that can pin the plan-diff badge
 * as the user scrolls past the top of the document.
 *
 * By default, the lane is invisible and non-interactive at rest, leaving the
 * original badge cluster as the visible source of truth. Hosts
 * can keep this measured lane visible at rest or let it scroll normally.
 *
 * Composes <DocBadges layout="row" />.
 * No state is duplicated — all props are passed through from App.tsx.
 */

import React, { useEffect, useRef, useState } from 'react';
import { DocBadges } from './DocBadges';
import {
  getScrollViewportIntersectionRoot,
  useScrollViewport,
} from '../hooks/useScrollViewport';
import type { PlanDiffStats } from '../utils/planDiffEngine';

/** Controls when the compact header lane is visible and interactive. */
export type StickyHeaderLaneVisibility = 'stuck' | 'always';

/** Props for the measured compact annotation and document header lane. */
export interface StickyHeaderLaneProps {
  /**
   * Show the lane only after it sticks, or keep it visible at rest too.
   * Defaults to `'stuck'`, preserving the incumbent ghost-header behavior.
   * Hosts using `'always'` must reserve a clear header-height region because
   * the lane remains zero-height and absolutely positioned over its sibling.
   */
  visibility?: StickyHeaderLaneVisibility;
  /**
   * Keep the lane pinned while its scroll viewport moves. Defaults to true. Pair false with `visibility="always"`; the default
   * stuck-only visibility cannot become visible when stickiness is disabled.
   */
  sticky?: boolean;

  // Badge state
  repoInfo?: { display: string; branch?: string } | null;
  planDiffStats?: PlanDiffStats | null;
  isPlanDiffActive?: boolean;
  hasPreviousVersion?: boolean;
  onPlanDiffToggle?: () => void;
  /** Baseline suffix + tooltip for the plan-diff badge (see DocBadges). */
  planDiffBaselineLabel?: string;
  planDiffBaselineTooltip?: string;

  // Layout
  maxWidth?: number | null;
}

/** Render the header lane that pins the document badges while scrolling. */
export const StickyHeaderLane: React.FC<StickyHeaderLaneProps> = ({
  visibility = 'stuck',
  sticky = true,
  repoInfo,
  planDiffStats,
  isPlanDiffActive,
  hasPreviousVersion,
  onPlanDiffToggle,
  planDiffBaselineLabel,
  planDiffBaselineTooltip,
  maxWidth,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const scrollViewport = useScrollViewport();
  const laneIsStuck = sticky && isStuck;
  const isVisible = visibility === 'always' || laneIsStuck;
  // Preserve the incumbent ghost lane exactly: its chrome remains mounted
  // while the whole hidden bar fades out. Only the new always-visible mode
  // removes chrome at rest for the supported chrome-free presentation.
  const showChrome = visibility === 'always' ? laneIsStuck : true;

  // IntersectionObserver-on-sentinel pattern (mirrors Viewer.tsx:257-267).
  // Sentinel sits inline at the top of the column. The 80px positive top
  // rootMargin grows the effective viewport upward so the sentinel is
  // considered "visible" for an extra ~80px of scroll — delaying the bar's
  // appearance until the real toolstrip has actually scrolled past. Without
  // this, the sentinel fires the moment scrolling begins and the ghost bar
  // doubles up with the still-visible toolstrip. Root is the OverlayScrollArea
  // viewport from context, NOT <main> (which doesn't actually scroll).
  useEffect(() => {
    if (!sticky) {
      setIsStuck(false);
      return;
    }
    if (!sentinelRef.current || !scrollViewport) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      {
        root: getScrollViewportIntersectionRoot(scrollViewport),
        rootMargin: '80px 0px 0px 0px',
        threshold: 0,
      }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [scrollViewport, sticky]);

  return (
    <>
      {/* Sentinel — present only for sticky positioning. It sits at the top of
          the column and activates the stuck state after scrolling out of the
          OverlayScrollArea viewport. */}
      {sticky && <div ref={sentinelRef} aria-hidden="true" className="size-0" />}

      {/* Zero-height wrapper — sticky by default, relative when sticky is
          disabled so the absolutely positioned lane scrolls in normal flow.
          It never pushes document content down.
          The Viewer's outer wrapper uses z-chrome, so the sticky lane must
          sit above that to paint over the card. */}
      <div
        data-sticky-header-lane="true"
        className={`${sticky ? 'sticky top-3' : 'relative'} z-panel w-full self-center pointer-events-none`}
        style={maxWidth == null ? { height: 0 } : { maxWidth, height: 0 }}
      >
        {/* `inline-flex flex-wrap` lets the badges wrap to a second row when
            they can't fit on one line; `overflow-hidden` clips anything
            wider. `inert` removes the bar from the tab order while hidden. */}
        <div
          inert={!isVisible || undefined}
          className={`absolute left-3 md:left-5 top-0 inline-flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 overflow-hidden rounded-lg py-1 md:py-1.5 ${
            showChrome ? 'bg-card/95 backdrop-blur-sm shadow-sm border border-border/30' : ''
          } motion-reduce:transform-none ${
            isVisible
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
          style={{
            paddingLeft: 12,
            paddingRight: 12,
            maxWidth: 'calc(100% - 24px)',
            transition:
              'opacity 180ms cubic-bezier(0.2, 0, 0, 1), transform 180ms cubic-bezier(0.2, 0, 0, 1)',
            willChange: 'opacity, transform',
          }}
        >
          <DocBadges
            layout="row"
            repoInfo={repoInfo}
            planDiffStats={planDiffStats}
            isPlanDiffActive={isPlanDiffActive}
            hasPreviousVersion={hasPreviousVersion}
            onPlanDiffToggle={onPlanDiffToggle}
            planDiffBaselineLabel={planDiffBaselineLabel}
            planDiffBaselineTooltip={planDiffBaselineTooltip}
          />
        </div>
      </div>
    </>
  );
};
