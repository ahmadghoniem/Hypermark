import React, { useMemo, useCallback } from 'react';
import type { Block, Annotation } from '../types';
import {
  buildTocHierarchy,
  type TocItem,
} from '../utils/annotationHelpers';
import {
  TOC_LINE_INNER,
  TOC_LINE_OUTER,
  TOC_ROW_HEIGHT,
  buildTocActivePath,
  buildTocCircuitPath,
  tocLineX,
} from '../utils/tocCircuit';
import { fileName as pathFileName } from '../utils/displayPath';
import {
  getScrollViewportRect,
  getScrollViewportTop,
  scrollViewportTo,
  useScrollViewport,
} from '../hooks/useScrollViewport';

interface TableOfContentsProps {
  blocks: Block[];
  annotations: Annotation[];
  activeId: string | null;
  onNavigate: (blockId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  linkedDocFilepath?: string | null;
  onLinkedDocBack?: () => void;
  backLabel?: string;
  /** Circuit geometry, dialled by SidebarContainer. */
  rowHeight?: number;
  lineOuter?: number;
  lineInner?: number;
  lineStroke?: number;
}

// Flat list in document order; depth is shown by the circuit line and indentation.
function flattenToc(items: TocItem[]): TocItem[] {
  const out: TocItem[] = [];
  const walk = (list: TocItem[]) => {
    for (const it of list) {
      out.push(it);
      if (it.children.length) walk(it.children);
    }
  };
  walk(items);
  return out;
}

export function TableOfContents({
  blocks,
  activeId,
  onNavigate,
  className = '',
  style,
  linkedDocFilepath,
  onLinkedDocBack,
  backLabel,
  rowHeight = TOC_ROW_HEIGHT,
  lineOuter = TOC_LINE_OUTER,
  lineInner = TOC_LINE_INNER,
  lineStroke = 1.25,
}: TableOfContentsProps) {
  // Counts are not shown in the table of contents, so pass an empty map.
  const tocItems = useMemo(
    () => flattenToc(buildTocHierarchy(blocks, new Map())),
    [blocks]
  );
  const levels = useMemo(() => tocItems.map((item) => item.level), [tocItems]);
  const activeIndex = tocItems.findIndex((item) => item.id === activeId);

  // The real scroll element is the OverlayScrollArea viewport, not <main>.
  const scrollViewport = useScrollViewport();

  // Smooth scroll-to-heading, accounting for the sticky header.
  const handleNavigate = useCallback(
    (blockId: string) => {
      onNavigate(blockId);
      const target = (scrollViewport ?? document).querySelector(`[data-block-id="${blockId}"]`);
      if (target && scrollViewport) {
        const scrollContainer = scrollViewport;
        const headerOffset = 80; // sticky header (h-12) + breathing room
        const containerRect = getScrollViewportRect(scrollContainer);
        const targetRect = target.getBoundingClientRect();
        const offsetPosition =
          getScrollViewportTop(scrollContainer) + (targetRect.top - containerRect.top) - headerOffset;
        scrollViewportTo(scrollContainer, { top: offsetPosition, behavior: 'smooth' });
      }
    },
    [onNavigate, scrollViewport]
  );

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <nav
      // Use ?? not || — an explicit empty string from a caller means "I'm
      // managing my own container styling" (e.g. SidebarContainer wrapping
      // us in an OverlayScrollArea), which should NOT trigger the default.
      className={className ?? 'bg-card/50 backdrop-blur-sm border-r border-border overflow-y-auto'}
      aria-label="Table of contents"
      style={style}
    >
      <div className="px-3 pb-3">
        {linkedDocFilepath && (
          <div className="mb-2 px-0.5 pb-1.5 border-b border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-medium text-primary/80">Viewing</span>
              {onLinkedDocBack && (
                <button
                  onClick={onLinkedDocBack}
                  className="flex items-center gap-0.5 text-3xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  Back to {backLabel || 'plan'}
                </button>
              )}
            </div>
            <p className="text-2xs text-foreground/70 truncate mt-0.5" title={linkedDocFilepath}>
              {pathFileName(linkedDocFilepath)}
            </p>
          </div>
        )}
        <div className="relative" style={{ height: tocItems.length * rowHeight }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={lineInner + 6}
            height={tocItems.length * rowHeight}
            fill="none"
          >
            <path
              d={buildTocCircuitPath(levels, rowHeight, lineOuter, lineInner)}
              stroke="currentColor"
              strokeWidth={lineStroke}
              strokeLinecap="round"
              className="text-muted-foreground/40"
            />
            {activeIndex >= 0 && (
              <path
                d={buildTocActivePath(levels, activeIndex, rowHeight, lineOuter, lineInner)}
                stroke="currentColor"
                strokeWidth={lineStroke + 0.75}
                strokeLinecap="round"
                className="text-primary"
              />
            )}
          </svg>
          {tocItems.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? 'location' : undefined}
                title={item.content}
                // 12px between the line and the text, whichever track the row is on.
                style={{ height: rowHeight, paddingLeft: tocLineX(item.level, lineOuter, lineInner) + 12 }}
                className={`flex w-full items-center pr-1.5 text-left text-2xs font-medium transition-colors ${
                  isActive
                    ? 'text-primary'
                    : item.level <= 1
                      ? 'text-foreground hover:text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="truncate">{item.content}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
