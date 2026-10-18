import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ImageAttachment } from '../types';
import { ArrowUp, ChevronDown, ChevronUp, CornerDownLeft } from '@untitledui/icons';
import { CommentAttachButton, CommentAttachStack, COMPOSER_TOOLTIP } from './CommentAttachStack';
import { Button } from '../fluid/components/button';
import { Tooltip } from '../fluid/components/tooltip';
import { imageFilesFrom, useAttachmentUploads } from '../hooks/useAttachmentUploads';
import { useDraggable } from '../hooks/useDraggable';
import { hasUnsavedCommentContent } from '../utils/commentContent';
import {
  useVisibleViewportBounds,
  type VisibleViewportBounds,
} from '../hooks/useViewportEnvironment';
import type { QuickLabel } from '../utils/quickLabels';
import { ComposerGhostCompletion, suggestionFor } from './ComposerQuickLabels';
import { copyTextToClipboard } from '../utils/clipboard';
import { QuoteText } from './QuoteText';
import { AutoGrowBox } from './AutoGrowBox';
import { ModShortcut } from './ModShortcut';

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
  /** Labels the field offers as a ghost Tab completion on an anchored
   *  comment: a new one, or one being edited once its text is cleared.
   *  Sending text that is exactly a label calls `onQuickLabel`, and the host
   *  saves the label and closes the composer. Ignored for global comments. */
  quickLabels?: readonly QuickLabel[];
  onQuickLabel?: (label: QuickLabel) => void;
  /** Turns on `/btw`: typing `/` completes to `/btw `, and sending text that
   *  starts with it (or Alt+Enter) calls this with the question and clears the
   *  field instead of adding a comment. */
  onAsk?: (question: string) => void;
  /** Optional live draft observer for submit paths outside the popover. */
  onDraftChange?: (text: string, images?: ImageAttachment[]) => void;
  /** Called when popover is closed/cancelled */
  onClose: () => void;
  /** Whether submitting empty text is allowed, for editors that support clearing. */
  allowEmptySubmit?: boolean;
}

const highlightIdOf = (el: Element | null | undefined): string | null => {
  const mark = el?.closest?.('.annotation-highlight, [data-bind-id], [data-annotation-id]');
  return mark?.getAttribute('data-highlight-id')
    ?? mark?.getAttribute('data-bind-id')
    ?? mark?.getAttribute('data-annotation-id')
    ?? null;
};

const MAX_POPOVER_WIDTH = 344;
const GAP = 8;
// The composer wants this much height on the side of the anchor it opens on.
const MIN_POPOVER_SPACE = 280;

const TEXT = 'text-body/normal';

interface CommentPopoverPosition {
  top: number;
  left: number;
  flipAbove: boolean;
  width: number;
  maxHeight: number;
}

