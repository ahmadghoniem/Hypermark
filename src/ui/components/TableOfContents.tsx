import React, { useMemo, useCallback } from 'react';
import type { Block } from '../types';
import { buildTocHierarchy, type TocItem } from '../utils/annotationHelpers';
import { fileName as pathFileName } from '../utils/displayPath';
import {
  getScrollViewportRect,
  getScrollViewportTop,
  scrollViewportTo,
  useScrollViewport,
} from '../hooks/useScrollViewport';

import { ArrowLeft } from '@untitledui/icons';
interface TableOfContentsProps {
  blocks: Block[];
  activeId: string | null;
  onNavigate: (blockId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  linkedDocFilepath?: string | null;
  onLinkedDocBack?: () => void;
  backLabel?: string;
  /** Indent step per heading level, dialled by SidebarContainer. */
  indent?: number; // default 12
  /** Row corner radius. */
  radius?: number; // default 8
}

// The prototype's TOC is a FLAT list — heading depth is conveyed by indentation
// + tonal de-emphasis, not an expand/collapse chevron tree. Flatten the built
// hierarchy (depth-first = document order) into a single ordered list.
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

// Tonal de-emphasis by heading level (prototype style):
// H1 flush + near-full strength, H2/H3 indented and dimmed to muted. Active row
// is a soft neutral surface tint (not a loud primary fill).
function itemClasses(level: number, isActive: boolean): string {
  return isActive
    ? 'bg-surface-1 text-foreground'
    : level <= 1
      ? 'text-foreground/80 hover:bg-surface-1/70'
      : 'text-muted-foreground hover:bg-surface-1/70';
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
  indent = 12,
  radius = 8,
}: TableOfContentsProps) {
  // Build the hierarchy (filters to heading levels ≤ 3), then flatten to a
  // plain list.
  const tocItems = useMemo(() => flattenToc(buildTocHierarchy(blocks)), [blocks]);

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
      <div className="p-1.5">
        {linkedDocFilepath && (
          <div className="mb-2 px-0.5 pb-1.5 border-b border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-micro font-semibold text-primary/80">Viewing</span>
              {onLinkedDocBack && (
                <button
                  onClick={onLinkedDocBack}
                  className="flex items-center gap-0.5 text-micro font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <ArrowLeft className="size-2.5" strokeWidth={2.5} />
                  Back to {backLabel || 'plan'}
                </button>
              )}
            </div>
            <p className="text-micro text-foreground/70 truncate mt-0.5" title={linkedDocFilepath}>
              {pathFileName(linkedDocFilepath)}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {tocItems.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? 'location' : undefined}
                className={`flex items-center gap-2 px-2 py-1.5 text-left text-micro/snug font-semibold transition-colors ${itemClasses(
                  item.level,
                  isActive
                )}`}
                style={{ marginLeft: item.level <= 1 ? 0 : (item.level === 2 ? indent : indent * 2), borderRadius: radius }}
              >
                <span className="line-clamp-2">{item.content}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
