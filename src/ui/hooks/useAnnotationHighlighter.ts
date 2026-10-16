/**
 * useAnnotationHighlighter — annotation infrastructure for Viewer.
 *
 * Manages: web-highlighter lifecycle, toolbar/popover/quicklabel state,
 * annotation creation, text-based restoration (drafts/shares), scroll-to-selected.
 */

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import Highlighter from '@plannotator/web-highlighter';
import type { Annotation, ImageAttachment } from '../types';
import { AnnotationType } from '../types';
import { formatQuickLabel, type QuickLabel } from '../utils/quickLabels';
import { transformPlainText } from '../utils/inlineTransforms';

// --- Exported state types ---

export interface CommentPopoverState {
  anchorEl: HTMLElement;
  contextText: string;
  selectedText?: string;
  initialText?: string;
  source?: any;
}

type MathAnnotationSource = {
  kind: 'math';
  element: HTMLElement;
  text: string;
  blockId: string;
  displayMode: boolean;
};

const isMathAnnotationSource = (source: any): source is MathAnnotationSource =>
  source?.kind === 'math';

/**
 * A quote of only whitespace is not an annotation: it paints an invisible
 * highlight, and the stored quote cannot be found again on restore. `\s`
 * covers the non-breaking spaces a rendered document holds.
 */
const isBlankQuote = (value: string | null | undefined): boolean =>
  (value ?? '').replace(/\s+/g, '') === '';

/**
 * web-highlighter serializes an element boundary as `childNodes[offset]`. The
 * DOM allows `offset === childNodes.length` (after the last child), which
 * leaves the library reading `undefined.parentNode` and throwing out of its
 * own mouseup listener.
 */
const boundaryResolves = (node: Node, offset: number): boolean => {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE || node.nodeType === Node.COMMENT_NODE) return true;
  return offset >= 0 && offset < node.childNodes.length;
};

const isSerializableRange = (range: Range): boolean =>
  boundaryResolves(range.startContainer, range.startOffset)
  && boundaryResolves(range.endContainer, range.endOffset);


type MathAnnotationTarget = {
  element: HTMLElement;
  blockId: string;
  tex: string;
  displayMode: boolean;
};

const elementFromNode = (node: Node | null): HTMLElement | null => {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node as HTMLElement;
  return node.parentNode instanceof HTMLElement ? node.parentNode : null;
};

const closestMathElement = (node: Node | null, root: HTMLElement | null): HTMLElement | null => {
  const element = elementFromNode(node);
  const math = element?.closest<HTMLElement>('.math-annotatable[data-math-tex]');
  if (!math || !root?.contains(math)) return null;
  return math;
};

const mathElementFromSelection = (selection: Selection | null, root: HTMLElement | null): HTMLElement | null => {
  if (!selection || selection.rangeCount === 0) return null;
  return (
    closestMathElement(selection.anchorNode, root) ||
    closestMathElement(selection.focusNode, root) ||
    closestMathElement(selection.getRangeAt(0).commonAncestorContainer, root)
  );
};

const selectionContainsNode = (range: Range, node: Node): boolean => {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
};

const mathSourceFromElement = (element: HTMLElement): MathAnnotationSource | null => {
  const text = element.dataset.mathTex;
  if (!text) return null;

  const block = element.closest<HTMLElement>('[data-block-id]');
  const blockId = block?.dataset.blockId;
  if (!blockId) return null;

  return {
    kind: 'math',
    element,
    text,
    blockId,
    displayMode: element.dataset.mathDisplay === 'true',
  };
};

const mathTargetsFromSelection = (
  selection: Selection | null,
  root: HTMLElement | null,
): MathAnnotationTarget[] => {
  if (!selection || selection.rangeCount === 0 || !root) return [];

  const seen = new Set<HTMLElement>();
  const targets: MathAnnotationTarget[] = [];
  const candidates = root.querySelectorAll<HTMLElement>('.math-annotatable[data-math-tex]');

  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    candidates.forEach(element => {
      if (seen.has(element) || !selectionContainsNode(range, element)) return;
      const source = mathSourceFromElement(element);
      if (!source) return;
      seen.add(element);
      targets.push({
        element,
        blockId: source.blockId,
        tex: source.text,
        displayMode: source.displayMode,
      });
    });
  }

  return targets;
};

const selectionHasNonMathContent = (
  selection: Selection | null,
  root: HTMLElement | null,
): boolean => {
  if (!selection || selection.rangeCount === 0 || !root) return false;

  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    if (!root.contains(range.commonAncestorContainer)) continue;

    // Whole selection sits inside a single formula (both endpoints within the
    // rendered KaTeX): a pure-math selection, not mixed content.
    if (closestMathElement(range.commonAncestorContainer, root)) continue;

    // Otherwise clone the selection, drop any whole math elements it covers,
    // and see if meaningful text is left. Leftover text = genuinely mixed
    // (prose + formula) and should fall through to the normal text path.
    // Nothing left = the selection only spans formulas — even when an endpoint
    // spills into an adjacent text node at offset 0, which the browser does on
    // nearly every drag-select of an inline formula.
    const fragment = range.cloneContents();
    fragment.querySelectorAll?.('.math-annotatable[data-math-tex]').forEach(element => {
      element.remove();
    });
    if (fragment.textContent?.trim()) return true;
  }

  return false;
};