export function computeCommentPopoverPosition(
  anchorRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>,
  bounds: VisibleViewportBounds,
): CommentPopoverPosition {
  const spaceBelow = Math.max(0, bounds.bottom - anchorRect.bottom - GAP);
  const spaceAbove = Math.max(0, anchorRect.top - bounds.top - GAP);
  const flipAbove = spaceBelow < MIN_POPOVER_SPACE && spaceAbove > spaceBelow;
  const width = Math.min(MAX_POPOVER_WIDTH, bounds.width);

  let top = flipAbove
    ? anchorRect.top - GAP
    : anchorRect.bottom + GAP;

  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  left = Math.max(bounds.left, Math.min(left, bounds.right - width));
  let maxHeight = flipAbove ? spaceAbove : spaceBelow;

  // Neither side has room (a highlight taller than the window, or a short
  // window): the composer overlaps the anchor at that edge of the window.
  const minHeight = Math.min(MIN_POPOVER_SPACE, bounds.height);
  if (maxHeight < minHeight) {
    top = flipAbove ? bounds.top + minHeight : bounds.bottom - minHeight;
    maxHeight = minHeight;
  }

  return {
    top,
    left,
    flipAbove,
    width,
    maxHeight,
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
  onAsk,
  onDraftChange,
  onClose,
  allowEmptySubmit = false,
}) => {
  const visibleBounds = useVisibleViewportBounds(16);
  const baseWidth = Math.min(MAX_POPOVER_WIDTH, visibleBounds.width);
  // Read at reset time only: a fresh array identity per render must not re-run the reset.
  const initialImagesRef = useRef(initialImages);
  initialImagesRef.current = initialImages;
  const [text, setText] = useState(initialText);
  // An edit offers the labels once its text has been cleared, and keeps
  // offering them while a label is typed over it.
  const [cleared, setCleared] = useState(initialText.trim().length === 0);
  const [images, setImages] = useState<ImageAttachment[]>(initialImages ?? []);
  const [position, setPosition] = useState<CommentPopoverPosition | null>(null);
  // Bumped on each copy to restart the quote's copy signal; 0 when idle.
  const [copyFlash, setCopyFlash] = useState(0);
  // The ghost completion only shows while the caret is at the end of the text.
  const [caretAtEnd, setCaretAtEnd] = useState(true);
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

  const showQuickLabels = !isGlobal && !!onQuickLabel && (quickLabels?.length ?? 0) > 0 && cleared;
  const trimmedText = text.trim();
  const btw = !!onAsk && /^\/btw(\s|$)/i.test(trimmedText);
  // The command at the start of the field, drawn in the accent color.
  const command = onAsk ? /^(\s*)(\/btw)(?=\s|$)/i.exec(text) : null;
  const [fieldScroll, setFieldScroll] = useState(0);
  // "/" completes to the side-question command the way text completes to a label.
  const completions = onAsk && text.startsWith('/')
    ? ['/btw ']
    : showQuickLabels && quickLabels ? quickLabels.map((l) => l.text) : [];
  const suggestion = caretAtEnd ? suggestionFor(text, completions) : null;
  const trackCaret = (el: HTMLTextAreaElement) =>
    setCaretAtEnd(el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length);

  // Editing: only a change from the saved comment counts as unsaved, and a
  // cleared one doesn't, since the host deletes the annotation on close.
  const savedImages = initialImagesRef.current ?? [];
  const isDirty = initialText.trim()
    ? hasUnsavedContent && (text !== initialText
      || images.length !== savedImages.length
      || images.some((image, i) => image.path !== savedImages[i]?.path))
    : hasUnsavedContent;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const { dragPosition, dragHandleProps, wasDragged, reset: resetDrag } = useDraggable(popoverRef);
  const openingFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined'
      && document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      && document.activeElement !== document.documentElement
      ? document.activeElement
      : anchorEl ?? null,
  );
  // A button clicked with the pointer (the panel's +, a card's edit button)
  // takes focus without a focus ring. Focusing it again after a keyboard send
  // would show the ring and its tooltip, so focus goes back only to an opener
  // reached with the keyboard.
  const openerFocusVisibleRef = useRef(
    typeof document !== 'undefined' && openingFocusRef.current === document.activeElement
      ? openingFocusRef.current?.matches(':focus-visible') ?? false
      : true,
  );

  useEffect(() => {
    setText(initialText);
    setCleared(initialText.trim().length === 0);
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

  // Reset drag when anchor changes (new annotation)
  useEffect(() => { resetDrag(); }, [anchorEl, anchorRect, resetDrag]);

  // Track anchor position on scroll and observed viewport changes (not after
  // user drag).
  useEffect(() => {
    if (wasDragged) return;

    const update = () => {
      const rect = anchorEl?.getBoundingClientRect() ?? anchorRect;
      if (!rect) return;
      setPosition(computeCommentPopoverPosition(rect, visibleBounds));
    };

    update();
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl, anchorRect, visibleBounds, wasDragged]);

  // Surface a "jump back" arrow when an open popover scrolls out of view.
  // Re-measures whenever the popover repositions (position updates every scroll
  // step in tracked mode) so the indicator is accurate at rest, plus on resize.
  useEffect(() => {
    const measure = () => {
      const el = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < visibleBounds.top) setOffscreen('above');
      else if (rect.top > visibleBounds.bottom) setOffscreen('below');
      else setOffscreen(null);
    };
    measure();
  }, [position, dragPosition, visibleBounds]);

  const scrollToPopover = useCallback(() => {
    anchorEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [anchorEl]);

  // Focus the textarea when it mounts. A ref callback rather than a mount
  // effect: the textarea only renders after `position` is measured, and WebKit
  // fires 0ms timers ahead of that commit, so a mount effect can run before the
  // textarea exists and never focus it (e.g. in WKWebView hosts like Glimpse).
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

  const restoreOpeningFocus = useCallback(() => {
    const target = openingFocusRef.current;
    if (!openerFocusVisibleRef.current) return;
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

  // Click-outside. While the composer holds unsaved changes,
  // a press in the document (a new selection, a click on a highlight), on a
  // panel card, on a card's edit button or on the panel's `+` is refused: its mousedown, mouseup
  // and click are swallowed, so
  // no text is selected and no other composer opens, and the composer shakes and takes
  // the focus back. Other controls (buttons, the header) work as usual.
  useEffect(() => {
    let refusing = false;
    const refuse = () => {
      const el = popoverRef.current;
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.animate(
        reduce
          ? [{ outline: '2px solid var(--ring)' }, { outline: '2px solid transparent' }]
          : [{ translate: '0' }, { translate: '-6px' }, { translate: '5px' }, { translate: '-3px' }, { translate: '2px' }, { translate: '0' }],
        { duration: reduce ? 600 : 320, easing: 'ease-in-out' },
      );
      textareaRef.current?.focus({ preventScroll: true });
    };
    const swallow = (e: Event) => {
      if (!refusing) return;
      // On window, ahead of the document-level listeners (selection widening).
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'click') refusing = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      refusing = false;
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // Don't close if clicking inside a child portal
      const el = target as HTMLElement;
      if (el.closest?.('[data-popover-layer]')) return;
      if (isDirtyRef.current) {
        const card = el.closest?.('[data-annotation-id]');
        if (
          el.closest?.('[data-annotation-root]')
          || el.closest?.('[data-global-comment-add]')
          || (card && (!el.closest('button') || el.closest('[data-annotation-open]')))
        ) {
          refusing = true;
          refuse();
        }
        return;
      }
      // A click on the annotation the composer is anchored to (its highlight
      // or its panel card) is the host's to handle: it toggles the composer
      const anchorId = highlightIdOf(anchorEl);
      if (anchorId && highlightIdOf(el) === anchorId) return;
      handleClose('preserve-pointer-target');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('mousedown', swallow, true);
    window.addEventListener('mouseup', swallow, true);
    window.addEventListener('click', swallow, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('mousedown', swallow, true);
      window.removeEventListener('mouseup', swallow, true);
      window.removeEventListener('click', swallow, true);
    };
  }, [handleClose, anchorEl]);

  // Escape closes the composer after focus has left it, e.g. after a click in
  // the document. With focus inside, the field's own handler closes it; focus
  // in another field or dialog leaves Escape to that.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && popoverRef.current?.contains(active)) return;
      if (active?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-popover-layer]')) return;
      e.preventDefault();
      handleClose('preserve-pointer-target');
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleClose]);

  const ask = useCallback((question: string) => {
    if (!onAsk || question.length === 0) return;
    onAsk(question);
    setText('');
  }, [onAsk]);

  const handleSubmit = useCallback(() => {
    if (btw) {
      ask(trimmedText.slice(4).trim());
      return;
    }
    const canSubmitEmpty = allowEmptySubmit && initialText.trim().length > 0;
    if (hasUnsavedContent || canSubmitEmpty) {
      // Text that is exactly a quick label is saved as that label, the way
      // the old chips did.
      const label = showQuickLabels && images.length === 0
        ? quickLabels?.find((l) => l.text.toLowerCase() === trimmedText.toLowerCase())
        : undefined;
      if (label && onQuickLabel) onQuickLabel(label);
      else onSubmit(text, images.length > 0 ? images : undefined);
      restoreOpeningFocus();
    }
  }, [btw, ask, trimmedText, text, images, onSubmit, onQuickLabel, quickLabels, showQuickLabels, allowEmptySubmit, initialText, hasUnsavedContent, restoreOpeningFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleClose();
      return;
    }
    if (e.key === 'Enter' && e.altKey && onAsk && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(trimmedText.replace(/^\/btw\s*/i, ''));
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && suggestion) {
      e.preventDefault();
      setText(suggestion.label);
      setCaretAtEnd(true);
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

  const headerLabel = contextText || 'Comment';

  const canSubmit =
    hasUnsavedContent ||
    (allowEmptySubmit && initialText.trim().length > 0);

  const maxAllowedHeight = dragPosition ? visibleBounds.height : position?.maxHeight;
  const popoverMaxHeightStyle = maxAllowedHeight != null ? `calc(${maxAllowedHeight}px - 8rem)` : undefined;

  const sendLabel = btw
    ? 'Ask a side question'
    : initialText.trim().length > 0 ? 'Save comment' : 'Add comment';
  const SendIcon = btw ? ArrowUp : CornerDownLeft;

  // The text field and the image chips follow their content's height
  // smoothly: new lines, chips appearing or going. The action row sits below
  // that box and slides with it.
  const composerCard = (
    <div className="flex flex-col p-2" {...composerDropProps}>
      {/* Quote bar - the highlighted text. Draggable by the bar. Not
          rendered for global comments. The composer closes with
          Escape, a click outside while empty, or by adding the comment.
          Ctrl/Cmd+C with nothing selected in the field copies the highlighted
          text, and the quote animates to confirm it. */}
      {!isGlobal && (
        <div
          className="flex items-center gap-2 px-1.5 py-0.5"
          {...dragHandleProps}
        >
          <span aria-hidden="true" className="h-4 w-0.5 shrink-0 rounded-full bg-muted-foreground/35" />
          <QuoteText
            flash={copyFlash}
            onDone={() => setCopyFlash(0)}
            className="flex-1 text-caption text-muted-foreground"
          >
            {headerLabel}
          </QuoteText>
        </div>
      )}

      <AutoGrowBox value={text}>
        <div className={`flex min-h-0 flex-col px-1.5 ${isGlobal ? 'pt-0.5' : 'pt-2'}`}>
          <div className="relative">
            {command && (
              <ComposerCommandText
                text={text}
                lead={command[1]}
                command={command[2]}
                scrollTop={fieldScroll}
                textClassName={TEXT}
              />
            )}
            <ComposerTextarea
              textareaRef={focusOnMountRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim().length === 0) setCleared(true);
                trackCaret(e.target);
              }}
              onSelect={(e) => trackCaret(e.currentTarget)}
              onScroll={(e) => setFieldScroll(e.currentTarget.scrollTop)}
              onKeyDown={handleKeyDown}
              hideText={!!command}
              placeholder={completions.length > 0 ? undefined : isGlobal ? "What's your feedback overall?" : "What's your feedback?"}
              describedBy={suggestion ? SUGGESTION_ID : undefined}
              sizeClassName="min-h-10 max-h-64"
              maxHeight={popoverMaxHeightStyle}
            />
            {suggestion && (
              <ComposerGhostCompletion text={text} suggestion={suggestion} id={SUGGESTION_ID} textClassName={TEXT} />
            )}
          </div>
        </div>

        <CommentAttachStack
          images={images}
          pending={uploads.pending}
          onRemove={removeImage}
          onRemovePending={uploads.removePending}
        />
      </AutoGrowBox>

      {/* Action row. Attach on the left, send on the right. */}
      <div className="flex items-center justify-between pt-1.5">
        <CommentAttachButton onFiles={attachFiles} />
        <Tooltip
          side="top"
          className={COMPOSER_TOOLTIP}
          contentClassName="z-popover-hint"
          content={(
            <span className="flex items-center gap-2 whitespace-nowrap">
              {sendLabel}
              <ModShortcut keyName="Enter" />
            </span>
          )}
        >
          <Button variant="primary" size="icon-sm" aria-label={sendLabel} onClick={handleSubmit} disabled={!canSubmit}>
            {/* InputMessage's send glyph: 19px over icon-sm's 14px. */}
            <SendIcon size={19} className="size-4.75!" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );

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
        className="fixed z-popover bg-popover rounded-xl shadow-[var(--shadow-3),0_6px_18px_0_rgb(0_0_0/0.12)] flex flex-col"
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

const SUGGESTION_ID = 'comment-popover-suggestion';

interface ComposerTextareaProps {
  /** Explicit max-height from positioning constraints. */
  maxHeight?: string | number | null;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  /** Leaves only the caret and selection visible, for `ComposerCommandText` to draw the text. */
  hideText?: boolean;
  placeholder?: string;
  describedBy?: string;
  /** Mode-specific min/max height classes. */
  sizeClassName: string;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}

const ComposerTextarea: React.FC<ComposerTextareaProps> = ({
  maxHeight = null,
  value,
  onChange,
  onKeyDown,
  onSelect,
  onScroll,
  hideText = false,
  placeholder,
  describedBy,
  sizeClassName,
  textareaRef,
}) => {
  const boxStyle = {
    fieldSizing: 'content',
    ...(maxHeight != null ? { maxHeight } : {}),
  } as React.CSSProperties;

  return (
    <textarea
      data-pn-mobile-editable="true"
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onSelect={onSelect}
      onScroll={onScroll}
      placeholder={placeholder}
      aria-label="Comment"
      aria-describedby={describedBy}
      className={`relative block w-full bg-transparent placeholder:text-muted-foreground resize-none focus:outline-none overflow-y-auto ${hideText ? 'text-transparent caret-foreground' : ''} ${TEXT} ${sizeClassName}`}
      style={boxStyle}
    />
  );
};

/**
 * The field's text with a leading slash command in the accent color. It sits
 * behind the transparent text of the field, so it must use the same font,
 * padding and wrapping (`textClassName`), and follows the field's scroll.
 */
const ComposerCommandText: React.FC<{
  text: string;
  lead: string;
  command: string;
  scrollTop: number;
  textClassName: string;
}> = ({ text, lead, command, scrollTop, textClassName }) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className={`whitespace-pre-wrap wrap-break-word text-foreground ${textClassName}`} style={{ transform: `translateY(${-scrollTop}px)` }}>
      {lead}
      <span className="text-primary">{command}</span>
      {text.slice(lead.length + command.length)}
    </div>
  </div>
);

// Icons

const ChevronUpIcon = () => (
  <ChevronUp className="size-3.5" />
);

const ChevronDownIcon = () => (
  <ChevronDown className="size-3.5" />
);

