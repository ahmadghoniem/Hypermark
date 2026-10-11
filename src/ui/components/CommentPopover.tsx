import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ImageAttachment } from '../types';
import { CommentAttachStack } from './CommentAttachStack';
import { imageFilesFrom, useAttachmentUploads } from '../hooks/useAttachmentUploads';
import { useDraggable } from '../hooks/useDraggable';
import { hasUnsavedCommentContent } from '../utils/commentContent';
import {
  useVisibleViewportBounds,
  type VisibleViewportBounds,
} from '../hooks/useViewportEnvironment';
import type { QuickLabel } from '../utils/quickLabels';
import { ComposerQuickLabels } from './ComposerQuickLabels';
import { copyTextToClipboard } from '../utils/clipboard';
import { QuoteText } from './QuoteText';

import { ChevronDown, ChevronUp, CornerDownRight } from '@untitledui/icons';
interface CommentPopoverProps {
  /** Element to anchor the popover near (re-reads position on scroll) */
  anchorEl?: HTMLElement;
  /** Static viewport rect to anchor near when no stable DOM element exists */
  anchorRect?: DOMRect;
  /** Truncated selected text shown in header, or empty for global */
  contextText: string;
  /** Full highlighted text. Ctrl/Cmd+C copies it while nothing is selected in the text field. */
  copyText?: string;
  /** Whether this is a global comment */
  isGlobal: boolean;
  /** Pre-filled text (for type-to-comment) */
  initialText?: string;
  /** Pre-filled attachments (editing an existing annotation). A saved draft wins. */
  initialImages?: ImageAttachment[];
  /** Called on submit with comment text and optional images */
  onSubmit: (text: string, images?: ImageAttachment[]) => void;
  /** Label chips floating above an anchored composer. A click saves a comment
   *  with that label; the host creates the annotation and closes the composer.
   *  Ignored for global comments. */
  quickLabels?: readonly QuickLabel[];
  onQuickLabel?: (label: QuickLabel) => void;
  /** Optional live draft observer for submit paths outside the popover. */
  onDraftChange?: (text: string, images?: ImageAttachment[]) => void;
  /** Called when popover is closed/cancelled */
  onClose: () => void;
  /** Whether submitting empty text is allowed, for editors that support clearing. */
  allowEmptySubmit?: boolean;
}

const MAX_POPOVER_WIDTH = 344;
const GAP = 8;

// The quick-label row sits at the foot of the text field.
const CHIP_HEIGHT = 20;
const CHIP_GAP = 4;
/** The text area's own floor — the same 56px the old `min-h-14` gave it. An
 *  empty composer is exactly as tall as one being written in, so opening it,
 *  typing the first character and clearing it again never resize anything. */
const TEXT_MIN_HEIGHT = 56;

interface CommentPopoverPosition {
  top: number;
  left: number;
  flipAbove: boolean;
  width: number;
  maxHeight: number;
  requiresExpanded: boolean;
}

export function computeCommentPopoverPosition(
  anchorRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>,
  bounds: VisibleViewportBounds,
): CommentPopoverPosition {
  const spaceBelow = Math.max(0, bounds.bottom - anchorRect.bottom - GAP);
  const spaceAbove = Math.max(0, anchorRect.top - bounds.top - GAP);
  const flipAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
  const width = Math.min(MAX_POPOVER_WIDTH, bounds.width);

  const top = flipAbove
    ? anchorRect.top - GAP
    : anchorRect.bottom + GAP;

  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  left = Math.max(bounds.left, Math.min(left, bounds.right - width));
  const maxHeight = flipAbove ? spaceAbove : spaceBelow;

  return {
    top,
    left,
    flipAbove,
    width,
    maxHeight,
    requiresExpanded: maxHeight < 280,
  };
}

