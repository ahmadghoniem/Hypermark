import React, { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Offset from the pointer, below and to the right like a cursor tooltip. */
const OFFSET = { x: 14, y: 18 };

/**
 * The Tab key next to the pointer during a long enough drag: "Blocks" before
 * Tab, "Back" after. It follows the pointer without re-rendering.
 */
export const TabHint: React.FC<{
  mode: 'blocks' | 'back';
  pointer: RefObject<{ x: number; y: number }>;
}> = ({ mode, pointer }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const place = (x: number, y: number) => {
      if (ref.current) ref.current.style.transform = `translate(${x + OFFSET.x}px, ${y + OFFSET.y}px)`;
    };
    place(pointer.current.x, pointer.current.y);
    const handleMove = (e: MouseEvent) => place(e.clientX, e.clientY);
    document.addEventListener('mousemove', handleMove);
    return () => document.removeEventListener('mousemove', handleMove);
  }, [pointer]);

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-popover flex items-center gap-1 rounded-md border border-border bg-popover py-0.5 pl-0.5 pr-1.5 text-micro text-muted-foreground shadow-sm"
    >
      <kbd className="inline-flex h-4 items-center rounded-[5px] border border-border bg-background px-1 font-sans text-micro text-muted-foreground">
        Tab
      </kbd>
      {mode === 'blocks' ? 'Blocks' : 'Back'}
    </div>,
    document.body,
  );
};
