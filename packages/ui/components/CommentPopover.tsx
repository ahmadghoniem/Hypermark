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
import { isDialKitTarget } from '../utils/dialkit';

/** One selected target of a multi-target draft comment (HTML pinpoint multi-select). */
export interface CommentTargetChip {
  key: string;
  /** Semantic label (hover-label cascade), e.g. "Button" / "rowchip". */
  label?: string;
  /** Short text excerpt of the target element. */
  excerpt: string;
}

/** Composer-yield stage while the user is shift-selecting (see composerYield.ts). */
export type CommentPopoverYieldState = 'none' | 'near' | 'over';

interface CommentPopoverProps {
  /** Element to anchor the popover near (re-reads position on scroll) */
  anchorEl?: HTMLElement;
  /** Static viewport rect to anchor near when no stable DOM element exists */
  anchorRect?: DOMRect;
  /** Truncated selected text shown in header, or empty for global */
  contextText: string;
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
  /** Opt-in: persist text + images across close/reopen, keyed by this string. Cleared on submit. */
  draftKey?: string;
  /** Whether submitting empty text is allowed, for editors that support clearing. */
  allowEmptySubmit?: boolean;
  /** Opt-in (HTML multi-select): selected targets rendered as horizontally
   *  scrollable chips above the textarea. Absent → byte-identical composer. */
  targetChips?: CommentTargetChip[];
  /** Remove a chip's target while composing. */
  onRemoveTargetChip?: (key: string) => void;
  /** Chip hover — host flashes the corresponding element in the page. */
  onHoverTargetChip?: (key: string) => void;
  /** Opt-in: bump to return focus to the textarea (after a shift-click add/remove). */
  refocusToken?: number;
  /** Opt-in: while open, a window-level printable keydown that would otherwise
   *  go nowhere (focus on <body>) routes into the textarea, so the first
   *  keystroke after a shift-click is never lost. */
  captureStrayKeys?: boolean;
  /** Opt-in composer yield while shift-selecting: 'near' fades the composer,
   *  'over' makes it near-invisible and click-through. Undefined → no-op. */
  yieldState?: CommentPopoverYieldState;
}

const MAX_POPOVER_WIDTH = 344;
/** rounded-xl with --radius 10px: the card's outer corner radius. */
const CARD_RADIUS = 14;
/** Corner radius just inside the card's 1px border. Nested corners subtract their inset from it. */
const INNER_RADIUS = CARD_RADIUS - 1;
const GAP = 8;

// The quick-label row sits at the foot of the text field.
const CHIP_HEIGHT = 24;
const CHIP_GAP = 6;
/** The text area's own floor — the same 56px the old `min-h-14` gave it. An
 *  empty composer is exactly as tall as one being written in, so opening it,
 *  typing the first character and clearing it again never resize anything. */
const TEXT_MIN_HEIGHT = 56;

// Module-level draft store: survives popover unmount so reopening the same key restores in-progress text.
export interface ComposerDraftEntry {
  key: string;
  text: string;
  images: ImageAttachment[];
}

export type DraftStoreListener = (entry: ComposerDraftEntry | null) => void;

class DraftStore {
  private entries = new Map<string, { text: string; images: ImageAttachment[] }>();
  private listeners = new Set<DraftStoreListener>();