const annotationId = (): string => {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const escapeAttrValue = (value: string): string => {
  if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

// web-highlighter 0.8.x accepts only class, ID, and tag exclusions.
const ANNOTATION_EXCLUDED_SELECTOR = '.annotation-exclude';

const isAnnotationExcludedTextNode = (node: Node): boolean =>
  Boolean(node.parentElement?.closest(ANNOTATION_EXCLUDED_SELECTOR));

const stripWhitespace = (value: string): string => value.replace(/\s+/g, '');

/**
 * Stored positions count elements by tag across the whole document, so a
 * draft restored into a DOM with a different element count (content that
 * renders later, a changed document) lands on the wrong text. A restore is
 * trusted only when the marked text matches the quote, ignoring whitespace:
 * block boundaries add a newline to the quote and none to the DOM.
 */
const restoredTextMatches = (doms: HTMLElement[], quote: string): boolean =>
  stripWhitespace(doms.map((dom) => dom.textContent ?? '').join('')) === stripWhitespace(quote);

const applyMathAnnotationClass = (
  element: HTMLElement,
  id: string,
  type: AnnotationType,
  displayMode: boolean,
) => {
  element.classList.add(
    'annotation-highlight',
    displayMode ? 'math-block-annotation' : 'math-inline-annotation',
  );
  element.classList.remove('deletion', 'comment');
  if (type === AnnotationType.DELETION) {
    element.classList.add('deletion');
  } else if (type === AnnotationType.COMMENT) {
    element.classList.add('comment');
  }
  element.dataset.bindId = id;
  element.dataset.mathAnnotation = 'true';
};

const applyMathTargets = (
  targets: MathAnnotationTarget[],
  id: string,
  type: AnnotationType,
) => {
  targets.forEach(target => {
    applyMathAnnotationClass(target.element, id, type, target.displayMode);
  });
};

const clearMathAnnotationClass = (element: Element) => {
  element.classList.remove(
    'annotation-highlight',
    'math-block-annotation',
    'math-inline-annotation',
    'deletion',
    'comment',
    'focused',
  );
  delete (element as HTMLElement).dataset.bindId;
  delete (element as HTMLElement).dataset.mathAnnotation;
};

// --- Hook options & return ---

export interface UseAnnotationHighlighterOptions {
  containerRef: RefObject<HTMLElement | null>;
  annotations: Annotation[];
  onAddAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  selectedAnnotationId: string | null;
  enabled?: boolean;
}

/** Annotation UI state and mutation commands owned by one rendered document. */
export interface UseAnnotationHighlighterReturn {
  highlighterRef: RefObject<Highlighter | null>;

  commentPopover: CommentPopoverState | null;

  handleCommentSubmit: (text: string, images?: ImageAttachment[]) => void;
  handleCommentQuickLabel: (label: QuickLabel) => void;
  handleCommentClose: () => void;
  /** Paint a caller-created DOM range through the same pipeline as pointer selection. */
  highlightRange: (range: Range, modeOverride?: 'redline' | 'comment') => void;
  /** Annotate one rendered formula through the same path as a pointer click. */
  highlightMathElement: (element: HTMLElement, modeOverride?: 'redline' | 'comment') => void;

  removeHighlight: (id: string) => void;
  clearAllHighlights: () => void;
  applyAnnotations: (annotations: Annotation[]) => void;
}

/**
 * Own pointer and caller-supplied range annotations for a Markdown container.
 *
 * Malformed or stale ranges are ignored.
 */
export function useAnnotationHighlighter({
  containerRef,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
  enabled = true,
}: UseAnnotationHighlighterOptions): UseAnnotationHighlighterReturn {
  const highlighterRef = useRef<Highlighter | null>(null);
  const onAddAnnotationRef = useRef(onAddAnnotation);
  const onSelectAnnotationRef = useRef(onSelectAnnotation);
  const pendingSourceRef = useRef<any>(null);
  const pendingMathTargetsRef = useRef<MathAnnotationTarget[]>([]);
  const pendingMathElementRef = useRef<HTMLElement | null>(null);
  const pendingModeOverrideRef = useRef<'redline' | 'comment' | null>(null);
  const justCreatedIdRef = useRef<string | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Alt held when the selection was released: strike it through on the spot.
   *  Without it a release opens the comment composer. */
  const altOnReleaseRef = useRef(false);
  /** Click count of the last mousedown, and whether it was a double or triple
   *  click on an existing highlight. Those clicks belong to the first one,
   *  which opened the annotation, so they neither reselect it nor start a new
   *  annotation inside it. */
  const clickCountRef = useRef(0);
  const multiClickOnHighlightRef = useRef(false);
  const mouseDownMathRef = useRef<HTMLElement | null>(null);

  const [commentPopover, setCommentPopover] = useState<CommentPopoverState | null>(null);

  // Keep refs in sync
  useEffect(() => { onAddAnnotationRef.current = onAddAnnotation; }, [onAddAnnotation]);
  useEffect(() => { onSelectAnnotationRef.current = onSelectAnnotation; }, [onSelectAnnotation]);

  const clearPendingSelection = useCallback(() => {
    pendingSourceRef.current = null;
    pendingMathTargetsRef.current = [];
    // Strip the pre-submission preview highlight if the annotation was never
    // finalized (createAnnotationFromMathSource nulls this ref once committed).
    if (pendingMathElementRef.current) {
      clearMathAnnotationClass(pendingMathElementRef.current);
      pendingMathElementRef.current = null;
    }
  }, []);

  // Paint a preview highlight on a formula the moment its toolbar/popover opens,
  // so the target is visible before the user commits the annotation.
  const showPendingMathPreview = useCallback((source: MathAnnotationSource) => {
    applyMathAnnotationClass(source.element, 'pending-math', AnnotationType.COMMENT, source.displayMode);
    pendingMathElementRef.current = source.element;
  }, []);

  // Track mouse position for quick label picker
  useEffect(() => {
    const track = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      altOnReleaseRef.current = e.altKey;
    };
    const trackClicks = (e: MouseEvent) => {
      clickCountRef.current = e.detail;
      multiClickOnHighlightRef.current = e.detail >= 2
        && !!(e.target as Element | null)?.closest?.('.annotation-highlight');
      // A double or triple click on a highlight would select a word or line
      // inside it; stop that selection before the browser makes it
      if (multiClickOnHighlightRef.current) e.preventDefault();
    };
    document.addEventListener('mouseup', track, true);
    document.addEventListener('mousedown', trackClicks, true);
    return () => {
      document.removeEventListener('mouseup', track, true);
      document.removeEventListener('mousedown', trackClicks, true);
    };
  }, [clearPendingSelection]);

  // --- Helpers ---

  const findTextInDOM = useCallback((searchText: string): Range | null => {
    if (!containerRef.current) return null;

    // Search for an exact substring match inside the container's text tree.
    // Falls back to a multi-text-node walk when the match spans siblings.
    const searchOnce = (needle: string): Range | null => {
      if (!needle || !containerRef.current) return null;

      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => isAnnotationExcludedTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
        },
      );
      const textNodes: Text[] = [];
      let currentNode: Text | null;
      while ((currentNode = walker.nextNode() as Text | null)) {
        textNodes.push(currentNode);
      }

      const rangeFromTextOffsets = (startIndex: number, endIndex: number): Range | null => {
        let charCount = 0;
        let startNode: Text | null = null;
        let startOffset = 0;
        let endNode: Text | null = null;
        let endOffset = 0;
        for (const node of textNodes) {
          const nodeLength = node.textContent?.length || 0;

          if (!startNode && charCount + nodeLength > startIndex) {
            startNode = node;
            startOffset = startIndex - charCount;
          }

          if (startNode && charCount + nodeLength >= endIndex) {
            endNode = node;
            endOffset = endIndex - charCount;
            break;
          }

          charCount += nodeLength;
        }

        if (startNode && endNode) {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          return range;
        }

        return null;
      };

      const normalizeWithMap = (text: string): { text: string; map: number[] } => {
        let normalized = '';
        const map: number[] = [];
        let inWhitespace = false;

        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (/\s/.test(ch)) {
            if (!inWhitespace) {
              normalized += ' ';
              map.push(i);
              inWhitespace = true;
            }
          } else {
            normalized += ch;
            map.push(i);
            inWhitespace = false;
          }
        }

        let start = 0;
        let end = normalized.length;
        while (start < end && normalized[start] === ' ') start++;
        while (end > start && normalized[end - 1] === ' ') end--;

        return {
          text: normalized.slice(start, end),
          map: map.slice(start, end),
        };
      };

      for (const node of textNodes) {
        const text = node.textContent || '';
        const index = text.indexOf(needle);
        if (index !== -1) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          return range;
        }
      }

      const fullText = textNodes.map((node) => node.textContent ?? '').join('');
      const searchIndex = fullText.indexOf(needle);
      if (searchIndex !== -1) {
        return rangeFromTextOffsets(searchIndex, searchIndex + needle.length);
      }

      const haystack = normalizeWithMap(fullText);
      const normalizedNeedle = normalizeWithMap(needle).text;
      const normalizedIndex = haystack.text.indexOf(normalizedNeedle);
      if (normalizedNeedle && normalizedIndex !== -1) {
        const originalStart = haystack.map[normalizedIndex];
        const originalEnd = haystack.map[normalizedIndex + normalizedNeedle.length - 1] + 1;
        return rangeFromTextOffsets(originalStart, originalEnd);
      }

      // A quote spanning blocks holds a newline where the DOM's text nodes
      // meet with none, so match with all whitespace removed.
      const strippedMap: number[] = [];
      let stripped = '';
      for (let i = 0; i < fullText.length; i++) {
        if (/\s/.test(fullText[i])) continue;
        stripped += fullText[i];
        strippedMap.push(i);
      }
      const strippedNeedle = stripWhitespace(needle);
      const strippedIndex = strippedNeedle ? stripped.indexOf(strippedNeedle) : -1;
      if (strippedIndex !== -1) {
        const originalStart = strippedMap[strippedIndex];
        const originalEnd = strippedMap[strippedIndex + strippedNeedle.length - 1] + 1;
        return rangeFromTextOffsets(originalStart, originalEnd);
      }

      return null;
    };

    // First try the literal text. If that misses, re-try with the same
    // transform the renderer applies to plain text (emoji shortcodes +
    // smart punctuation) so annotations made before those transforms
    // shipped can still re-bind to their target after reload.
    const direct = searchOnce(searchText);
    if (direct) return direct;

    const transformed = transformPlainText(searchText);
    if (transformed !== searchText) {
      return searchOnce(transformed);
    }

    return null;
  }, []);

  const createAnnotationFromSource = (
    highlighter: Highlighter,
    source: any,
    type: AnnotationType,
    text?: string,
    images?: ImageAttachment[],
  ) => {
    if (isBlankQuote(source?.text)) return;
    const doms = highlighter.getDoms(source.id);
    let blockId = '';
    let startOffset = 0;

    if (doms?.length > 0) {
      const el = doms[0] as HTMLElement;
      let parent = el.parentElement;
      while (parent && !parent.dataset.blockId) {
        parent = parent.parentElement;
      }
      if (parent?.dataset.blockId) {
        blockId = parent.dataset.blockId;
        const blockText = parent.textContent || '';
        const beforeText = blockText.split(source.text)[0];
        startOffset = beforeText?.length || 0;
      }
    }

    const mathTargets = pendingMathTargetsRef.current;

    const newAnnotation: Annotation = {
      id: source.id,
      blockId,
      startOffset,
      endOffset: startOffset + source.text.length,
      type,
      text,
      originalText: source.text,
      createdA: Date.now(),
      startMeta: source.startMeta,
      endMeta: source.endMeta,
      images,
      ...(mathTargets.length > 0 ? {
        mathTargets: mathTargets.map(target => ({
          blockId: target.blockId,
          tex: target.tex,
          displayMode: target.displayMode,
        })),
      } : {}),
    };

    if (type === AnnotationType.DELETION) {
      highlighter.addClass('deletion', source.id);
    } else if (type === AnnotationType.COMMENT) {
      highlighter.addClass('comment', source.id);
    }
    applyMathTargets(mathTargets, source.id, type);

    justCreatedIdRef.current = newAnnotation.id;
    onAddAnnotationRef.current?.(newAnnotation);
  };

  const createAnnotationFromMathSource = (
    source: MathAnnotationSource,
    type: AnnotationType,
    text?: string,
    images?: ImageAttachment[],
  ) => {
    const id = annotationId();
    applyMathAnnotationClass(source.element, id, type, source.displayMode);
    // Committed — hand ownership of the highlight to the annotation so a later
    // clearPendingSelection() doesn't strip it.
    pendingMathElementRef.current = null;

    const newAnnotation: Annotation = {
      id,
      blockId: source.blockId,
      startOffset: 0,
      endOffset: source.text.length,
      type,
      text,
      originalText: source.text,
      createdA: Date.now(),
      images,
    };

    justCreatedIdRef.current = newAnnotation.id;
    onAddAnnotationRef.current?.(newAnnotation);
  };

  const findMathElementForAnnotation = useCallback((ann: Annotation): HTMLElement | null => {
    if (!containerRef.current || !ann.blockId || !ann.originalText) return null;

    const block = containerRef.current.querySelector<HTMLElement>(
      `[data-block-id="${escapeAttrValue(ann.blockId)}"]`
    );
    if (!block) return null;

    if (
      block.matches('.math-annotatable[data-math-tex]') &&
      block.dataset.mathTex === ann.originalText
    ) {
      return block;
    }

    const candidates = block.querySelectorAll<HTMLElement>('.math-annotatable[data-math-tex]');
    for (const candidate of Array.from(candidates)) {
      if (candidate.dataset.mathTex === ann.originalText) return candidate;
    }

    return null;
  }, []);

  const findMathElementsForAnnotation = useCallback((ann: Annotation): MathAnnotationTarget[] => {
    if (!containerRef.current) return [];

    if (ann.mathTargets?.length) {
      const targets: MathAnnotationTarget[] = [];
      const seen = new Set<HTMLElement>();

      ann.mathTargets.forEach(target => {
        const block = containerRef.current?.querySelector<HTMLElement>(
          `[data-block-id="${escapeAttrValue(target.blockId)}"]`
        );
        if (!block) return;

        const candidates = [
          ...(block.matches('.math-annotatable[data-math-tex]') ? [block] : []),
          ...Array.from(block.querySelectorAll<HTMLElement>('.math-annotatable[data-math-tex]')),
        ];
        const element = candidates.find(candidate => candidate.dataset.mathTex === target.tex);
        if (!element || seen.has(element)) return;

        seen.add(element);
        targets.push({
          element,
          blockId: target.blockId,
          tex: target.tex,
          displayMode: target.displayMode,
        });
      });

      return targets;
    }

    const mathElement = findMathElementForAnnotation(ann);
    if (!mathElement) return [];

    return [{
      element: mathElement,
      blockId: ann.blockId,
      tex: mathElement.dataset.mathTex ?? ann.originalText,
      displayMode: mathElement.dataset.mathDisplay === 'true',
    }];
  }, [findMathElementForAnnotation]);

  // --- Imperative methods ---

  const applyAnnotationsInternal = useCallback((anns: Annotation[]) => {
    const highlighter = highlighterRef.current;
    if (!highlighter || !containerRef.current) return;

    anns.forEach(ann => {
      if (ann.type === AnnotationType.GLOBAL_COMMENT) return;
      // An older draft can hold a whitespace-only quote; its stored positions
      // may still resolve and would paint an invisible mark.
      if (isBlankQuote(ann.originalText)) return;

      // Skip if already highlighted
      try {
        const existingDoms = highlighter.getDoms(ann.id);
        if (existingDoms && existingDoms.length > 0) return;
      } catch {}
      const existingManual = containerRef.current?.querySelector(`[data-bind-id="${ann.id}"]`);
      if (existingManual) return;

      const mathTargets = findMathElementsForAnnotation(ann);
      if (mathTargets.length > 0) {
        applyMathTargets(mathTargets, ann.id, ann.type);
        if (!ann.startMeta && !ann.endMeta && !ann.mathTargets?.length) {
          return;
        }
      }

      let range: Range | null = null;
      if (ann.startMeta && ann.endMeta) {
        try {
          highlighter.fromStore(ann.startMeta, ann.endMeta, ann.originalText, ann.id);
          const restoredDoms = highlighter.getDoms(ann.id);
          if (restoredDoms && restoredDoms.length > 0) {
            // A mismatch moves to the quote's text match; with no match the
            // stored positions are still the best guess (rendered math, for
            // one, never matches its quote).
            if (!restoredTextMatches(restoredDoms, ann.originalText)) {
              highlighter.remove(ann.id);
              range = findTextInDOM(ann.originalText);
              if (!range) highlighter.fromStore(ann.startMeta, ann.endMeta, ann.originalText, ann.id);
            }
          }
          if (!range && restoredDoms && restoredDoms.length > 0) {
            if (ann.type === AnnotationType.DELETION) {
              highlighter.addClass('deletion', ann.id);
            } else if (ann.type === AnnotationType.COMMENT) {
              highlighter.addClass('comment', ann.id);
            }
            return;
          }
        } catch {}
      }

      range ??= findTextInDOM(ann.originalText);
      if (!range) {
        console.warn(`Could not find text for annotation ${ann.id}: "${ann.originalText.slice(0, 50)}..."`);
        return;
      }

      try {
        const textNodes: { node: Text; start: number; end: number }[] = [];
        const walker = document.createTreeWalker(
          range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode!
            : range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => isAnnotationExcludedTextNode(node)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
          },
        );

        let node: Text | null;
        let inRange = false;

        while ((node = walker.nextNode() as Text | null)) {
          if (node === range.startContainer) {
            inRange = true;
            const start = range.startOffset;
            const end = node === range.endContainer ? range.endOffset : node.length;
            if (end > start) {
              textNodes.push({ node, start, end });
            }
            if (node === range.endContainer) break;
            continue;
          }

          if (node === range.endContainer) {
            if (inRange) {
              const end = range.endOffset;
              if (end > 0) {
                textNodes.push({ node, start: 0, end });
              }
            }
            break;
          }

          if (inRange && node.length > 0) {
            textNodes.push({ node, start: 0, end: node.length });
          }
        }

        if (textNodes.length === 0) {
          console.warn(`No text nodes found for annotation ${ann.id}`);
          return;
        }

        textNodes.reverse().forEach(({ node, start, end }) => {
          try {
            const nodeRange = document.createRange();
            nodeRange.setStart(node, start);
            nodeRange.setEnd(node, end);

            const mark = document.createElement('mark');
            mark.className = 'annotation-highlight';
            mark.dataset.bindId = ann.id;

            if (ann.type === AnnotationType.DELETION) {
              mark.classList.add('deletion');
            } else if (ann.type === AnnotationType.COMMENT) {
              mark.classList.add('comment');
            }

            nodeRange.surroundContents(mark);

            mark.addEventListener('click', () => {
              onSelectAnnotationRef.current?.(ann.id);
            });
          } catch (e) {
            console.warn(`Failed to wrap text node for annotation ${ann.id}:`, e);
          }
        });
      } catch (e) {
        console.warn(`Failed to apply highlight for annotation ${ann.id}:`, e);
      }
    });
  }, [findMathElementsForAnnotation, findTextInDOM]);

  const removeHighlight = useCallback((id: string) => {
    highlighterRef.current?.remove(id);

    const mathHighlights = containerRef.current?.querySelectorAll(
      `[data-bind-id="${id}"][data-math-annotation="true"]`
    );
    mathHighlights?.forEach(clearMathAnnotationClass);

    const manualHighlights = containerRef.current?.querySelectorAll(`[data-bind-id="${id}"]`);
    manualHighlights?.forEach(el => {
      if ((el as HTMLElement).dataset.mathAnnotation === 'true') return;
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      el.remove();
    });
  }, []);

  const clearAllHighlights = useCallback(() => {
    const mathHighlights = containerRef.current?.querySelectorAll('[data-math-annotation="true"]');
    mathHighlights?.forEach(clearMathAnnotationClass);

    const manualHighlights = containerRef.current?.querySelectorAll('[data-bind-id]');
    manualHighlights?.forEach(el => {
      if ((el as HTMLElement).dataset.mathAnnotation === 'true') return;
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      el.remove();
    });

    const webHighlights = containerRef.current?.querySelectorAll('.annotation-highlight');
    webHighlights?.forEach(el => {
      if ((el as HTMLElement).dataset.mathAnnotation === 'true') return;
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      el.remove();
    });
  }, []);

  // --- Effects ---

  // Hovering one mark of an annotation lights all of its marks. A highlight
  // that crosses an inline code chip, a link or a line break is split into
  // several marks, and :hover lit only the one under the pointer.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !enabled) return;
    let hovered: string | undefined;
    const light = (id: string | undefined) => {
      if (id === hovered) return;
      root.querySelectorAll('.annotation-highlight.hovered').forEach((el) => el.classList.remove('hovered'));
      hovered = id;
      if (!id) return;
      const escaped = CSS.escape(id);
      root
        .querySelectorAll(`.annotation-highlight[data-highlight-id="${escaped}"], .annotation-highlight[data-bind-id="${escaped}"]`)
        .forEach((el) => el.classList.add('hovered'));
    };
    const handleOver = (e: MouseEvent) => {
      const mark = (e.target as Element).closest<HTMLElement>('.annotation-highlight');
      light(mark ? mark.dataset.bindId ?? mark.dataset.highlightId : undefined);
    };
    const handleLeave = () => light(undefined);
    root.addEventListener('mouseover', handleOver);
    root.addEventListener('mouseleave', handleLeave);
    return () => {
      root.removeEventListener('mouseover', handleOver);
      root.removeEventListener('mouseleave', handleLeave);
      light(undefined);
    };
  }, [containerRef, enabled]);

  // A mark that reaches an inline-code chip's edge is tagged so the CSS can
  // stretch it over the chip's left or right padding; otherwise the padding
  // shows as a gap between the mark and the highlighted text next to the chip.
  // A mark in a chip also has its top and bottom padding set so its band lines
  // up with a mark beside the chip on the same line: the CSS band uses fixed
  // font metrics, which drift up to 1px from the real ones when the page is
  // zoomed, so the chip's band came out taller.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !enabled) return;
    // The band of a mark outside the chip on the same line as `line`.
    const bandBeside = (code: HTMLElement, line: DOMRect) => {
      for (const other of code.parentElement?.querySelectorAll('.annotation-highlight') ?? []) {
        if (code.contains(other)) continue;
        for (const r of other.getClientRects()) {
          if (Math.min(r.bottom, line.bottom) - Math.max(r.top, line.top) > line.height / 2) return r;
        }
      }
      return null;
    };
    const tagChipEdges = () => {
      root.querySelectorAll<HTMLElement>(':not(pre) > code mark.annotation-highlight').forEach((mark) => {
        const code = mark.closest('code');
        if (!code) return;
        const before = document.createRange();
        before.setStart(code, 0);
        before.setEndBefore(mark);
        const after = document.createRange();
        after.setStartAfter(mark);
        after.setEnd(code, code.childNodes.length);
        mark.toggleAttribute('data-chip-start', before.toString() === '');
        mark.toggleAttribute('data-chip-end', after.toString() === '');
        mark.style.paddingTop = '';
        mark.style.paddingBottom = '';
        const own = mark.getClientRects()[0];
        const beside = own && bandBeside(code, own);
        if (!beside) return;
        // Rects are in zoomed pixels under CSS zoom, padding is not.
        const zoom = (mark as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
        const style = getComputedStyle(mark);
        mark.style.paddingTop = `${parseFloat(style.paddingTop) + (own.top - beside.top) / zoom}px`;
        mark.style.paddingBottom = `${parseFloat(style.paddingBottom) + (beside.bottom - own.bottom) / zoom}px`;
      });
    };
    tagChipEdges();
    const observer = new MutationObserver(tagChipEdges);
    observer.observe(root, { childList: true, subtree: true });
    // Zoom changes the metrics; it fires resize. Fonts can load late.
    window.addEventListener('resize', tagChipEdges);
    document.fonts.addEventListener('loadingdone', tagChipEdges);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', tagChipEdges);
      document.fonts.removeEventListener('loadingdone', tagChipEdges);
    };
  }, [containerRef, enabled]);

  // The browser's selection paints only text, so a chip's left and right
  // padding showed as gaps in a drag across it. A chip whose edge the
  // selection crosses is tagged, and the CSS paints that padding in the
  // selection color, the way a mark at the chip's edge covers it.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !enabled) return;
    const tagged = new Set<HTMLElement>();
    const tag = () => {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : null;
      const next = new Map<HTMLElement, [boolean, boolean]>();
      if (range && root.contains(range.commonAncestorContainer)) {
        root.querySelectorAll<HTMLElement>(':not(pre) > code').forEach((code) => {
          if (!range.intersectsNode(code)) return;
          const inner = document.createRange();
          inner.selectNodeContents(code);
          const overlap = range.cloneRange();
          if (range.compareBoundaryPoints(Range.START_TO_START, inner) < 0) overlap.setStart(code, 0);
          if (range.compareBoundaryPoints(Range.END_TO_END, inner) > 0) overlap.setEnd(code, code.childNodes.length);
          if (overlap.toString() === '') return;
          next.set(code, [
            range.compareBoundaryPoints(Range.START_TO_START, inner) <= 0,
            range.compareBoundaryPoints(Range.END_TO_END, inner) >= 0,
          ]);
        });
      }
      for (const code of tagged) {
        if (next.has(code)) continue;
        code.removeAttribute('data-sel-start');
        code.removeAttribute('data-sel-end');
        tagged.delete(code);
      }
      for (const [code, [start, end]] of next) {
        code.toggleAttribute('data-sel-start', start);
        code.toggleAttribute('data-sel-end', end);
        tagged.add(code);
      }
    };
    document.addEventListener('selectionchange', tag);
    return () => {
      document.removeEventListener('selectionchange', tag);
      for (const code of tagged) {
        code.removeAttribute('data-sel-start');
        code.removeAttribute('data-sel-end');
      }
    };
  }, [containerRef, enabled]);

  // Initialize web-highlighter (no callback deps — reads from refs)
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    const highlighter = new Highlighter({
      $root: containerRef.current,
      exceptSelectors: [
        '.annotation-toolbar',
        'button',
        '.math-annotatable',
        '.katex',
        ANNOTATION_EXCLUDED_SELECTOR,
      ],
      wrapTag: 'mark',
      style: { className: 'annotation-highlight' },
    });

    highlighterRef.current = highlighter;

    highlighter.on(Highlighter.event.CREATE, ({ sources, type }: { sources: any[]; type?: string }) => {
      if (type === 'from-store') return;
      if (sources.length > 0) {
        const source = sources[0];
        if (multiClickOnHighlightRef.current) {
          highlighter.remove(source.id);
          window.getSelection()?.removeAllRanges();
          return;
        }
        // Every producer lands here (mouse, touch bridge, highlightRange), so
        // a blank quote is dropped once for all of them.
        if (isBlankQuote(source.text)) {
          highlighter.remove(source.id);
          window.getSelection()?.removeAllRanges();
          return;
        }
        const doms = highlighter.getDoms(source.id);
        if (doms?.length > 0) {
          // Clean up previous pending
          if (pendingSourceRef.current) {
            highlighter.remove(pendingSourceRef.current.id);
          }
          clearPendingSelection();
          pendingMathTargetsRef.current = mathTargetsFromSelection(window.getSelection(), containerRef.current);
          setCommentPopover(null);

          // Alt on release strikes the selection through; every other
          // release opens the composer on the highlight.
          const redline = (pendingModeOverrideRef.current ?? (altOnReleaseRef.current ? 'redline' : 'comment')) === 'redline';
          pendingModeOverrideRef.current = null;
          altOnReleaseRef.current = false;

          if (redline) {
            createAnnotationFromSource(highlighter, source, AnnotationType.DELETION);
            window.getSelection()?.removeAllRanges();
          } else {
            pendingSourceRef.current = source;
            setCommentPopover({
              anchorEl: doms[0] as HTMLElement,
              contextText: source.text.slice(0, 80),
              selectedText: source.text,
              source,
        
            });
          }
        }
      }
    });

    highlighter.on(Highlighter.event.CLICK, ({ id }: { id: string }) => {
      onSelectAnnotationRef.current?.(id);
    });

    highlighter.run();

    // Runs in the capture phase, before the library's own mouseup listener
    // on the same root reads the live selection. Collapsing a blank or
    // unserializable selection here makes the library's handler a no-op.
    const handleUnusableSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      if (isBlankQuote(selection.toString()) || !isSerializableRange(selection.getRangeAt(0))) {
        selection.removeAllRanges();
      }
    };

    const handleMathMouseDown = (event: MouseEvent) => {
      mouseDownMathRef.current = closestMathElement(event.target as Node, containerRef.current);
      if (mouseDownMathRef.current) {
        event.stopPropagation();
      }
    };

    const handleMathMouseUp = (event: MouseEvent) => {
      if (!containerRef.current) return;

      const selection = window.getSelection();
      const mathElement =
        closestMathElement(event.target as Node, containerRef.current) ||
        mouseDownMathRef.current ||
        mathElementFromSelection(selection, containerRef.current);
      mouseDownMathRef.current = null;

      if (!mathElement) return;

      const existingId = mathElement.dataset.bindId;
      const selectedText = selection?.toString().trim() ?? '';
      if (!selectedText && existingId) {
        event.preventDefault();
        event.stopPropagation();
        onSelectAnnotationRef.current?.(existingId);
        return;
      }
      if (selectionHasNonMathContent(selection, containerRef.current)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const source = mathSourceFromElement(mathElement);
      if (!source) return;

      if (pendingSourceRef.current && !isMathAnnotationSource(pendingSourceRef.current)) {
        highlighter.remove(pendingSourceRef.current.id);
      }
      clearPendingSelection();
      setCommentPopover(null);

      if (altOnReleaseRef.current) {
        altOnReleaseRef.current = false;
        createAnnotationFromMathSource(source, AnnotationType.DELETION);
        window.getSelection()?.removeAllRanges();
        return;
      }

      pendingSourceRef.current = source;
      showPendingMathPreview(source);
      setCommentPopover({
        anchorEl: source.element,
        contextText: source.text.slice(0, 80),
        selectedText: source.text,
        source,
  
      });
    };

    containerRef.current.addEventListener('mouseup', handleUnusableSelection, true);
    containerRef.current.addEventListener('touchend', handleUnusableSelection, true);
    containerRef.current.addEventListener('mousedown', handleMathMouseDown, true);
    containerRef.current.addEventListener('mouseup', handleMathMouseUp, true);

    // Mobile bridge
    const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
    let selectionTimer: ReturnType<typeof setTimeout>;
    const handleSelectionChange = isTouchPrimary
      ? () => {
          clearTimeout(selectionTimer);
          selectionTimer = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
            if (!containerRef.current?.contains(sel.anchorNode)) return;
            const range = sel.getRangeAt(0);
            if (isBlankQuote(sel.toString()) || !isSerializableRange(range)) return;
            highlighter.fromRange(range);
          }, 400);
        }
      : null;

    if (handleSelectionChange) {
      document.addEventListener('selectionchange', handleSelectionChange);
    }

    return () => {
      if (handleSelectionChange) {
        clearTimeout(selectionTimer);
        document.removeEventListener('selectionchange', handleSelectionChange);
      }
      containerRef.current?.removeEventListener('mouseup', handleUnusableSelection, true);
      containerRef.current?.removeEventListener('touchend', handleUnusableSelection, true);
      containerRef.current?.removeEventListener('mousedown', handleMathMouseDown, true);
      containerRef.current?.removeEventListener('mouseup', handleMathMouseUp, true);
      highlighter.dispose();
    };
  }, [clearPendingSelection, enabled]);

  const highlightRange = useCallback((range: Range, modeOverride?: 'redline' | 'comment') => {
    const highlighter = highlighterRef.current;
    const container = containerRef.current;
    if (!highlighter || !container || range.collapsed) return;
    if (!container.contains(range.commonAncestorContainer)) return;
    if (!isSerializableRange(range)) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range.cloneRange());
    pendingModeOverrideRef.current = modeOverride ?? null;

    try {
      highlighter.fromRange(range);
    } finally {
      pendingModeOverrideRef.current = null;
      selection?.removeAllRanges();
    }
  }, [containerRef]);

  const highlightMathElement = useCallback((
    element: HTMLElement,
    modeOverride?: 'redline' | 'comment',
  ) => {
    const container = containerRef.current;
    const mathElement = closestMathElement(element, container);
    if (!container || !mathElement) return;

    const effectiveMode = modeOverride
      ?? (altOnReleaseRef.current ? 'redline' : 'comment');
    altOnReleaseRef.current = false;
    const existingId = mathElement.dataset.bindId;
    if (existingId && effectiveMode !== 'redline') {
      onSelectAnnotationRef.current?.(existingId);
      return;
    }

    const source = mathSourceFromElement(mathElement);
    if (!source) return;

    const highlighter = highlighterRef.current;
    if (pendingSourceRef.current && highlighter && !isMathAnnotationSource(pendingSourceRef.current)) {
      highlighter.remove(pendingSourceRef.current.id);
    }
    clearPendingSelection();
    setCommentPopover(null);

    if (effectiveMode === 'redline') {
      createAnnotationFromMathSource(source, AnnotationType.DELETION);
      return;
    }

    pendingSourceRef.current = source;
    showPendingMathPreview(source);

    setCommentPopover({
      anchorEl: source.element,
      contextText: source.text.slice(0, 80),
      selectedText: source.text,
      source,

    });
  }, [clearPendingSelection, containerRef, showPendingMathPreview]);

  // Apply CSS classes to existing annotations
  useEffect(() => {
    const highlighter = highlighterRef.current;
    if (!highlighter) return;

    annotations.forEach(ann => {
      try {
        const doms = highlighter.getDoms(ann.id);
        if (doms && doms.length > 0) {
          if (ann.type === AnnotationType.DELETION) {
            highlighter.addClass('deletion', ann.id);
          } else if (ann.type === AnnotationType.COMMENT) {
            highlighter.addClass('comment', ann.id);
          }
        }
      } catch {}
    });
  }, [annotations]);

  // Scroll the selected annotation into view when it is off screen
  useEffect(() => {
    if (!containerRef.current || !selectedAnnotationId) return;

    // Skip scroll if we just created this annotation
    if (justCreatedIdRef.current === selectedAnnotationId) {
      justCreatedIdRef.current = null;
      return;
    }

    const highlighter = highlighterRef.current;
    let targetElements: Element[] = [];

    if (highlighter) {
      try {
        const doms = highlighter.getDoms(selectedAnnotationId);
        if (doms && doms.length > 0) targetElements = Array.from(doms);
      } catch {}
    }

    if (targetElements.length === 0) {
      const manualMarks = containerRef.current.querySelectorAll(
        `[data-bind-id="${selectedAnnotationId}"]`
      );
      if (manualMarks.length > 0) targetElements = Array.from(manualMarks);
    }

    if (targetElements.length === 0) return;

    const rect = targetElements[0].getBoundingClientRect();
    if (rect.top < 64 || rect.bottom > window.innerHeight - 16) {
      targetElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedAnnotationId]);

  // --- Handlers ---

  const handleCommentSubmit = (text: string, images?: ImageAttachment[]) => {
    if (!commentPopover) return;
    if (isMathAnnotationSource(commentPopover.source)) {
      createAnnotationFromMathSource(
        commentPopover.source,
        AnnotationType.COMMENT,
        text,
        images,
      );
      clearPendingSelection();
      window.getSelection()?.removeAllRanges();
      setCommentPopover(null);
      return;
    }
    if (commentPopover.source && highlighterRef.current) {
      createAnnotationFromSource(
        highlighterRef.current, commentPopover.source,
        AnnotationType.COMMENT, text, images
      );
      clearPendingSelection();
      window.getSelection()?.removeAllRanges();
    }
    setCommentPopover(null);
  };

  const handleCommentQuickLabel = (label: QuickLabel) => {
    handleCommentSubmit(formatQuickLabel(label));
  };

  const handleCommentClose = useCallback(() => {
    setCommentPopover(prev => {
      if (prev?.source && highlighterRef.current && !isMathAnnotationSource(prev.source)) {
        highlighterRef.current.remove(prev.source.id);
      }
      return null;
    });
    clearPendingSelection();
    window.getSelection()?.removeAllRanges();
  }, [clearPendingSelection]);

  return {
    highlighterRef,
    commentPopover,
    handleCommentSubmit,
    handleCommentQuickLabel,
    handleCommentClose,
    highlightRange,
    highlightMathElement,
    removeHighlight,
    clearAllHighlights,
    applyAnnotations: applyAnnotationsInternal,
  };
}
