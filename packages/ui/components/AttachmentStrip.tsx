import React, { useCallback, useRef } from 'react';
import type { ImageAttachment } from '../types';
import { getImageSrc } from './ImageThumbnail';

/**
 * An attachment whose bytes are still in flight (or whose upload failed).
 *
 * Spec 05 §3.2.4: a selected image is never silently dropped. It occupies a
 * slot in the strip from the moment it is chosen, showing explicit status and
 * retry/removal controls until it either becomes an `ImageAttachment` with a
 * stored path or the user removes it.
 */
export interface PendingAttachment {
  /** Client-side identity; not a stored reference. */
  id: string;
  /** Derived display name, already deduplicated against the saved images. */
  name: string;
  /** Object URL for the local preview, so the user sees the real image. */
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
   * Focus fallback once the removed thumbnail had no neighbor — normally the
   * composer's attach action (spec 05 §3.2.3).
   */
  onFocusAfterLastRemoved?: () => void;
  /** Mode-specific padding, so the strip lines up with the textarea above it. */
  className?: string;
}

/** Compact remove glyph. Sized for the 14×14 thumbnail corner. */
const RemoveIcon: React.FC = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const THUMB = 'w-14 h-14';

/**
 * Image-only attachment strip that lives *inside* the comment composer,
 * between the textarea and the action row (spec 05 §3.2).
 *
 * Renders the actual image, contained in a compact square. Never a file card,
 * generic icon, filename line, or byte-size label: the filename is carried by
 * the accessible name and the hover/focus tooltip only.
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
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {images.map((image) => (
        <SavedThumbnail
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
        <PendingThumbnail
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

interface ThumbnailFrameProps {
  name: string;
  children: React.ReactNode;
  /** Extra ring/border for the failed state. */
  frameClassName?: string;
}

const ThumbnailFrame: React.FC<ThumbnailFrameProps> = ({ name, children, frameClassName = '' }) => (
  <div
    role="listitem"
    title={name}
    className={`group relative ${THUMB} rounded-md overflow-hidden border border-border bg-muted ${frameClassName}`}
  >
    {children}
  </div>
);

interface RemoveButtonProps {
  name: string;
  onRemove: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
  buttonKey: string;
}

/**
 * Overlaid remove control. Kept mounted (not conditionally rendered) so it is
 * reachable by keyboard; it reveals itself on hover and on focus.
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
    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
  >
    <RemoveIcon />
  </button>
);

interface SavedThumbnailProps {
  image: ImageAttachment;
  onRemove: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
}

const SavedThumbnail: React.FC<SavedThumbnailProps> = ({ image, onRemove, registerRemoveButton }) => {
  const [unavailable, setUnavailable] = React.useState(false);

  return (
    <ThumbnailFrame name={image.name}>
      {unavailable ? (
        // Spec 05 §3.2.6: a stored reference can outlive its temporary file.
        // Say so explicitly and keep the attachment; never drop it silently.
        <div
          data-attachment-unavailable="true"
          className="absolute inset-0 flex items-center justify-center text-center px-1 text-[9px] leading-tight text-muted-foreground"
        >
          Image unavailable
        </div>
      ) : (
        <img
          src={getImageSrc(image.path)}
          alt={image.name}
          loading="lazy"
          onError={() => setUnavailable(true)}
          className={`${THUMB} object-cover`}
        />
      )}
      <RemoveButton
        name={image.name}
        buttonKey={image.path}
        onRemove={onRemove}
        registerRemoveButton={registerRemoveButton}
      />
    </ThumbnailFrame>
  );
};

interface PendingThumbnailProps {
  item: PendingAttachment;
  onRemove?: () => void;
  onRetry?: () => void;
  registerRemoveButton: (key: string, el: HTMLButtonElement | null) => void;
}

const PendingThumbnail: React.FC<PendingThumbnailProps> = ({ item, onRemove, onRetry, registerRemoveButton }) => {
  const failed = item.status === 'error';

  return (
    <ThumbnailFrame name={item.name} frameClassName={failed ? 'border-destructive' : ''}>
      <img src={item.previewUrl} alt={item.name} className={`${THUMB} object-cover opacity-50`} />
      <div
        data-attachment-status={item.status}
        className="absolute inset-x-0 bottom-0 bg-background/85 text-[9px] leading-tight text-center py-0.5 text-muted-foreground"
      >
        {failed ? (
          <span className="text-destructive">Failed</span>
        ) : (
          <span role="status">Uploading…</span>
        )}
      </div>
      {failed && onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          aria-label={`Retry upload of ${item.name}`}
          title={item.error ? `${item.error} — retry` : 'Retry upload'}
          className="absolute inset-0 top-auto bottom-4 mx-auto mb-0.5 px-1 py-0.5 w-fit text-[9px] rounded bg-popover border border-border text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      )}
      {onRemove && (
        <RemoveButton
          name={item.name}
          buttonKey={item.id}
          onRemove={onRemove}
          registerRemoveButton={registerRemoveButton}
        />
      )}
    </ThumbnailFrame>
  );
};
