import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickLabel } from '../utils/quickLabels';

/** Chip hues by position in the list (Tailwind 500s: green, amber, orange,
 *  cyan, red, blue), so labels are told apart without a color picker. */
const CHIP_HUES = ['#22c55e', '#f59e0b', '#f97316', '#06b6d4', '#ef4444', '#3b82f6'];

interface ComposerQuickLabelsProps {
  labels: readonly QuickLabel[];
  onSelect: (label: QuickLabel) => void;
  /** Faded out and inert while the composer has content. */
  hidden: boolean;
  /** Set by CommentPopover: chip height, the gap between chips, and how wide
   *  the clipped edges fade. */
  chipHeight: number;
  gap: number;
  fade: number;
  className?: string;
}

/**
 * One line of label chips along the bottom of the composer's text field. A
 * vertical wheel scrolls it sideways; the clipped edges fade. It hides as soon
 * as the field has content, without changing the field's height. Each chip is
 * tinted with its position's hue mixed into the popover color. No tooltips.
 */
export const ComposerQuickLabels: React.FC<ComposerQuickLabelsProps> = ({ labels, onSelect, hidden, chipHeight, gap, fade, className }) => {
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
      className={`transition-opacity duration-150 motion-reduce:transition-none ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'} ${className ?? ''}`}
    >
      <div
        ref={rowRef}
        role="toolbar"
        aria-label="Quick labels"
        onScroll={measure}
        className="flex items-center overflow-x-auto overscroll-x-contain py-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{ gap, ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}
      >
        {labels.map((label, i) => (
          <button
            key={label.id}
            type="button"
            tabIndex={hidden ? -1 : 0}
            onClick={() => onSelect(label)}
            style={{ height: chipHeight, '--chip': CHIP_HUES[i % CHIP_HUES.length] } as React.CSSProperties}
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--chip)_15%,var(--popover))] px-2.5 text-2xs font-medium text-foreground/90 transition-colors hover:bg-[color-mix(in_srgb,var(--chip)_26%,var(--popover))] hover:text-foreground"
          >
            {label.text}
          </button>
        ))}
      </div>
    </div>
  );
};