export const CommentPopover: React.FC<CommentPopoverProps> = ({
  anchorEl,
  anchorRect,
  contextText,
  copyText,
  isGlobal,
  initialText = '',
  initialImages,
  onSubmit,
  quickLabels,
  onQuickLabel,
  onDraftChange,
  onClose,
  allowEmptySubmit = false,
}) => {
  const visibleBounds = useVisibleViewportBounds(16);
  const baseWidth = Math.min(MAX_POPOVER_WIDTH, visibleBounds.width);
  const textMinHeight = TEXT_MIN_HEIGHT;
  const fieldMinHeight = TEXT_MIN_HEIGHT + CHIP_HEIGHT + CHIP_GAP;
  // Dialog mode only when the anchor has no room for a popover.
  const [mode, setMode] = useState<'popover' | 'dialog'>('popover');
  // Read at reset time only: a fresh array identity per render must not re-run the reset.
  const initialImagesRef = useRef(initialImages);
  initialImagesRef.current = initialImages;
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<ImageAttachment[]>(initialImages ?? []);
  const [position, setPosition] = useState<CommentPopoverPosition | null>(null);
  // Bumped on each copy to restart the quote's copy signal; 0 when idle.
  const [copyFlash, setCopyFlash] = useState(0);
  const copyQuote = useCallback(() => {
    if (!copyText) return;
    void copyTextToClipboard(copyText).then((ok) => {
      if (ok) setCopyFlash((n) => n + 1);
    });
  }, [copyText]);
  // Direction of an open popover that has scrolled out of view, or null when on-screen.
  const [offscreen, setOffscreen] = useState<'above' | 'below' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // A selected image lands in a strip inside this composer, not
  // in the picker's own popover (which closes on selection) and never in the
  // document-level global attachments.
  const addImage = useCallback((image: ImageAttachment) => {
    setImages((prev) => [...prev, image]);
  }, []);
  const removeImage = useCallback((path: string) => {
    setImages((prev) => prev.filter((i) => i.path !== path));
  }, []);
  const uploads = useAttachmentUploads({ images, onAdd: addImage, enabled: true });
  const { attachFiles } = uploads;

  // Paste anywhere in the open composer attaches to *this* comment. Capture
  // phase + stopPropagation keeps the document-level handler in the host app
  // (which files pastes under globalAttachments) from seeing the same event.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null;
      if (!target || !popoverRef.current?.contains(target)) return;
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      attachFiles(files);
    };
    document.addEventListener('paste', handlePaste, true);
    return () => document.removeEventListener('paste', handlePaste, true);
  }, [attachFiles]);

  const composerDropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const files = imageFilesFrom(e.dataTransfer);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      attachFiles(files);
    },
  };

  const hasUnsavedContent = hasUnsavedCommentContent(text, images);

  const showQuickLabels = !isGlobal && !!onQuickLabel && (quickLabels?.length ?? 0) > 0;


  const hasUnsavedContentRef = useRef(hasUnsavedContent);
  hasUnsavedContentRef.current = hasUnsavedContent;
  const { dragPosition, dragHandleProps, wasDragged, reset: resetDrag } = useDraggable(popoverRef);
  const openingFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined'
      && document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      && document.activeElement !== document.documentElement
      ? document.activeElement
      : anchorEl ?? null,
  );

  useEffect(() => {
    setText(initialText);
    setImages(initialImagesRef.current ?? []);
  }, [initialText]);

  // Closing the composer discards its text; this adds the browser's
  // "Leave site?" prompt while it holds unsent input.
  const hasUnsentInput = text.trim().length > 0 || images.length > 0;
  useEffect(() => {
    if (!hasUnsentInput) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsentInput]);

  useEffect(() => {
    onDraftChange?.(text, images);
  }, [images, onDraftChange, text]);

  // Reset drag when anchor changes (new annotation) or mode switches
  useEffect(() => { resetDrag(); }, [anchorEl, anchorRect, resetDrag]);
  useEffect(() => { if (mode === 'popover') resetDrag(); }, [mode, resetDrag]);

  // Track anchor position on scroll and observed viewport changes (popover
  // mode only, not after user drag).
  useEffect(() => {
    if (mode !== 'popover' || wasDragged) return;

    const update = () => {
      const rect = anchorEl?.getBoundingClientRect() ?? anchorRect;
      if (!rect) return;
      const nextPosition = computeCommentPopoverPosition(rect, visibleBounds);
      if (nextPosition.requiresExpanded) {
        setMode('dialog');
        return;
      }
      setPosition(nextPosition);
    };

    update();
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl, anchorRect, mode, visibleBounds, wasDragged]);

  // Surface a "jump back" arrow when an open popover scrolls out of view.
  // Re-measures whenever the popover repositions (position updates every scroll
  // step in tracked mode) so the indicator is accurate at rest, plus on resize.
  useEffect(() => {
    if (mode !== 'popover') { setOffscreen(null); return; }
    const measure = () => {
      const el = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < visibleBounds.top) setOffscreen('above');
      else if (rect.top > visibleBounds.bottom) setOffscreen('below');
      else setOffscreen(null);
    };
    measure();
  }, [position, dragPosition, mode, visibleBounds]);

  const scrollToPopover = useCallback(() => {
    anchorEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [anchorEl]);

  // Focus the textarea when it mounts (initial open and popover/dialog switches).
  // A ref callback rather than a mount effect: in popover mode the textarea only
  // renders after `position` is measured, and WebKit fires 0ms timers ahead of
  // that commit, so an effect keyed on mode alone can run before the textarea
  // exists and never focus it (e.g. in WKWebView hosts like Glimpse).
  const shouldAutoFocus = true;
  const focusOnMountRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (!el || !shouldAutoFocus) return;
    setTimeout(() => {
      if (!el.isConnected) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }, 0);
  }, [shouldAutoFocus]);

  // A touch-opened composer deliberately does not focus the textarea (and
  // summon the software keyboard), but hardware-keyboard users still need a
  // coherent focus target and Escape dismissal.
  useEffect(() => {
    if (mode !== 'dialog' || shouldAutoFocus) return;
    const timer = setTimeout(() => {
      if (!popoverRef.current?.isConnected) return;
      popoverRef.current.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [mode, shouldAutoFocus]);

  const restoreOpeningFocus = useCallback(() => {
    const target = openingFocusRef.current;
    requestAnimationFrame(() => {
      if (!target?.isConnected) return;
      target.focus({ preventScroll: true });
    });
  }, []);

  const handleClose = useCallback(
    (focusDisposition: 'restore-opener' | 'preserve-pointer-target' = 'restore-opener') => {
      onClose();
      if (focusDisposition === 'restore-opener') restoreOpeningFocus();
    },
    [onClose, restoreOpeningFocus],
  );

  // Click-outside for popover mode
  useEffect(() => {
    if (mode !== 'popover') return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // Don't close if clicking inside a child portal
      const el = target as HTMLElement;
      if (el.closest?.('[data-popover-layer]')) return;
      if (hasUnsavedContentRef.current) return;
      handleClose('preserve-pointer-target');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [handleClose, mode]);

  const handleSubmit = useCallback(() => {
    const canSubmitEmpty = allowEmptySubmit && initialText.trim().length > 0;
    if (hasUnsavedContent || canSubmitEmpty) {
      onSubmit(text, images.length > 0 ? images : undefined);
      restoreOpeningFocus();
    }
  }, [text, images, onSubmit, allowEmptySubmit, initialText, hasUnsavedContent, restoreOpeningFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleClose();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    // Focus moves into the composer as soon as the highlight is made, so the
    // page selection is gone; Ctrl/Cmd+C copies the highlighted text instead.
    // `code` matches the physical C key, so non-Latin layouts work too.
    const field = e.currentTarget;
    if (
      copyText &&
      (e.code === 'KeyC' || e.key.toLowerCase() === 'c') &&
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      field.selectionStart === field.selectionEnd
    ) {
      e.preventDefault();
      copyQuote();
    }
  };

  const headerLabel = isGlobal
    ? 'Global Comment'
    : contextText
      ? `"${contextText.length > 50 ? contextText.slice(0, 50) + '...' : contextText}"`
      : 'Comment';

  const canSubmit =
    hasUnsavedContent ||
    (allowEmptySubmit && initialText.trim().length > 0);

  const maxAllowedHeight = dragPosition ? visibleBounds.height : position?.maxHeight;
  const popoverMaxHeightStyle = maxAllowedHeight != null ? `calc(${maxAllowedHeight}px - 8rem)` : undefined;

  const composerCard = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[13px] bg-muted/40">
      {/* Top strip - anchor mark and the quoted text. Draggable by the strip in
          popover mode. Not rendered for global comments. The composer closes
          with Escape, a click outside while empty, or by adding the comment.
          Ctrl/Cmd+C with nothing selected in the field copies the highlighted
          text, and the quote animates to confirm it. */}
      {!isGlobal && (
        <div
          className="flex min-h-7 items-center gap-2 rounded-t-[13px] px-3 py-1"
          {...(mode === 'popover' ? dragHandleProps : {})}
        >
          <span className="flex shrink-0 text-primary" aria-hidden="true">
            <AnchorIcon size={12} />
          </span>
          <QuoteText
            flash={copyFlash}
            onDone={() => setCopyFlash(0)}
            className="flex-1 text-micro/snug text-muted-foreground"
          >
            {headerLabel}
          </QuoteText>
        </div>
      )}

      {/* Body - the inner tier. A card in its own right: fully rounded, its own
          hairline, its own near shadow. */}
      <div className="flex min-h-0 flex-col rounded-[13px] border border-border/50 bg-popover shadow-[0_1px_1px_rgb(0_0_0/0.16),0_2px_4px_-2px_rgb(0_0_0/0.3)]">

        {/* Textarea. */}
        <div className="relative px-3.25 pb-0.5 pt-2.5" {...composerDropProps}>
          <div
            className="flex flex-col justify-between"
            style={mode === 'dialog' ? undefined : { minHeight: fieldMinHeight }}
          >
            <ComposerTextarea
              textareaRef={focusOnMountRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isGlobal ? "What's your feedback overall?" : "What's your feedback?"}
              sizeClassName={
                mode === 'dialog'
                  ? 'min-h-64 max-h-full text-[12.5px] leading-[1.45]'
                  : 'max-h-64 text-[12.5px] leading-[1.45]'
              }
              minHeightPx={mode === 'popover' ? textMinHeight : null}
              maxHeight={
                mode === 'dialog'
                  ? `calc(${visibleBounds.height}px - 10rem)`
                  : popoverMaxHeightStyle
              }
            />
            {showQuickLabels && quickLabels && onQuickLabel && (
              <ComposerQuickLabels
                labels={quickLabels}
                onSelect={onQuickLabel}
                hidden={hasUnsavedContent}
                chipHeight={CHIP_HEIGHT}
                gap={CHIP_GAP}
                fade={36}
              />
            )}
          </div>
        </div>

        {/* Action row. Attachments on the left, Save on the right.
            Save sets the row's height, so attaching never moves it. */}
        <div className="flex items-center justify-between gap-3 pl-2.5 pr-2 pb-1.75 pt-1.5">
          <div className="flex min-w-0 items-center gap-0.5">
            <CommentAttachStack
              images={images}
              pending={uploads.pending}
              onFiles={attachFiles}
              onRemove={removeImage}
              onRemovePending={uploads.removePending}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 px-2.75 py-1.25 text-micro"
            >
              {isGlobal ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (mode === 'dialog') {
    return createPortal(
      <div
        data-comment-popover="true"
        className="pn-visible-viewport-overlay z-popover flex items-center justify-center"
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Dismiss comment"
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={() => handleClose()}
        />

        <div className="relative flex max-h-full min-h-0">
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            aria-label={isGlobal ? 'Global comment' : 'Comment'}
            tabIndex={-1}
            className="relative w-[min(720px,calc(100vw-2rem))] max-h-full min-h-0 bg-popover border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              animation: 'comment-dialog-in 0.15s ease-out',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              e.stopPropagation();
              handleClose();
            }}
          >
            <style>{`
              @keyframes comment-dialog-in {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
            `}</style>
            {composerCard}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Popover mode
  if (!position) return null;

  const currentWidth = baseWidth;
  // position.left centres MAX_POPOVER_WIDTH on the anchor; re-centre for the
  // actual width.
  const centredLeft = Math.max(
    visibleBounds.left,
    Math.min(position.left + (position.width - baseWidth) / 2, visibleBounds.right - baseWidth),
  );
  const currentLeft = dragPosition ? dragPosition.left : centredLeft;

  return createPortal(
    <>
      {offscreen && (
        <button
          type="button"
          data-popover-layer="true"
          onClick={scrollToPopover}
          title="Scroll back to your open comment"
          className={`fixed left-1/2 -translate-x-1/2 z-popover-hint flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-popover border border-border shadow-lg text-caption text-muted-foreground hover:text-foreground transition-colors ${offscreen === 'above' ? 'top-3' : 'bottom-3'}`}
        >
          {offscreen === 'above' ? <ChevronUpIcon /> : <ChevronDownIcon />}
          <span>Open comment</span>
        </button>
      )}
      <div
        ref={popoverRef}
        data-comment-popover="true"
        className="fixed z-popover bg-card border border-border rounded-xl shadow-[0_1px_2px_rgb(0_0_0/0.18),0_25px_50px_-12px_rgb(0_0_0/0.5)] flex flex-col"
        style={dragPosition
          ? {
              top: dragPosition.top,
              left: currentLeft,
              width: currentWidth,
            }
          : {
              top: position.top,
              left: currentLeft,
              width: currentWidth,
              ...(position.flipAbove ? { transform: 'translateY(-100%)' } : {}),
              animation: position.flipAbove
                ? 'comment-popover-in-above 0.15s ease-out'
                : 'comment-popover-in 0.15s ease-out',
            }
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes comment-popover-in {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes comment-popover-in-above {
            from { opacity: 0; transform: translateY(-100%) translateY(8px); }
            to { opacity: 1; transform: translateY(-100%); }
          }
        `}</style>

        {composerCard}
      </div>
    </>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// Composer textarea
// ---------------------------------------------------------------------------

const COMPOSER_TEXT_CLASSES = 'w-full bg-transparent px-1 py-0.5';

interface ComposerTextareaProps {
  /** Floor for the content-sized box, so an empty composer is as tall as one
   *  being written in. */
  minHeightPx?: number | null;
  /** Explicit max-height from positioning constraints. */
  maxHeight?: string | number | null;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  /** Mode-specific min/max height classes. */
  sizeClassName: string;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}

const ComposerTextarea: React.FC<ComposerTextareaProps> = ({
  minHeightPx = null,
  maxHeight = null,
  value,
  onChange,
  onKeyDown,
  placeholder,
  sizeClassName,
  textareaRef,
}) => {
  const boxStyle = {
    fieldSizing: 'content',
    ...(minHeightPx != null ? { minHeight: minHeightPx } : {}),
    ...(maxHeight != null ? { maxHeight } : {}),
  } as React.CSSProperties;

  return (
    <textarea
      data-pn-mobile-editable="true"
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`${COMPOSER_TEXT_CLASSES} placeholder:text-muted-foreground resize-none focus:outline-none overflow-y-auto ${sizeClassName}`}
      style={boxStyle}
    />
  );
};

// Icons

const ChevronUpIcon = () => (
  <ChevronUp className="size-3.5" />
);

const ChevronDownIcon = () => (
  <ChevronDown className="size-3.5" />
);

/** Corner-down-right arrow: "this points at that". Not a quotation mark -
 *  the strip holds a place in a file, and a place is not a quote. */
const AnchorIcon: React.FC<{ size: number }> = ({ size }) => (
  <CornerDownRight style={{ width: size, height: size }} />
);
