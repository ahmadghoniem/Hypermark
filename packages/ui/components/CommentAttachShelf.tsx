import React, { useRef } from 'react';
import type { ImageAttachment } from '../types';
import { getImageSrc } from './ImageThumbnail';
import type { PendingAttachment } from './AttachmentStrip';

/**
 * The composer's attachment row — permanent, and the only home of the attach
 * trigger.
 *
 * It is deliberately always mounted. A shelf that appears on first attach
 * pushes the action row down by its own height, and the cursor is resting
 * exactly there: the user just clicked attach and the OS file picker closed
 * over that spot. Save would move out from under them, and near the bottom of
 * the viewport the extra height makes the popover flip above the anchored
 * line. Costing 44px when nothing is attached buys a row below that cannot
 * move.
 *
 * Empty it holds one image icon. Filled it holds the thumbnails and a dashed
 * tile that matches their edge exactly — never smaller, or the row loses its
 * baseline and the tile stops being a comfortable target. Both states are the
 * same `<button>` driving the same hidden `<input type="file">`; only the
 * accessible name changes.
 */

const TILE = 'h-8 w-8 shrink-0 rounded-md';

interface CommentAttachShelfProps {
  images: readonly ImageAttachment[];
  pending?: readonly PendingAttachment[];
  onFiles: (files: File[]) => void;
  onRemove: (path: string) => void;
  onRemovePending?: (id: string) => void;
  onRetryPending?: (id: string) => void;
}

export const CommentAttachShelf: React.FC<CommentAttachShelfProps> = ({
  images,
  pending = [],
  onFiles,
  onRemove,
  onRemovePending,
  onRetryPending,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = images.length > 0 || pending.length > 0;

  const openPicker = () => inputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = ''; // reset so the same file can be picked twice
  };

  return (
    <div className="flex items-center gap-[7px] h-11 px-3 overflow-x-auto">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      {images.map((image) => (
        <span key={image.path} title={image.name} className={`relative ${TILE}`}>
          <img
            src={getImageSrc(image.path)}
            alt={image.name}
            className={`${TILE} object-cover ring-1 ring-border/60`}
          />
          <button
            type="button"
            onClick={() => onRemove(image.path)}
            aria-label={`Remove ${image.name}`}
            title={`Remove ${image.name}`}
            className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-popover text-muted-foreground transition-colors hover:text-foreground"
          >
            <RemoveGlyph />
          </button>
        </span>
      ))}

      {pending.map((item) => (
        <span key={item.id} title={item.error || item.name} className={`relative ${TILE}`}>
          <img
            src={item.previewUrl}
            alt={item.name}
            className={`${TILE} object-cover ring-1 ring-border/60 ${item.status === 'error' ? 'opacity-40' : 'opacity-70'}`}
          />
          {item.status === 'uploading' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse rounded-b-md bg-primary" />
          )}
          {item.status === 'error' && onRetryPending && (
            <button
              type="button"
              onClick={() => onRetryPending(item.id)}
              aria-label={`Retry ${item.name}`}
              title={item.error ? `${item.error} — retry` : 'Retry'}
              className="absolute inset-0 grid place-items-center rounded-md text-[9px] font-semibold text-destructive"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemovePending?.(item.id)}
            aria-label={`Remove ${item.name}`}
            title={`Remove ${item.name}`}
            className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-popover text-muted-foreground transition-colors hover:text-foreground"
          >
            <RemoveGlyph />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={openPicker}
        aria-label={filled ? 'Add another image' : 'Attach images'}
        title={filled ? 'Add another image' : 'Attach images'}
        data-comment-attach="true"
        className={
          filled
            ? `${TILE} grid place-items-center border border-dashed border-muted-foreground/45 text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground`
            : 'grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        }
      >
        {filled ? <PlusGlyph /> : <ImageGlyph />}
      </button>
    </div>
  );
};

const RemoveGlyph: React.FC = () => (
  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PlusGlyph: React.FC = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
);

const ImageGlyph: React.FC = () => (
  <svg className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
  </svg>
);
