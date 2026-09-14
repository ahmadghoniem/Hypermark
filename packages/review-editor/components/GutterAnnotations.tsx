import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEVERITY_STYLES, type DiffAnnotationMetadata } from '@hypermark/ui/types';
import { renderInlineMarkdown } from '../utils/renderInlineMarkdown';

/**
 * Gutter comment presentation for the code review diff (spec 05 §3.1).
 *
 * A code comment lives at its code location: a compact marker in the gutter,
 * a transient preview on hover, and a pinned, focusable popup on click, Enter
 * or Space. The popup is the single canonical read surface — there is no
 * permanent below-line block, margin note, or second editor. Choosing **Edit**
 * on an entry hands that annotation to the host's composer, anchored at the
 * same marker.
 *
 * The marker itself occupies **zero layout height**: it is an absolutely
 * positioned button inside a zero-height row, so the diff's own line layout,
 * selection, and scroll anchoring are untouched. The popup is portaled to a
 * pre-mounted container on document body, outside the renderer's shadow root,
 * and bound to the visible viewport.
 */

/** One anchor's worth of comments — every annotation projected onto one line. */
export interface GutterAnchor {
  /** Stable per-anchor key: file path, side, and line. */
  key: string;
  side: string;
  lineNumber: number;
  annotations: DiffAnnotationMetadata[];
}

const POPUP_WIDTH = 380;
const GAP = 8;
/** Grace period so the pointer can travel from marker to popup. */
const CLOSE_DELAY_MS = 200;

export interface GutterPopupState {
  anchorKey: string;
  /** A hover preview closes on pointer leave; a pinned popup does not. */
  pinned: boolean;
  rect: { top: number; bottom: number; left: number };
}

interface GutterAnnotationsController {
  state: GutterPopupState | null;
  openPreview: (anchorKey: string, el: HTMLElement) => void;
  pin: (anchorKey: string, el: HTMLElement) => void;
  closePreview: (anchorKey: string) => void;
  cancelClose: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
  registerMarker: (anchorKey: string, el: HTMLElement | null) => void;
  /**
   * A marker unmounted (virtualization recycled its row, the file collapsed,
   * the diff switched). If nothing re-registers that anchor by the next frame,
   * its popup is detached and closes rather than floating over unrelated code.
   */
  releaseMarker: (anchorKey: string) => void;
  portalRoot: HTMLElement | null;
}

/**
 * Owns which anchor is showing and whether it is a hover preview or pinned.
 * Kept outside the marker so a recycled marker cannot strand an open popup.
 */
export function useGutterAnnotations(): GutterAnnotationsController {
  const [state, setState] = useState<GutterPopupState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markers = useRef(new Map<string, HTMLElement>());
  const stateRef = useRef<GutterPopupState | null>(null);
  stateRef.current = state;
  // A deliberate close hands focus back to the marker, and that focus would
  // otherwise reopen the very preview the reviewer just dismissed.
  const skipFocusOpen = useRef(false);

  // Pre-mount portal container once per file list rather than per open (spec 08 §4).
  const portalRootRef = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.setAttribute('data-gutter-portal-root', 'true');
    document.body.appendChild(el);
    portalRootRef.current = el;
    setPortalRoot(el);
    return () => {
      el.remove();
      portalRootRef.current = null;
      setPortalRoot(null);
    };
  }, []);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const rectOf = (el: HTMLElement): GutterPopupState['rect'] => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left };
  };

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const registerMarker = useCallback((anchorKey: string, el: HTMLElement | null) => {
    if (el) markers.current.set(anchorKey, el);
    else markers.current.delete(anchorKey);
  }, []);

  const openPreview = useCallback((anchorKey: string, el: HTMLElement) => {
    if (skipFocusOpen.current) return;
    cancelClose();
    setState((prev) => {
      // Never demote a pinned popup back to a hover preview.
      if (prev?.pinned) return prev;
      return { anchorKey, pinned: false, rect: rectOf(el) };
    });
  }, [cancelClose]);

  const pin = useCallback((anchorKey: string, el: HTMLElement) => {
    cancelClose();
    setState({ anchorKey, pinned: true, rect: rectOf(el) });
  }, [cancelClose]);

  const close = useCallback((options?: { restoreFocus?: boolean }) => {
    cancelClose();
    const anchorKey = stateRef.current?.anchorKey;
    setState(null);
    if (options?.restoreFocus && anchorKey) {
      const marker = markers.current.get(anchorKey);
      if (marker?.isConnected) {
        skipFocusOpen.current = true;
        marker.focus();
        setTimeout(() => {
          skipFocusOpen.current = false;
        }, 0);
      }
    }
  }, [cancelClose]);

  const releaseMarker = useCallback((anchorKey: string) => {
    requestAnimationFrame(() => {
      if (stateRef.current?.anchorKey !== anchorKey) return;
      const marker = markers.current.get(anchorKey);
      if (marker?.isConnected) return;
      setState(null);
    });
  }, []);

  const closePreview = useCallback((anchorKey: string) => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setState((prev) => (prev && prev.anchorKey === anchorKey && !prev.pinned ? null : prev));
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  return {
    state,
    openPreview,
    pin,
    closePreview,
    cancelClose,
    close,
    registerMarker,
    releaseMarker,
    portalRoot: portalRoot ?? portalRootRef.current,
  };
}