  get(key: string): { text: string; images: ImageAttachment[] } | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: { text: string; images: ImageAttachment[] }): void {
    this.entries.set(key, value);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  notify(entry: ComposerDraftEntry | null): void {
    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  subscribe(listener: DraftStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const draftStore = new DraftStore();

/** Mirrors the latest text + images into `draftStore[draftKey]` so they outlive popover unmount. No-op without a key. */
function useCommentDraftSync(draftKey: string | undefined, text: string, images: ImageAttachment[]) {
  useEffect(() => {
    if (!draftKey) return;
    if (hasUnsavedCommentContent(text, images)) {
      draftStore.set(draftKey, { text, images });
      draftStore.notify({ key: draftKey, text, images });
    } else {
      draftStore.delete(draftKey);
      draftStore.notify(null);
    }
  }, [draftKey, text, images]);
}

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
  isGlobal,
  initialText = '',
  initialImages,
  onSubmit,
  quickLabels,
  onQuickLabel,
  onDraftChange,
  onClose,
  draftKey,
  allowEmptySubmit = false,
  targetChips,
  onRemoveTargetChip,
  onHoverTargetChip,
  refocusToken,
  captureStrayKeys = false,
  yieldState,
}) => {
  const visibleBounds = useVisibleViewportBounds(16);
  const baseWidth = Math.min(MAX_POPOVER_WIDTH, visibleBounds.width);
  const textMinHeight = TEXT_MIN_HEIGHT;
  const fieldMinHeight = TEXT_MIN_HEIGHT + CHIP_HEIGHT + CHIP_GAP;
  const closeRadius = Math.max(2, INNER_RADIUS - 4);
  const [mode, setMode] = useState<'popover' | 'dialog'>('popover');
  // Dialog mode origin: the anchor simply has no room for a popover and the
  // geometry FORCED it.
  const [dialogIsForced, setDialogIsForced] = useState(false);
  const forcedDialog = dialogIsForced;
  // Read at reset time only: a fresh array identity per render must not re-run the reset.
  const initialImagesRef = useRef(initialImages);
  initialImagesRef.current = initialImages;
  const initialDraft = draftKey ? draftStore.get(draftKey) : undefined;
  const [text, setText] = useState(initialDraft?.text ?? initialText);
  const [images, setImages] = useState<ImageAttachment[]>(initialDraft?.images ?? initialImages ?? []);
  const [position, setPosition] = useState<CommentPopoverPosition | null>(null);
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
    const nextDraft = draftKey ? draftStore.get(draftKey) : undefined;
    setText(nextDraft?.text ?? initialText);
    setImages(nextDraft?.images ?? initialImagesRef.current ?? []);
  }, [draftKey, initialText]);

  useCommentDraftSync(draftKey, text, images);

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
        setDialogIsForced(true);
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

  // Arc grip: drag grows the composer right and into whichever direction the
  // card already grows - down from the anchor, or up when the card opened
  // above it. Double-click expands into the dialog. Height rides on the
  // textarea, width on the card. Null = class/position size.
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const [composerWidth, setComposerWidth] = useState<number | null>(null);

  const beginGripResize = useCallback((event: React.PointerEvent) => {
    // Left button only, and never let the strip's drag handler see it.
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startHeight = textareaRef.current?.getBoundingClientRect().height ?? 72;
    const cardRect = popoverRef.current?.getBoundingClientRect();
    const minWidth = baseWidth;
    const startWidth = composerWidth ?? minWidth;
    const maxWidth = Math.max(minWidth, Math.min(720, visibleBounds.right - (cardRect?.left ?? 0) - 16));
    // Flipped above the anchor the card is placed by its bottom edge, so it
    // grows upward and the grip is on the top-right: dragging up adds height.
    const growsUp = !!position?.flipAbove && !dragPosition;

    // A click is not a resize. Until the pointer has travelled past the
    // threshold nothing is pinned: a 1px twitch during a plain click used to
    // swap the textarea's content sizing for a fixed height and snap the empty
    // field up to the floor.
    let dragging = false;

    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const travel = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < 3 && Math.abs(travel) < 3) return;
        dragging = true;
      }
      const dy = growsUp ? -travel : travel;
      // Proportional: the card keeps the shape it started the drag with. Each
      // axis contributes its own travel as a fraction of that axis, and the
      // mean drives both — so a diagonal drag scales, and a drag along one
      // edge still moves the other axis, at half rate.
      const scale = 1 + (dx / startWidth + dy / startHeight) / 2;
      // Floored at one text line, which is what the field wrapper already
      // reserves for it — anything higher would jump on the first pixel.
      setComposerHeight(Math.max(textMinHeight, Math.min(480, Math.round(startHeight * scale))));
      setComposerWidth(Math.max(minWidth, Math.min(maxWidth, Math.round(startWidth * scale))));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }, [baseWidth, composerWidth, dragPosition, position?.flipAbove, textMinHeight, visibleBounds.right]);

  const expandFromGrip = useCallback(() => {
    setComposerHeight(null);
    setComposerWidth(null);
    setDialogIsForced(false);
    setMode('dialog');
  }, []);

  const collapseFromGrip = useCallback(() => {
    setDialogIsForced(false);
    setMode('popover');
  }, []);

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
      if (draftKey) {
        if (hasUnsavedCommentContent(text, images)) {
          draftStore.set(draftKey, { text, images: images });
        } else {
          draftStore.delete(draftKey);
          draftStore.notify(null);
        }
      }
      onClose();
      if (focusDisposition === 'restore-opener') restoreOpeningFocus();
    },
    [draftKey, images, onClose, restoreOpeningFocus, text],
  );

  // Click-outside for popover mode
  useEffect(() => {
    if (mode !== 'popover') return;
    const shiftSelectionActive = Boolean(targetChips?.length);

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // Don't close if clicking inside a child portal
      const el = target as HTMLElement;
      if (el.closest?.('[data-popover-layer]')) return;
      if (isDialKitTarget(e.target)) return;
      if (hasUnsavedContentRef.current) return;
      // A same-document multi-select target receives pointerdown before click.
      // Preserve the existing draft so the following Shift-click can extend
      // it instead of silently replacing it with a new one.
      if (shiftSelectionActive && e.shiftKey) return;
      handleClose('preserve-pointer-target');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [handleClose, mode, targetChips?.length]);

  // Focus choreography (multi-select): after a shift-click adds/removes a
  // target, focus returns to the textarea so typing continues uninterrupted.
  // Focus only — the caret stays wherever the user left it mid-edit.
  const refocusSeenRef = useRef(refocusToken);
  useEffect(() => {
    if (refocusToken === undefined || refocusToken === refocusSeenRef.current) return;
    refocusSeenRef.current = refocusToken;
    textareaRef.current?.focus();
  }, [refocusToken]);

  // First-keystroke guard: while the draft is open, a printable keydown that
  // lands nowhere (focus fell back to <body> after an iframe interaction)
  // routes into the textarea instead of vanishing. Runs in capture phase so
  // it claims the key before the app's shortcut dispatcher; the character
  // lands at the textarea's remembered caret. Note that preventDefault here
  // does not stop the dispatcher (it deliberately ignores defaultPrevented,
  // see shortcuts/runtime.ts) — this guard is only safe because the
  // plan-review scopes bind no bare printable single key. Any future single-
  // key binding on this surface must be reconciled with this handler.
  useEffect(() => {
    if (!captureStrayKeys) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!e.key || e.key.length !== 1) return;
      const target = e.target;
      const strayed =
        target === null
        || target === document.body
        || target === document.documentElement;
      if (!strayed) return;
      const el = textareaRef.current;
      if (!el || document.activeElement === el) return;
      e.preventDefault();
      const key = e.key;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      setText((prev) => prev.slice(0, start) + key + prev.slice(end));
      el.focus();
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 1;
      });
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [captureStrayKeys]);

  // Composer yield (multi-select): fade near the pointer, click-through over
  // it. Class-driven so prefers-reduced-motion can kill the transition.
  const yieldClass = yieldState === undefined
    ? ''
    : ` pn-composer-yieldable${yieldState === 'over' ? ' pn-composer-yield-over' : yieldState === 'near' ? ' pn-composer-yield-near' : ''}`;
  const yieldStyleBlock = yieldState === undefined ? null : (
    <style>{`
      .pn-composer-yieldable { transition: opacity 180ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .pn-composer-yieldable { transition: none; }
      }
      .pn-composer-yield-near { opacity: 0.4; }
      .pn-composer-yield-over { opacity: 0.05; pointer-events: none; }
    `}</style>
  );

  // Selected-target chips (multi-select): horizontally scrollable, primary
  // first; each removable while composing.
  const chipsRow = targetChips && targetChips.length > 0 ? (
    <div
      data-target-chips="true"
      className="flex items-center gap-1.5 px-3 pt-2 overflow-x-auto whitespace-nowrap"
    >
      {targetChips.map((chip, i) => (
        <span
          key={chip.key}
          data-target-chip={chip.key}
          data-target-chip-primary={i === 0 ? 'true' : undefined}
          onMouseEnter={() => onHoverTargetChip?.(chip.key)}
          className={`inline-flex items-center gap-1 shrink-0 max-w-45 rounded-full border px-2 py-0.5 text-3xs ${
            i === 0
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-border bg-muted/50 text-muted-foreground'
          }`}
        >
          <span className="font-semibold text-primary">{chip.label || 'Element'}</span>
          <span className="truncate">{chip.excerpt}</span>
          {onRemoveTargetChip && (
            <button
              type="button"
              data-target-chip-remove={chip.key}
              onClick={() => onRemoveTargetChip(chip.key)}
              title="Remove this target"
              className="shrink-0 rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </span>
      ))}
    </div>
  ) : null;

  const handleSubmit = useCallback(() => {
    const canSubmitEmpty = allowEmptySubmit && initialText.trim().length > 0;
    if (hasUnsavedContent || canSubmitEmpty) {
      if (draftKey) {
        draftStore.delete(draftKey);
        draftStore.notify(null);
      }
      onSubmit(text, images.length > 0 ? images : undefined);
      restoreOpeningFocus();
    }
  }, [text, images, onSubmit, draftKey, allowEmptySubmit, initialText, hasUnsavedContent, restoreOpeningFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (mode === 'dialog') {
        // Collapsing a forced dialog is geometrically impossible, so Escape
        // closes it (draft-preserving) instead of being swallowed by the
        // re-expand.
        if (forcedDialog) handleClose();
        else setMode('popover');
      } else {
        handleClose();
      }
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
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
      {/* Top strip - anchor mark, location, Close at the far right. Draggable by
          the strip in popover mode. Not rendered for global comments. The
          inset is the same on the top, bottom and right, and Close's radius is
          concentric with the corner it sits in. */}
      {!isGlobal && (
        <div
          className="flex items-center gap-2 rounded-t-[13px] pl-3"
          {...(mode === 'popover' ? dragHandleProps : {})}
          style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingRight: 4,
          }}
        >
          <span className="flex shrink-0 text-primary" aria-hidden="true">
            <AnchorIcon size={12} />
          </span>
          <span className="min-w-0 flex-1 truncate text-2xs/snug text-muted-foreground">
            {headerLabel}
          </span>
          {/* `relative z-2`: when the card opens above its anchor the arc grip
              is at this corner, and Close must stay on top of it. */}
          <button
            type="button"
            onClick={() => handleClose()}
            className="relative z-2 grid shrink-0 place-items-center p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            style={{ width: 20, height: 20, borderRadius: closeRadius }}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Body - the inner tier. A card in its own right: fully rounded, its own
          hairline, its own near shadow. */}
      <div className="flex min-h-0 flex-col rounded-[13px] border border-border/50 bg-popover shadow-[0_1px_1px_rgb(0_0_0/0.16),0_2px_4px_-2px_rgb(0_0_0/0.3)]">
        {chipsRow}

        {/* Textarea. The global composer has no strip, so its Close sits in this corner. */}
        <div className="relative px-3.25 pb-0.5 pt-2.5" {...composerDropProps}>
          {isGlobal && (
            <button
              type="button"
              onClick={() => handleClose()}
              className="absolute z-1 grid place-items-center p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={{
                // The body has its own 1px border, so inset − 1 puts this button
                // the same distance from the card edge as the strip's Close.
                top: 3,
                right: 3,
                width: 20,
                height: 20,
                borderRadius: closeRadius,
              }}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon size={12} />
            </button>
          )}
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
                  : composerHeight === null
                    ? 'max-h-64 text-[12.5px] leading-[1.45]'
                    : 'text-[12.5px] leading-[1.45]'
              }
              heightPx={mode === 'popover' ? composerHeight : null}
              minHeightPx={mode === 'popover' ? textMinHeight : null}
              // Keep text 4px clear of the global Close:
              // (inset − 1) + closeSize + 4 − 13px container padding.
              padRight={isGlobal ? 14 : undefined}
              maxHeight={
                mode === 'dialog'
                  ? `calc(${visibleBounds.height}px - 10rem)`
                  : composerHeight === null ? popoverMaxHeightStyle : undefined
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
              className="rounded-md bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 px-2.75 py-1.25 text-2xs"
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

        {/* Dialog card, plus the arc that collapses it back to the popover. The
            card clips its content, so the arc hangs off a wrapper instead. */}
        <div className="group/composer relative flex max-h-full min-h-0">
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
          {!forcedDialog && (
            <ArcGrip
              gap={4}
              stroke={2}
              span={60}
              edge={0}
              corner="bottom-right"
              title="Double-click to collapse"
              onDoubleClick={collapseFromGrip}
            />
          )}
        </div>
      </div>,
      document.body
    );
  }

  // Popover mode
  if (!position) return null;

  const currentWidth = composerWidth ?? baseWidth;
  // position.left centres MAX_POPOVER_WIDTH on the anchor; re-centre for the
  // dialled width. A resize keeps this left edge, so the card grows rightward.
  const centredLeft = Math.max(
    visibleBounds.left,
    Math.min(position.left + (position.width - baseWidth) / 2, visibleBounds.right - baseWidth),
  );
  const currentLeft = dragPosition ? dragPosition.left : centredLeft;
  // Placed by its bottom edge, so it grows upward: the grip moves with it.
  const growsUp = position.flipAbove && !dragPosition;

  return createPortal(
    <>
      {offscreen && (
        <button
          type="button"
          data-popover-layer="true"
          onClick={scrollToPopover}
          title="Scroll back to your open comment"
          className={`fixed left-1/2 -translate-x-1/2 z-popover-hint flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-popover border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors ${offscreen === 'above' ? 'top-3' : 'bottom-3'}`}
        >
          {offscreen === 'above' ? <ChevronUpIcon /> : <ChevronDownIcon />}
          <span>Open comment</span>
        </button>
      )}
      <div
        ref={popoverRef}
        data-comment-popover="true"
        className={`group/composer fixed z-popover bg-card border border-border rounded-xl shadow-[0_1px_2px_rgb(0_0_0/0.18),0_25px_50px_-12px_rgb(0_0_0/0.5)] flex flex-col${yieldClass}`}
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
        {yieldStyleBlock}

        {composerCard}

        {/* Arc grip on the corner the card grows from: bottom-right normally,
            top-right when the card opened above its anchor. Drag resizes;
            double-click expands into the dialog. */}
        <ArcGrip
          gap={4}
          stroke={2}
          span={60}
          edge={1}
          corner={growsUp ? 'top-right' : 'bottom-right'}
          title="Drag to resize · double-click to expand"
          onPointerDown={beginGripResize}
          onDoubleClick={expandFromGrip}
        />
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
  /** Explicit height in px from the resize grip; null keeps the class-driven size. */
  heightPx?: number | null;
  /** Floor for the content-sized box, so an empty composer is as tall as one
   *  being written in. Ignored once `heightPx` pins the height. */
  minHeightPx?: number | null;
  /** Explicit max-height from positioning constraints. */
  maxHeight?: string | number | null;
  /** Right padding in px; overrides the class padding. */
  padRight?: number;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  /** Mode-specific min/max height classes. */
  sizeClassName: string;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}

