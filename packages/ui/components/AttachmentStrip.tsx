import React, { useCallback, useRef } from 'react';
import type { ImageAttachment } from '../types';
import { getImageSrc } from './ImageThumbnail';

/** An attachment that has been chosen but has not finished uploading. */
export interface PendingAttachment {
  /** Stable id for the pending entry; not a path. */
  id: string;
  name: string;
  /** Object URL for the local preview. */
  previewUrl: string;
  status: 'uploading' | 'error';
  /** Short failure reason, shown in the strip when `status === 'error'`. */
  error?: string;
}

interface AttachmentStripProps {
  images: readonly ImageAttachment[];
  pending?: readonly PendingAttachment[];
  onRemove: (path: string) => void;
  onRemovePending?: (id: string) => void;
  onRetryPending?: (id: string) => void;
  /**
   * Focus fallback once the removed chip had no neighbor — normally the
   * composer's attach action (spec 05 §3.2.3).
   */
  onFocusAfterLastRemoved?: () => void;
  /** Mode-specific padding, so the strip lines up with the textarea above it. */
  className?: string;
}

/** Compact remove glyph, sized for the chip's trailing button. */
const RemoveIcon: React.FC = () => (
  <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/** The image standing in for itself, at favicon size. */
const PREVIEW = 'size-4 rounded-sm object-cover shrink-0';

const CHIP =
  'group inline-flex items-center gap-1.5 h-6 pl-1 pr-0.5 rounded-md border border-border bg-muted/40 text-[11px] leading-none text-muted-foreground max-w-[12rem]';

/**
 * Image attachments as chips, inside the comment composer and below the
 * textarea (spec 05 §3.2).
 *
 * Chips rather than thumbnail tiles: an attachment is a thing you have
 * ATTACHED, not a thing you are looking at. A 56px grid pushed the send row
 * down and took more of a small popover than the text did, for a preview too
 * small to read anyway. The chip keeps the image — at 16px, enough to tell two
 * screenshots apart — and spends the rest of its width on the filename, which
 * is what actually identifies the file.
 */
export const AttachmentStrip: React.FC<AttachmentStripProps> = ({
  images,
  pending = [],
  onRemove,
  onRemovePending,
  onRetryPending,
  onFocusAfterLastRemoved,
  className = '',
}) => {
  // Keyed by path/pending-id so a removal can hand focus to a neighbor that is
  // still mounted after the re-render.
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());

  const registerRemoveButton = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) removeButtons.current.set(key, el);
    else removeButtons.current.delete(key);
  }, []);

  const order = [...images.map((i) => i.path), ...pending.map((p) => p.id)];

  /** Move focus to the neighboring remove control, else back to the attach action. */
  const focusAfterRemoval = useCallback(
    (key: string) => {
      const index = order.indexOf(key);
      const neighbors = [order[index + 1], order[index - 1]].filter(Boolean) as string[];
      requestAnimationFrame(() => {
        for (const neighbor of neighbors) {
          const el = removeButtons.current.get(neighbor);
          if (el?.isConnected) {
            el.focus();
            return;
          }
        }
        onFocusAfterLastRemoved?.();
      });
    },
    [onFocusAfterLastRemoved, order],
  );

  if (images.length === 0 && pending.length === 0) return null;

  return (
    <div
      data-attachment-strip="true"
      role="list"
      aria-label="Comment attachments"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {images.map((image) => (
        <SavedChip
          key={image.path}
          image={image}
          registerRemoveButton={registerRemoveButton}
          onRemove={() => {
            focusAfterRemoval(image.path);
            onRemove(image.path);
          }}
        />
      ))}

      {pending.map((item) => (
        <PendingChip
          key={item.id}
          item={item}
          registerRemoveButton={registerRemoveButton}
          onRetry={onRetryPending ? () => onRetryPending(item.id) : undefined}
          onRemove={
            onRemovePending
              ? () => {
                  focusAfterRemoval(item.id);
                  onRemovePending(item.id);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
};

interface RemoveButtonProps {
  name: string;
  onRemove: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
  buttonKey: string;
}

/**
 * The chip's trailing remove control. Always rendered and always visible: in a
 * chip it costs 16px it already has, and a hover-only affordance on something
 * this small is a target most people never find.
 */
const RemoveButton: React.FC<RemoveButtonProps> = ({ name, onRemove, registerRemoveButton, buttonKey }) => (
  <button
    ref={(el) => registerRemoveButton(buttonKey, el)}
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onRemove();
    }}
    aria-label={`Remove ${name}`}
    title={`Remove ${name}`}
    className="shrink-0 size-4 rounded-sm flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted-foreground/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
  >
    <RemoveIcon />
  </button>
);

interface SavedChipProps {
  image: ImageAttachment;
  onRemove: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
}

const SavedChip: React.FC<SavedChipProps> = ({ image, onRemove, registerRemoveButton }) => {
  const [unavailable, setUnavailable] = React.useState(false);

  return (
    <div role="listitem" title={image.name} className={CHIP}>
      {unavailable ? (
        // Spec 05 §3.2.6: a stored reference can outlive its temporary file.
        // Say so explicitly and keep the attachment; never drop it silently.
        <span
          data-attachment-unavailable="true"
          className="shrink-0 size-4 rounded-sm bg-muted flex items-center justify-center text-[8px] text-muted-foreground"
          aria-label="Image unavailable"
        >
          ?
        </span>
      ) : (
        <img
          src={getImageSrc(image.path)}
          alt=""
          loading="lazy"
          onError={() => setUnavailable(true)}
          className={PREVIEW}
        />
      )}
      <span className="truncate">{image.name}</span>
      <RemoveButton
        name={image.name}
        buttonKey={image.path}
        onRemove={onRemove}
        registerRemoveButton={registerRemoveButton}
      />
    </div>
  );
};

interface PendingChipProps {
  item: PendingAttachment;
  onRemove?: () => void;
  onRetry?: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
}

const PendingChip: React.FC<PendingChipProps> = ({ item, onRemove, onRetry, registerRemoveButton }) => {
  const failed = item.status === 'error';

  return (
    <div
      role="listitem"
      title={failed && item.error ? `${item.name} — ${item.error}` : item.name}
      data-attachment-status={item.status}
      className={`${CHIP} ${failed ? 'border-destructive text-destructive' : ''}`}
    >
      <img src={item.previewUrl} alt="" className={`${PREVIEW} ${failed ? '' : 'opacity-50'}`} />
      {failed ? (
        <>
          <span className="truncate">{item.name}</span>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              aria-label={`Retry upload of ${item.name}`}
              title={item.error ? `${item.error} — retry` : 'Retry upload'}
              className="shrink-0 px-1 rounded-sm text-[10px] underline underline-offset-2 hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          )}
        </>
      ) : (
        // The name is already in the title; while it is uploading the status is
        // the more useful thing to spend the chip's width on.
        <span role="status" className="truncate animate-pulse">
          Uploading…
        </span>
      )}
      {onRemove && (
        <RemoveButton
          name={item.name}
          buttonKey={item.id}
          onRemove={onRemove}
          registerRemoveButton={registerRemoveButton}
        />
      )}
    </div>
  );
};
