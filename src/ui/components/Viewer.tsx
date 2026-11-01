import React, { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react';
import { AnnotationType, type Block, type Annotation, type ImageAttachment } from '../types';
import { applyHighlight, codeBlockClassName, onCodeHighlightSwap } from '../utils/codeHighlight';
import { paintCodeBlockMark } from '../utils/codeBlockMark';
import { useFenceTheme } from '../hooks/useFenceTheme';
import { computeListIndices, groupBlocks, type Frontmatter, type FrontmatterValue } from '../utils/parser';
import { buildHeadingSlugMap } from '../utils/slugify';
import { BlockRenderer } from './BlockRenderer';
import { CodeBlock } from './blocks/CodeBlock';
import { TableBlock } from './blocks/TableBlock';
import { TableToolbar } from './blocks/TableToolbar';

import { CommentPopover } from './CommentPopover';
import { ImageLightbox } from './ImageLightbox';
import { MermaidBlock } from './MermaidBlock';
import { isMermaidLanguage } from './diagramLanguages';
import { useQuickLabels } from '../hooks/useQuickLabels';
import { DocBadges } from './DocBadges';
import { BlockOutline } from './BlockOutline';
import { TabHint } from './TabHint';
import { useSelectionWidening } from '../hooks/useSelectionWidening';
import { useAnnotationHighlighter } from '../hooks/useAnnotationHighlighter';
import {
  getScrollViewportRect,
  getScrollViewportTop,
  scrollViewportTo,
  useScrollViewport,
} from '../hooks/useScrollViewport';
import { decodeAnchorHash } from '../utils/anchors';

/** Public properties for the Markdown document Viewer. */
export interface ViewerProps {
  blocks: Block[];
  frontmatter?: Frontmatter | null;
  annotations: Annotation[];
  onAddAnnotation: (ann: Annotation) => void;
  onSelectAnnotation: (id: string | null) => void;
  selectedAnnotationId: string | null;
  repoInfo?: { display: string; branch?: string; host?: string } | null;
  imageBaseDir?: string;
  /** Show amber "Demo" badge (portal mode, no shared content loaded) */
  showDemoBadge?: boolean;
  /** Max width in px for the document card; null removes the cap entirely. */
  maxWidth?: number | null;
  // Checkbox toggle props
  onToggleCheckbox?: (blockId: string, checked: boolean) => void;
  checkboxOverrides?: Map<string, boolean>;
  /** Turns on `/sidechat` in the composer. Called with the question and the highlighted text. */
  onAskSideQuestion?: (question: string, quote: string) => void;
  /** Called when the viewer opens a composer for a new selection. */
  onComposerOpen?: () => void;
  /** Called with whether the selection composer is open, each time that changes. */
  onComposerOpenChange?: (open: boolean) => void;
}

export interface ViewerHandle {
  removeHighlight: (id: string) => void;
  clearAllHighlights: () => void;
  applyAnnotations: (annotations: Annotation[]) => void;
  /** Closes the viewer's composer unless it holds a draft. Returns false when it stays open. */
  closeComposer: () => boolean;
}

// Named type guard so both taken and fallthrough branches narrow.
function isFrontmatterMap(value: FrontmatterValue): value is { [key: string]: FrontmatterValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Renders a single frontmatter field or recursive sub-structure.
 */
const FrontmatterRow: React.FC<{ field: string; value: FrontmatterValue }> = ({ field, value }) => {
  if (isFrontmatterMap(value)) {
    const subEntries = Object.entries(value);
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">{field}:</span>
        <div className="pl-4 grid gap-1.5">
          {subEntries.map(([k, v]) => (
            <FrontmatterRow key={k} field={k} value={v} />
          ))}
        </div>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const isArrayOfMaps = value.some((v) => typeof v === 'object' && v !== null);
    if (isArrayOfMaps) {
      return (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-muted-foreground">{field}:</span>
          <div className="pl-4 grid gap-2">
            {value.map((item, i) => (
              <div key={i} className="p-2 bg-muted/40 border border-border/40 rounded-sm grid gap-1.5">
                {isFrontmatterMap(item) ? (
                  Object.entries(item).map(([k, v]) => (
                    <FrontmatterRow key={k} field={k} value={v} />
                  ))
                ) : (
                  <span className="text-foreground">{typeof item === 'string' ? item : String(item)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-2">
        <span className="font-semibold text-muted-foreground min-w-20">{field}:</span>
        <span className="text-foreground">
          <span className="flex flex-wrap gap-1">
            {value.map((v, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm text-caption">
                {typeof v === 'string' ? v : String(v)}
              </span>
            ))}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <span className="font-semibold text-muted-foreground min-w-20">{field}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
};

/**
 * Renders YAML frontmatter as a styled metadata card.
 */
const FrontmatterCard: React.FC<{ frontmatter: Frontmatter }> = ({ frontmatter }) => {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return null;

  return (
    <div className="mt-4 mb-6 p-4 bg-muted/30 border border-border/50 rounded-lg">
      <div className="grid gap-2 text-body">
        {entries.map(([key, value]) => (
          <FrontmatterRow key={key} field={key} value={value} />
        ))}
      </div>
    </div>
  );
};

/**
 * Render and annotate a parsed Markdown document.
 *
 * Pointer and opt-in keyboard annotations share the same highlight callbacks;
 * the imperative handle mutates only highlights owned by this viewer.
 */
export const Viewer = forwardRef<ViewerHandle, ViewerProps>(({
  blocks,
  frontmatter,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
  repoInfo,
  showDemoBadge,
  maxWidth,
  imageBaseDir,
  onToggleCheckbox,
  checkboxOverrides,
  onComposerOpen,
  onComposerOpenChange,
  onAskSideQuestion,
}, ref) => {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [locationHash, setLocationHash] = useState(() => window.location.hash);
  // Read through a ref: only the imperative removeHighlight path below needs
  // it, and CodeBlock re-highlights itself on palette change.
  const fenceTheme = useFenceTheme();
  const fenceThemeRef = useRef(fenceTheme);
  fenceThemeRef.current = fenceTheme;

  const containerRef = useRef<HTMLDivElement>(null);
  // The element that actually scrolls; shared by the sticky-header observer
  // and the reticle geometry.
  const scrollViewport = useScrollViewport();
  // The badge cluster (repo chips / demo badge) is absolutely positioned in the
  // card's top padding. One row fits; a second row or mobile wrapping
  // outgrows the padding and lands on the document's first heading.
  // Measure the cluster and insert exactly the clearance it needs (0 when it fits).
  const docBadgesRef = useRef<HTMLDivElement | null>(null);
  const [badgeClearance, setBadgeClearance] = useState(0);
  useEffect(() => {
    const el = docBadgesRef.current;
    const article = containerRef.current;
    if (!el || !article) { setBadgeClearance(0); return; }
    const measure = () => {
      const pad = parseFloat(getComputedStyle(article).paddingTop) || 0;
      const overflow = el.offsetTop + el.offsetHeight - pad;
      setBadgeClearance(overflow > 1 ? overflow + 4 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [repoInfo, showDemoBadge]);

  // Per-doc heading slug map with dedup — computed once per blocks array so
  // anchor ids stay stable across re-renders and duplicate heading texts get
  // `-1`/`-2`/... suffixes rather than colliding on the same id.
  const headingSlugMap = useMemo(() => buildHeadingSlugMap(blocks), [blocks]);
  const isTouchDevice = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const [hoveredTable, setHoveredTable] = useState<{ block: Block; element: HTMLElement } | null>(null);
  const [isTableToolbarExiting, setIsTableToolbarExiting] = useState(false);
  const tableHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Viewer-specific comment popover state (code blocks)
  const [viewerCommentPopover, setViewerCommentPopover] = useState<{
    anchorEl: HTMLElement;
    contextText: string;
    selectedText?: string;
    initialText?: string;
    codeBlock?: { block: Block; element: HTMLElement };
  } | null>(null);
  const lastAutoScrolledHashRef = useRef<string | null>(null);
  const [quickLabels] = useQuickLabels();
  const composerDirtyRef = useRef(false);
  const handleComposerDraftChange = useCallback((text: string, images?: ImageAttachment[]) => {
    composerDirtyRef.current = text.trim() !== '' || (images?.length ?? 0) > 0;
  }, []);

  // Shared annotation infrastructure via hook
  const {
    commentPopover: hookCommentPopover,
    handleCommentSubmit: hookCommentSubmit,
    handleCommentQuickLabel: hookCommentQuickLabel,
    handleCommentClose: hookCommentClose,
    highlightRange,
    removeHighlight: hookRemoveHighlight,
    clearAllHighlights,
    applyAnnotations,
  } = useAnnotationHighlighter({
    containerRef,
    annotations,
    onAddAnnotation,
    onSelectAnnotation,
    selectedAnnotationId,
  });

  // Refs for code block annotation path
  const onAddAnnotationRef = useRef(onAddAnnotation);
  useEffect(() => { onAddAnnotationRef.current = onAddAnnotation; }, [onAddAnnotation]);

  const applyCodeBlockAnnotation = useCallback((
    blockId: string,
    codeEl: Element,
    type: AnnotationType,
    text?: string,
    images?: ImageAttachment[],
  ) => {
    const id = `codeblock-${Date.now()}`;
    const codeText = codeEl.textContent || '';

    paintCodeBlockMark(codeEl, id, type);

    const newAnnotation: Annotation = {
      id,
      blockId,
      startOffset: 0,
      endOffset: codeText.length,
      type,
      text,
      originalText: codeText,
      createdA: Date.now(),
      images,
    };

    onAddAnnotationRef.current(newAnnotation);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Live annotation list for the imperative DOM paths below, which run outside
  // React's render (highlight swaps, the imperative handle).
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  // `removeHighlight` runs BEFORE the host drops the annotation from state and
  // re-highlights the block on the way out, so for one tick `annotationsRef`
  // still lists an annotation whose mark is deliberately gone. Remember those
  // ids so the swap listener below never paints a removed annotation back in,
  // whichever tick that block's re-highlight lands in.
  const removedAnnotationIdsRef = useRef<Set<string>>(new Set());
  // Retire a tombstone as soon as the host's list agrees the annotation is
  // gone: the window it guards is only the tick between removeHighlight and
  // the state update, and keeping it would block a later restore that brings
  // the same annotation (same id) back from a draft.
  for (const id of removedAnnotationIdsRef.current) {
    if (!annotations.some((a) => a.id === id)) removedAnnotationIdsRef.current.delete(id);
  }

  // A highlight swap replaces a `<code>` element's children — that is how the
  // palette/mode change repaints tokens, and how the first async grammar
  // attach lands after load. It also destroys any annotation mark inside the
  // fence. Re-paint it here, SYNCHRONOUSLY after the write, so the block ends
  // up with both the new theme's tokens and its mark.
  //
  // Being driven by the swap is also what makes the restore race safe without
  // timing: a share/draft restore that painted before the swap is
  // re-established in the same task the swap ran in, and one that runs after
  // it finds the mark already present and leaves it alone.
  useEffect(() => onCodeHighlightSwap((codeEl) => {
    const container = containerRef.current;
    if (!container || !container.contains(codeEl)) return;
    // The swap always clears the element, so a surviving mark means this write
    // was not the one that owns this block's contents.
    if (codeEl.querySelector('[data-bind-id]')) return;

    const codeText = codeEl.textContent ?? '';
    if (!codeText) return;
    const blockId = codeEl.closest('[data-block-id]')?.getAttribute('data-block-id') ?? '';

    // Fenced code is annotated all-or-nothing, so this block's annotations are
    // exactly the ones whose originalText is its full text. Share-restored
    // annotations arrive with an empty blockId (it is filled in during restore),
    // so an unset blockId still counts. The last one wins, matching what
    // annotating the same block twice does.
    const owner = annotationsRef.current.filter((a) =>
      a.type !== AnnotationType.GLOBAL_COMMENT
      && a.originalText === codeText
      && (a.blockId === blockId || !a.blockId)
      && !removedAnnotationIdsRef.current.has(a.id)
      && !container.querySelector(`[data-bind-id="${a.id}"], [data-highlight-id="${a.id}"]`)
    ).at(-1);

    if (owner) paintCodeBlockMark(codeEl, owner.id, owner.type);
  }), []);

  // A code block taken whole (Tab while dragging) opens the comment popover on it.
  const handlePinpointCodeBlockClick = useCallback((blockId: string, element: HTMLElement) => {
    const block = blocks.find((candidate) => candidate.id === blockId);
    const codeEl = element.querySelector('code');
    if (!block || !codeEl) return;
    // Show comment popover anchored to the code block
    setViewerCommentPopover({
      anchorEl: element,
      contextText: (codeEl.textContent || '').slice(0, 80),
      selectedText: codeEl.textContent || '',
      codeBlock: { block, element },
    });
  }, [blocks]);

  const widening = useSelectionWidening({
    containerRef,
    enabled: !hookCommentPopover && !viewerCommentPopover,
    onSelectRange: highlightRange,
    onCodeBlockClick: handlePinpointCodeBlockClick,
  });

  // Suppress native context menu on touch devices (prevents cut/copy/paste overlay on mobile)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTouchDevice) return;

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      lastAutoScrolledHashRef.current = null;
      setLocationHash(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const scrollToAnchor = useCallback((hash: string) => {
    const anchor = decodeAnchorHash(hash);
    if (!anchor) return false;

    const container = containerRef.current;
    if (!container || !scrollViewport) return false;

    const target = document.getElementById(anchor);
    if (!target || !container.contains(target)) return false;

    const containerRect = getScrollViewportRect(scrollViewport);
    const targetRect = target.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top;
    const offsetPosition = getScrollViewportTop(scrollViewport) + relativeTop;

    scrollViewportTo(scrollViewport, {
      top: Math.max(0, offsetPosition),
      behavior: 'smooth',
    });
    return true;
  }, [scrollViewport]);

  useEffect(() => {
    if (!scrollViewport || !locationHash || lastAutoScrolledHashRef.current === locationHash) return;
    const timer = window.setTimeout(() => {
      if (scrollToAnchor(locationHash)) {
        lastAutoScrolledHashRef.current = locationHash;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [blocks, locationHash, scrollToAnchor, scrollViewport]);

  // Use the native copy event so clipboard writes are synchronous (Safari
  // rejects the async navigator.clipboard API outside the user-gesture window).
  // web-highlighter clears the DOM selection on mouseup, so the browser has
  // nothing to copy by the time Cmd+C fires — we inject the captured text here.
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const captured = hookCommentPopover?.selectedText;
      if (captured) {
        e.preventDefault();
        e.clipboardData?.setData('text/plain', captured);
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [hookCommentPopover]);

  const composerOpen = !!hookCommentPopover || !!viewerCommentPopover;
  const onComposerOpenRef = useRef(onComposerOpen);
  onComposerOpenRef.current = onComposerOpen;
  useEffect(() => {
    composerDirtyRef.current = false;
    if (composerOpen) onComposerOpenRef.current?.();
  }, [composerOpen, hookCommentPopover, viewerCommentPopover]);
  const onComposerOpenChangeRef = useRef(onComposerOpenChange);
  onComposerOpenChangeRef.current = onComposerOpenChange;
  useEffect(() => {
    onComposerOpenChangeRef.current?.(composerOpen);
  }, [composerOpen]);

  // Imperative handle — delegates to hook, extends removeHighlight for code blocks
  useImperativeHandle(ref, () => ({
    removeHighlight: (id: string) => {
      // The re-highlight below notifies the swap listener, which would happily
      // paint this annotation's mark straight back in — the host has not
      // dropped it from state yet. Tombstone the id first.
      removedAnnotationIdsRef.current.add(id);
      // Code block annotations need syntax re-highlighting after removal.
      // Must run BEFORE hookRemoveHighlight, which removes the <mark> elements.
      const manualHighlights = containerRef.current?.querySelectorAll(`[data-bind-id="${id}"]`);
      manualHighlights?.forEach(el => {
        const parent = el.parentNode;
        if (parent && parent.nodeName === 'CODE') {
          const codeEl = parent as HTMLElement;
          const plainText = el.textContent || '';
          el.remove();
          codeEl.textContent = plainText;
          const block = blocks.find(b => b.id === codeEl.closest('[data-block-id]')?.getAttribute('data-block-id'));
          codeEl.className = codeBlockClassName(block?.language);
          // Language-less fences stay plain (#1212) — applyHighlight never guesses.
          applyHighlight(codeEl, plainText, block?.language, fenceThemeRef.current);
        }
      });

      hookRemoveHighlight(id);
    },
    clearAllHighlights,
    applyAnnotations,
    closeComposer: () => {
      if (composerDirtyRef.current) return false;
      if (hookCommentPopover) hookCommentClose();
      setViewerCommentPopover(null);
      return true;
    },
  }), [hookRemoveHighlight, clearAllHighlights, applyAnnotations, blocks, hookCommentPopover, hookCommentClose]);

  // Viewer-specific comment popover handlers (code blocks)

  const handleViewerCommentSubmit = (text: string, images?: ImageAttachment[]) => {
    if (viewerCommentPopover?.codeBlock) {
      const codeEl = viewerCommentPopover.codeBlock.element.querySelector('code');
      if (codeEl) {
        applyCodeBlockAnnotation(viewerCommentPopover.codeBlock.block.id, codeEl, AnnotationType.COMMENT, text, images);
      }
    }

    setViewerCommentPopover(null);
  };

  const handleViewerCommentClose = useCallback(() => {
    setViewerCommentPopover(null);
  }, []);

  return (
    <div className="relative z-chrome w-full" style={maxWidth === null ? undefined : { maxWidth: maxWidth ?? 832 }}>
      <article
        ref={containerRef}
        data-annotation-root
        className="w-full bg-card rounded-xl py-5 md:py-8 lg:py-10 xl:py-12 relative"
        style={{
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
      >
        {(repoInfo || showDemoBadge) && (
          <div ref={docBadgesRef} className="absolute top-3 md:top-4 inset-x-0 flex items-start justify-between gap-3">
            <DocBadges
              repoInfo={repoInfo}
              showDemoBadge={showDemoBadge}
            />
          </div>
        )}

        {badgeClearance > 0 && <div style={{ height: badgeClearance }} aria-hidden="true" />}
        {frontmatter && <FrontmatterCard frontmatter={frontmatter} />}
        {!frontmatter && blocks.length > 0 && blocks[0].type !== 'heading' && <div className="mt-4" />}
        {groupBlocks(blocks).map(group =>
          group.type === 'list-group' ? (
            (() => {
              const indices = computeListIndices(group.blocks);
              return (
                <div key={group.key} data-pinpoint-group="list" className="py-1 -mx-2 px-2">
                  {group.blocks.map((block, i) => (
                    <BlockRenderer
                      imageBaseDir={imageBaseDir}
                      onImageClick={(src, alt) => setLightbox({ src, alt })}
                      key={block.id}
                      block={block}
                      orderedIndex={indices[i]}
                      onToggleCheckbox={onToggleCheckbox}
                      checkboxOverrides={checkboxOverrides}
                      headingAnchorId={headingSlugMap.get(block.id)}
                      onNavigateAnchor={scrollToAnchor}
                    />
                  ))}
                </div>
              );
            })()
          ) : group.block.type === 'code' && isMermaidLanguage(group.block.language) ? (
            <MermaidBlock key={group.block.id} block={group.block} />
          ) : group.block.type === 'table' ? (
            <TableBlock
              key={group.block.id}
              block={group.block}
              imageBaseDir={imageBaseDir}
              onImageClick={(src, alt) => setLightbox({ src, alt })}
              onNavigateAnchor={scrollToAnchor}
              onHover={(element) => {
                if (tableHoverTimeoutRef.current) {
                  clearTimeout(tableHoverTimeoutRef.current);
                  tableHoverTimeoutRef.current = null;
                }
                setIsTableToolbarExiting(false);
                if (!hookCommentPopover) {
                  setHoveredTable({ block: group.block, element });
                }
              }}
              onLeave={() => {
                tableHoverTimeoutRef.current = setTimeout(() => {
                  setIsTableToolbarExiting(true);
                  setTimeout(() => {
                    setHoveredTable(null);
                    setIsTableToolbarExiting(false);
                  }, 150);
                }, 100);
              }}
            />
          ) : group.block.type === 'code' ? (
            <CodeBlock key={group.block.id} block={group.block} />
          ) : (
            <BlockRenderer imageBaseDir={imageBaseDir} onImageClick={(src, alt) => setLightbox({ src, alt })} key={group.block.id} block={group.block} onNavigateAnchor={scrollToAnchor} onToggleCheckbox={onToggleCheckbox} checkboxOverrides={checkboxOverrides} headingAnchorId={headingSlugMap.get(group.block.id)} />
          )
        )}

        {/* Table hover toolbar */}
        {hoveredTable && !hookCommentPopover && (
          <TableToolbar
            element={hoveredTable.element}
            markdown={hoveredTable.block.content}
            isExiting={isTableToolbarExiting}
            onMouseEnter={() => {
              if (tableHoverTimeoutRef.current) {
                clearTimeout(tableHoverTimeoutRef.current);
                tableHoverTimeoutRef.current = null;
              }
              setIsTableToolbarExiting(false);
            }}
            onMouseLeave={() => {
              tableHoverTimeoutRef.current = setTimeout(() => {
                setIsTableToolbarExiting(true);
                setTimeout(() => {
                  setHoveredTable(null);
                  setIsTableToolbarExiting(false);
                }, 150);
              }, 100);
            }}
          />
        )}

        {/* Tab selection: the blocks release would take, and the Tab hint by the pointer */}
        <BlockOutline blocks={widening.blocks} containerRef={containerRef} />
        {widening.hint && <TabHint mode={widening.hint} pointer={widening.pointer} />}

        {/* Comment popover — hook handles text selection, Viewer handles code blocks */}
        {hookCommentPopover && (
            <CommentPopover
              anchorEl={hookCommentPopover.anchorEl}
              contextText={hookCommentPopover.contextText}
              copyText={hookCommentPopover.selectedText}
              isGlobal={false}
              initialText={hookCommentPopover.initialText}
              onSubmit={hookCommentSubmit}
              onClose={hookCommentClose}
              onDraftChange={handleComposerDraftChange}
              quickLabels={quickLabels}
              onQuickLabel={hookCommentQuickLabel}
              onAsk={onAskSideQuestion && ((question) => {
                onAskSideQuestion(question, hookCommentPopover.selectedText ?? hookCommentPopover.contextText);
                hookCommentClose();
              })}
            />
          )}
        {viewerCommentPopover && (
          <CommentPopover
            anchorEl={viewerCommentPopover.anchorEl}
            contextText={viewerCommentPopover.contextText}
            isGlobal={false}
            initialText={viewerCommentPopover.initialText}
            onSubmit={handleViewerCommentSubmit}
            onClose={handleViewerCommentClose}
            onDraftChange={handleComposerDraftChange}
            onAsk={onAskSideQuestion && ((question) => {
              onAskSideQuestion(question, viewerCommentPopover.selectedText ?? viewerCommentPopover.contextText);
              handleViewerCommentClose();
            })}
          />
        )}

      </article>

      {/* Image lightbox */}
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
});

