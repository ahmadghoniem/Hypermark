import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AGREED_LABEL, type QuickLabel } from '../utils/quickLabels';

/** Dot colour per label colour key. Agreed shows a check instead. */
const DOT_CLASS: Record<string, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  orange: 'bg-orange-400',
  cyan: 'bg-cyan-400',
  red: 'bg-destructive',
  blue: 'bg-primary',
};

interface ComposerQuickLabelsProps {
  labels: readonly QuickLabel[];
  onSelect: (label: QuickLabel) => void;
  /** Faded out and inert while the composer has content. */
  hidden: boolean;
  /** Dialled in CommentPopover: chip height, the gap between chips, and how
   *  wide the clipped edges fade. */
  chipHeight: number;
  gap: number;
  fade: number;
}

/**
 * One line of label chips above the composer. A vertical wheel scrolls it
 * sideways; the clipped edges fade. No tooltips.
 */
export const ComposerQuickLabels: React.FC<ComposerQuickLabelsProps> = ({ labels, onSelect, hidden, chipHeight, gap, fade }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft > 1,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    measure();
    // Non-passive, so a wheel over the row scrolls it instead of the page.
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      observer.disconnect();
    };
  }, [measure]);

  const fadeStart = `transparent, black ${fade}px`;
  const fadeEnd = `black calc(100% - ${fade + 8}px), transparent`;
  const mask = edges.start && edges.end
    ? `linear-gradient(to right, ${fadeStart}, ${fadeEnd})`
    : edges.start
      ? `linear-gradient(to right, ${fadeStart})`
      : edges.end
        ? `linear-gradient(to right, ${fadeEnd})`
        : undefined;

  return (
    <div
      data-quick-labels="true"
      aria-hidden={hidden ? 'true' : undefined}
      className={`transition-opacity duration-150 motion-reduce:transition-none ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div
        ref={rowRef}
        role="toolbar"
        aria-label="Quick labels"
        onScroll={measure}
        className="flex items-center overflow-x-auto overscroll-x-contain py-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{ gap, ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}
      >
        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            tabIndex={hidden ? -1 : 0}
            onClick={() => onSelect(label)}
            style={{ height: chipHeight }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card pl-2 pr-2.25 text-2xs font-medium text-foreground/85 shadow-[0_1px_2px_rgb(0_0_0/0.3),0_6px_14px_-6px_rgb(0_0_0/0.6)] transition-colors hover:bg-muted hover:text-foreground"
          >
            {label.id === AGREED_LABEL.id ? (
              <svg className="size-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[label.color] ?? 'bg-muted-foreground'}`} />
            )}
            {label.text}
          </button>
        ))}
      </div>
    </div>
  );
};