interface GutterAnnotationMarkerProps {
  anchor: GutterAnchor;
  controller: GutterAnnotationsController;
  /** True while this anchor's popup is open (hover or pinned). */
  isOpen: boolean;
  /** True when one of this anchor's annotations is the selected one. */
  isSelected: boolean;
}

/**
 * The gutter marker. Rendered through the diff renderer's per-line annotation
 * slot, inside a zero-height row so the code layout does not shift.
 */
export const GutterAnnotationMarker: React.FC<GutterAnnotationMarkerProps> = ({
  anchor,
  controller,
  isOpen,
  isSelected,
}) => {
  const { openPreview, pin, closePreview, registerMarker, releaseMarker } = controller;
  const count = anchor.annotations.length;
  const anchorKey = anchor.key;

  useEffect(() => () => releaseMarker(anchorKey), [anchorKey, releaseMarker]);
  const severity = anchor.annotations.find((a) => a.severity)?.severity;
  const dot = severity ? SEVERITY_STYLES[severity]?.dot : null;

  return (
    <div className="pn-gutter-marker-row" data-gutter-marker-row="true" style={{ height: 0, position: 'relative' }}>
      <button
        ref={(el) => registerMarker(anchor.key, el)}
        type="button"
        data-gutter-marker="true"
        data-anchor-key={anchor.key}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          count === 1
            ? `Comment on line ${anchor.lineNumber}`
            : `${count} comments on line ${anchor.lineNumber}`
        }
        onPointerEnter={(e) => openPreview(anchor.key, e.currentTarget)}
        onPointerLeave={() => closePreview(anchor.key)}
        onFocus={(e) => openPreview(anchor.key, e.currentTarget)}
        onClick={(e) => {
          e.stopPropagation();
          pin(anchor.key, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          pin(anchor.key, e.currentTarget);
        }}
        // Styled inline, not through a stylesheet: the marker renders inside
        // the diff renderer's shadow root, where the app's CSS does not reach.
        // Custom properties do inherit across that boundary, so theme tokens
        // still apply.
        style={{
          position: 'absolute',
          // Sit on the annotated line itself, which is the row above this
          // zero-height slot: bottom 0 already puts the box above the slot, so
          // no translate (one used to lift it a further row, onto the line
          // above). The 22px hit box pads the visible marker by 2px vertically
          // and 4px horizontally; left -2 keeps the marker's edge at 2px.
          bottom: 0,
          left: -2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 26,
          height: 22,
          padding: '2px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <span
          className={`pn-gutter-marker${isSelected ? 'is-selected' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 5,
            boxShadow: '0 0 0 2px var(--background)',
            border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
            background: isSelected ? 'var(--primary)' : 'var(--popover)',
            color: isSelected ? 'var(--primary-foreground)' : 'var(--primary)',
            font: '600 10px/1 var(--font-sans, sans-serif)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {dot ? (
              <span
                className={dot}
                style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block' }}
              />
            ) : (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
              </svg>
            )}
            {count > 1 ? count : null}
          </span>
        </span>
      </button>
    </div>
  );
};

interface GutterAnnotationPopupProps {
  anchor: GutterAnchor;
  state: GutterPopupState;
  controller: GutterAnnotationsController;
  selectedAnnotationId?: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * The pinned/preview popup. Every annotation at the anchor is reachable in one
 * ordered list, each entry distinguished by its own text — never by an
 * "N of M" counter. Presentation-only chrome (author, avatar, timestamps,
 * ordinals) is omitted here; the underlying data keeps those fields.
 */
export const GutterAnnotationPopup: React.FC<GutterAnnotationPopupProps> = ({
  anchor,
  state,
  controller,
  selectedAnnotationId,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const { pinned } = state;
  const popupRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Move focus into a pinned popup so Escape and Tab behave, and so a keyboard
  // user who activated the marker lands on the content.
  useEffect(() => {
    if (!pinned) return;
    const el = popupRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      if (el.isConnected) el.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [pinned]);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && popupRef.current?.contains(target)) return;
      if (target instanceof HTMLElement && target.closest('[data-gutter-marker]')) return;
      controller.close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [controller, pinned]);

  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const spaceBelow = viewportHeight - state.rect.bottom - GAP;
  const flipAbove = spaceBelow < 200 && state.rect.top > spaceBelow;
  const width = Math.min(POPUP_WIDTH, Math.max(240, viewportWidth - 2 * GAP));
  const left = Math.min(Math.max(GAP, state.rect.left), Math.max(GAP, viewportWidth - width - GAP));

  const portalContainer = controller.portalRoot ?? (typeof document !== 'undefined' ? document.body : null);
  if (!portalContainer) return null;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-gutter-popup="true"
      data-pinned={pinned ? 'true' : 'false'}
      onPointerEnter={controller.cancelClose}
      onPointerLeave={() => {
        if (!pinned) controller.closePreview(anchor.key);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        // Escape closes the popup and returns focus to its marker. It never
        // deletes an in-progress draft — that is Cancel's job in the composer.
        controller.close({ restoreFocus: true });
      }}
      className="fixed z-popover flex flex-col gap-2 rounded-xl border border-border bg-popover p-2 shadow-2xl overflow-y-auto"
      style={{
        left,
        width,
        maxHeight: Math.max(160, viewportHeight - 2 * GAP),
        ...(flipAbove
          ? { bottom: Math.max(GAP, viewportHeight - state.rect.top + GAP) }
          : { top: state.rect.bottom + GAP }),
      }}
    >
      <span id={titleId} className="sr-only">
        {`Comments on line ${anchor.lineNumber}`}
      </span>
      {anchor.annotations.map((metadata) => (
        <GutterAnnotationEntry
          key={metadata.annotationId}
          metadata={metadata}
          isSelected={metadata.annotationId === selectedAnnotationId}
          interactive={pinned}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>,
    portalContainer,
  );
};

interface GutterAnnotationEntryProps {
  metadata: DiffAnnotationMetadata;
  isSelected: boolean;
  /** Hover previews are read-only; actions appear once the popup is pinned. */
  interactive: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const GutterAnnotationEntry: React.FC<GutterAnnotationEntryProps> = ({
  metadata,
  isSelected,
  interactive,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const severity = metadata.severity ? SEVERITY_STYLES[metadata.severity] : null;

  return (
    <div
      data-annotation-id={metadata.annotationId}
      data-gutter-entry="true"
      className={`review-comment${isSelected ? 'is-selected' : ''}`}
      onClick={() => interactive && onSelect(metadata.annotationId)}
    >
      {severity && (
        <div className="flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full shrink-0 ${severity.dot}`}
            title={severity.label}
          />
        </div>
      )}
      {metadata.text && (
        <div className="review-comment-body">{renderInlineMarkdown(metadata.text)}</div>
      )}
      {metadata.reasoning && (
        <div className="review-comment-reasoning text-2xs/relaxed text-muted-foreground/60 mt-1.5">
          {metadata.reasoning}
        </div>
      )}
      {interactive && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(metadata.annotationId);
            }}
            className="px-2 py-1 text-2xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(metadata.annotationId);
            }}
            className="px-2 py-1 text-2xs rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Group line annotations into one anchor per (side, line), preserving the
 * incoming order so overlapping comments always list deterministically.
 */
export function groupAnchors(
  entries: Array<{ side: string; lineNumber: number; metadata?: DiffAnnotationMetadata }>,
  keyPrefix = '',
  filePath?: string,
): Map<string, GutterAnchor> {
  const anchors = new Map<string, GutterAnchor>();
  for (const entry of entries) {
    if (!entry.metadata) continue;
    const key = `${keyPrefix}${entry.side}:${entry.lineNumber}`;
    const existing = anchors.get(key);
    if (existing) existing.annotations.push(entry.metadata);
    else {
      anchors.set(key, {
        key,
        side: entry.side,
        lineNumber: entry.lineNumber,
        annotations: [entry.metadata],
      });
    }
  }
  return anchors;
}