const ComposerTextarea: React.FC<ComposerTextareaProps> = ({
  heightPx = null,
  minHeightPx = null,
  maxHeight = null,
  padRight,
  value,
  onChange,
  onKeyDown,
  placeholder,
  sizeClassName,
  textareaRef,
}) => {
  const boxStyle: React.CSSProperties = {
    ...(heightPx === null
      ? ({
          fieldSizing: 'content',
          ...(minHeightPx != null ? { minHeight: minHeightPx } : {}),
        } as React.CSSProperties)
      : { height: heightPx }),
    ...(maxHeight != null ? { maxHeight } : {}),
    ...(padRight != null ? { paddingRight: padRight } : {}),
  };

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

// ---------------------------------------------------------------------------
// Arc grip
// ---------------------------------------------------------------------------

/** Width of the invisible band along the arc that takes the pointer. */
const ARC_HIT_WIDTH = 12;

interface ArcGripProps {
  /** Distance from the card edge to the arc's stroke centre, px. */
  gap: number;
  stroke: number;
  /** Angle the arc covers, centred on the corner's diagonal, degrees. */
  span: number;
  /** Border width of the element the grip is placed in: 1 inside the popover card, 0 on the dialog wrapper. */
  edge: 0 | 1;
  /** The corner the card grows from. */
  corner: 'bottom-right' | 'top-right';
  title: string;
  onDoubleClick: () => void;
  onPointerDown?: (event: React.PointerEvent) => void;
}

/** Arc concentric with one of the card's right-hand corners (radius
 *  CARD_RADIUS + gap), on the corner the card grows from. Only a band along
 *  the arc takes the pointer, so the grip does not cover the buttons behind
 *  it. Shown while the `group/composer` ancestor is hovered. */
const ArcGrip: React.FC<ArcGripProps> = ({ gap, stroke, span, edge, corner, title, onDoubleClick, onPointerDown }) => {
  const up = corner === 'top-right';
  const r = CARD_RADIUS + gap;
  const box = r + ARC_HIT_WIDTH / 2;
  // The corner's centre of curvature inside the svg box: its top-left corner
  // for the bottom-right grip, its bottom-left corner for the mirrored one.
  // Angles run from 3 o'clock towards the corner.
  const cy = up ? box : 0;
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const y = cy + r * Math.sin(rad) * (up ? -1 : 1);
    return `${(r * Math.cos(rad)).toFixed(2)} ${y.toFixed(2)}`;
  };
  const d = `M ${point(45 - span / 2)} A ${r} ${r} 0 0 ${up ? 0 : 1} ${point(45 + span / 2)}`;
  // Puts that centre of curvature CARD_RADIUS in from the card's outer edges.
  const offset = CARD_RADIUS - edge - box;

  return (
    <svg
      aria-hidden="true"
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      className="pointer-events-none absolute z-1 overflow-visible text-muted-foreground/60 opacity-0 transition-[opacity,color] hover:text-foreground group-hover/composer:opacity-100"
      style={{ right: offset, [up ? 'top' : 'bottom']: offset }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={ARC_HIT_WIDTH}
        style={{ pointerEvents: 'stroke', cursor: onPointerDown ? (up ? 'nesw-resize' : 'nwse-resize') : 'pointer' }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <title>{title}</title>
      </path>
    </svg>
  );
};

// Icons

const ChevronUpIcon = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

/** Corner-down-right arrow: "this points at that". Not a quotation mark -
 *  the strip holds a place in a file, and a place is not a quote. */
const AnchorIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg style={{ width: size, height: size }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 10 20 15 15 20" />
    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
  </svg>
);

const CloseIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg style={{ width: size, height: size }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
