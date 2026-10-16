import React, { useLayoutEffect, useRef } from 'react';

const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

/**
 * Follows the height of its content with a short transition, so a surface
 * holding an auto-sizing textarea (and whatever else changes size inside it,
 * such as image chips) grows and shrinks smoothly while the content itself
 * resizes at once. The textarea sizes itself with `field-sizing: content`;
 * where that is unsupported (Firefox) its height is set from `scrollHeight`
 * whenever `value` changes. The textarea's min-height and max-height (past
 * which it scrolls) bound the box as well.
 *
 * The box clips while it catches up. It uses `overflow: clip`, not `hidden`:
 * a hidden box can still be scrolled, and the browser scrolls it to keep the
 * caret in view, which made the text jump up a line on each new line. Focus
 * rings near the box's edge must be inset, or sit inside padding.
 */
export const AutoGrowBox: React.FC<React.HTMLAttributes<HTMLDivElement> & {
  /** The textarea's value; re-sizes it where `field-sizing` is unsupported. */
  value: string;
}> = ({ value, children, ...contentProps }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content || typeof ResizeObserver === 'undefined') return;
    // The first height replaces `auto`, which doesn't transition, so the box
    // opens at its size; later ones animate. Whole pixels keep the surface
    // off half-pixel positions.
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
      box.style.height = `${Math.ceil(height)}px`;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (supportsFieldSizing) return;
    const textarea = contentRef.current?.querySelector('textarea');
    if (!textarea) return;
    const style = getComputedStyle(textarea);
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
  }, [value]);

  return (
    <div
      ref={boxRef}
      className="shrink-0 overflow-clip transition-[height] duration-200 ease-out motion-reduce:transition-none"
    >
      <div ref={contentRef} {...contentProps}>
        {children}
      </div>
    </div>
  );
};
