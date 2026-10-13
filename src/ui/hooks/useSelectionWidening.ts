import { useEffect, useRef, useState, type RefObject } from 'react';
import { blocksInRange, codeBlockId, createBlocksRange } from '../utils/blockTargeting';

/** The drag must select this many characters before the Tab hint shows. */
const HINT_MIN_CHARS = 40;
/** Presses closer together than this are ignored, so a double tap doesn't flicker. */
const TAB_MIN_GAP_MS = 150;

/** Inputs for Tab selection within one rendered document. */
export interface UseSelectionWideningOptions {
  containerRef: RefObject<HTMLElement | null>;
  /** Off while a comment popover is open or the plan diff is shown. */
  enabled: boolean;
  /** Submit a text range through the shared annotation pipeline. */
  onSelectRange: (range: Range) => void;
  /** Code blocks are annotated whole, through their own path. */
  onCodeBlockClick: (blockId: string, element: HTMLElement) => void;
}

/** What the Viewer draws for Tab selection. */
export interface SelectionWidening {
  /** Blocks the outline covers; empty while the dragged text is what release takes. */
  blocks: readonly HTMLElement[];
  /** The hint next to the pointer: Tab takes whole blocks, or goes back to the text. */
  hint: 'blocks' | 'back' | null;
  /** Last pointer position, for placing the hint. */
  pointer: RefObject<{ x: number; y: number }>;
}

/**
 * While the mouse is dragging a selection, Tab takes the whole blocks the
 * drag touches (paragraphs, list items, tables) and Tab again goes back to
 * the dragged text. Releasing the mouse annotates what is shown. The
 * modifiers held at release still apply, so Alt strikes the blocks through.
 */
export function useSelectionWidening({
  containerRef,
  enabled,
  onSelectRange,
  onCodeBlockClick,
}: UseSelectionWideningOptions): SelectionWidening {
  const [state, setState] = useState<Omit<SelectionWidening, 'pointer'>>({ blocks: [], hint: null });
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let dragging = false;
    let snapped = false;
    let longEnough = false;
    let blocks: HTMLElement[] = [];
    let frame = 0;
    let lastTab = 0;

    const readSelection = () => {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const inside = range !== null && !range.collapsed && container.contains(range.commonAncestorContainer);
      blocks = inside ? blocksInRange(container, range) : [];
      longEnough = inside && (selection?.toString().trim().length ?? 0) >= HINT_MIN_CHARS;
      if (blocks.length === 0) snapped = false;
    };
    const show = () => {
      const outline = snapped ? blocks : [];
      const hint = !dragging ? null : snapped ? 'back' : longEnough ? 'blocks' : null;
      // The outline is what release takes, so the dragged text stops looking selected.
      container.toggleAttribute('data-selection-widened', outline.length > 0);
      setState((prev) => (
        prev.hint === hint
        && prev.blocks.length === outline.length
        && prev.blocks.every((block, i) => block === outline[i])
          ? prev
          : { blocks: outline, hint }
      ));
    };
    const reset = () => {
      dragging = false;
      snapped = false;
      longEnough = false;
      blocks = [];
      cancelAnimationFrame(frame);
      show();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      reset();
      dragging = true;
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dragging || e.key !== 'Tab') return;
      e.preventDefault();
      // Holding Tab repeats the key; only a fresh press toggles.
      if (e.shiftKey || e.repeat || e.timeStamp - lastTab < TAB_MIN_GAP_MS) return;
      lastTab = e.timeStamp;
      readSelection();
      snapped = !snapped && blocks.length > 0;
      show();
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        readSelection();
        show();
      });
    };
    // Capture on document runs before the highlighter's mouseup on the
    // container; clearing the selection there keeps it from annotating the
    // dragged text. The blocks are annotated a tick later, after the Alt state
    // for this release is recorded.
    const handleMouseUp = () => {
      if (!dragging) return;
      const taken = snapped ? blocks : [];
      reset();
      if (taken.length === 0) return;
      window.getSelection()?.removeAllRanges();
      setTimeout(() => {
        const codeId = taken.length === 1 ? codeBlockId(taken[0]) : null;
        if (codeId) {
          onCodeBlockClick(codeId, taken[0]);
          return;
        }
        const range = createBlocksRange(taken);
        if (range) onSelectRange(range);
      });
    };

    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp, true);
      reset();
    };
  }, [containerRef, enabled, onCodeBlockClick, onSelectRange]);

  return { ...state, pointer };
}
