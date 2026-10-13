import React, { useLayoutEffect, useState, useRef } from 'react';
import {
  addScrollViewportListener,
  useScrollViewport,
} from '../hooks/useScrollViewport';

interface BlockOutlineProps {
  /** The blocks Tab selection would take; nothing is drawn when empty. */
  blocks: readonly HTMLElement[];
  containerRef: React.RefObject<HTMLElement | null>;
}

interface OutlinePosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** A wash over the area the blocks cover, from the first to the last. */
export const BlockOutline: React.FC<BlockOutlineProps> = ({ blocks, containerRef }) => {
  const [position, setPosition] = useState<OutlinePosition | null>(null);
  const rafRef = useRef<number>(0);
  const scrollViewport = useScrollViewport();

  useLayoutEffect(() => {
    if (blocks.length === 0 || !containerRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const rects = blocks.map((block) => block.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));

      setPosition({
        top: top - containerRect.top,
        left: left - containerRect.left,
        width: right - left,
        height: bottom - top,
      });
    };

    updatePosition();

    const handleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    // Window resize always matters, regardless of whether the scroll
    // viewport is ready yet. Register it unconditionally so the outline
    // stays aligned during the brief window before OverlayScrollbars
    // delivers its viewport.
    window.addEventListener('resize', handleUpdate, { passive: true });

    // The shared viewport is the nested main element on desktop and the page
    // scroller on compact touch layouts. The helper binds the latter to the
    // window scroll event so the outline does not drift as Safari chrome moves.
    const removeScrollListener = scrollViewport
      ? addScrollViewportListener(scrollViewport, handleUpdate)
      : undefined;

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleUpdate);
      removeScrollListener?.();
    };
  }, [blocks, containerRef, scrollViewport]);

  if (!position || blocks.length === 0) return null;

  return (
    <div
      data-block-outline
      className="bg-primary/10 rounded-sm"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        pointerEvents: 'none',
        zIndex: 20,
        transition: 'top 100ms ease-out, left 100ms ease-out, width 100ms ease-out, height 100ms ease-out',
      }}
    />
  );
};
