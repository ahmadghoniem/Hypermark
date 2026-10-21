import React from 'react';
import type { ResizeHandleProps as BaseProps } from '../hooks/useResizablePanel';

interface Props extends BaseProps {
  className?: string;
  /**
   * Extra classes for the inner visible track (the 4px bar that reveals on
   * hover). `className` only reaches the outer wrapper, so this is the seam for
   * restyling or suppressing the hover affordance. The track also carries a
   * `[data-resize-track]` attribute (same pattern as `[data-collapse]`) so a
   * host can target it from plain CSS — e.g. to kill the hover reveal:
   * `[data-resize-track] { background: none !important; }`.
   */
  trackClassName?: string;
  /** Suppress the hover color-change on the track entirely (no pop-in). */
  hideHoverTrack?: boolean;
  /**
   * Which panel this handle resizes, not which side of the boundary it's on.
   *
   * The touch-area is an absolutely-positioned child of a `w-0` parent, so
   * its actual width is `parent - left - right`. Because the parent is zero
   * wide, any combination where `left` and `right` cancel produces a 0-px
   * element and the handle becomes undraggable. See issue #354.
   *
   *   'left'  — resizes a left sidebar. Touch area extends slightly into the
   *             sidebar (leftward) and slightly past the boundary (rightward).
   *             12px total: `-left-1` (-4px) + `-right-2` (-8px) → width 12.
   *   'right' — resizes a right panel. Touch area must NOT extend leftward,
   *             because the adjacent content area's overlay scrollbar lives
   *             in that region (right edge of the content, just left of the
   *             boundary). `left-0 -right-3` → width 12, entirely to the
   *             right of the boundary. DO NOT push `left` positive —
   *             `left-3 -right-3` evaluates to width 0 and kills the drag.
   */
  side?: 'left' | 'right';
}

export const ResizeHandle: React.FC<Props> = ({
  isDragging,
  onPointerDown,
  onDoubleClick,
  style,
  className,
  trackClassName,
  hideHoverTrack,
  side,
}) => {
  return (
    <div
      className={`relative w-0 cursor-col-resize shrink-0 group${className ? ` ${className}` : ''}`}
    >
      {/* Visible track — 4px wide, centered on the zero-width layout box,
          invisible until hover/drag. `data-resize-track` + `trackClassName` are
          host seams for restyling/suppressing the hover reveal. */}
      <div
        data-resize-track={side ?? ''}
        className={`absolute inset-y-0 -inset-x-0.5  transition-colors ${
          isDragging || hideHoverTrack ? 'bg-transparent' : 'group-hover:bg-border'
        }${trackClassName ? ` ${trackClassName}` : ''}`}
      />
      {/* Wider grab/touch zone — must never have zero width (see `side` docs).
          Pointer events + setPointerCapture live here; touch-action:none (from
          style) stops touch drags from scroll-hijacking. */}
      <div
        className={`absolute inset-y-0 ${
          side === 'left' ? '-right-2 -left-1' :
          side === 'right' ? '-right-3 left-0' :
          '-inset-x-2'
        }`}
        style={style}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
};
