import { createTextRange } from './domSelection';

/**
 * Whole-block targeting for Tab selection: the rendered Markdown blocks
 * (paragraphs, headings, list items, tables, code blocks) a drag touches.
 */

/** The rendered blocks in document order, one per block id, without rules. */
function getBlockElements(container: HTMLElement): HTMLElement[] {
  const seen = new Set<string>();
  const result: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => {
    const blockId = element.dataset.blockId;
    if (!blockId || seen.has(blockId) || element.tagName === 'HR') return;
    seen.add(blockId);
    result.push(element);
  });
  return result;
}

/** Whether `range` covers any of the block's text, not just a boundary. */
function rangeTouchesText(range: Range, block: HTMLElement): boolean {
  if (!range.intersectsNode(block)) return false;
  const text = createTextRange(block);
  if (!text) return false;
  const piece = range.cloneRange();
  if (!block.contains(range.startContainer)) piece.setStart(text.startContainer, text.startOffset);
  if (!block.contains(range.endContainer)) piece.setEnd(text.endContainer, text.endOffset);
  return piece.toString().trim().length > 0;
}

/**
 * The blocks whose text `range` touches, in document order. Blocks without
 * annotatable text (diagrams, formulas) are left out.
 */
export function blocksInRange(container: HTMLElement, range: Range): HTMLElement[] {
  const blocks = getBlockElements(container).filter((block) => rangeTouchesText(range, block));
  return blocks.filter((block) => !blocks.some((other) => other !== block && other.contains(block)));
}

/** A text range from the start of the first block to the end of the last. */
export function createBlocksRange(blocks: readonly HTMLElement[]): Range | null {
  const first = blocks.length > 0 ? createTextRange(blocks[0]) : null;
  const last = blocks.length > 0 ? createTextRange(blocks[blocks.length - 1]) : null;
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.startContainer, first.startOffset);
  range.setEnd(last.endContainer, last.endOffset);
  return range;
}

/** The block id of a code block, which is annotated whole through its own path. */
export function codeBlockId(block: HTMLElement): string | null {
  return block.querySelector('pre > code.pn-code') ? block.dataset.blockId ?? null : null;
}
