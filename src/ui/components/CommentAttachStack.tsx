import React, { useRef, useState } from 'react';
import { Image01, ImagePlus, XClose } from '@untitledui/icons';
import type { ImageAttachment } from '../types';
import type { PendingAttachment } from './AttachmentStrip';
import { Button } from '../fluid/components/button';
import { Tooltip } from '../fluid/components/tooltip';
import { isRemovalGuarded } from '../utils/attachStack';
import { ImageLightbox } from './ImageLightbox';
import { getImageSrc } from '../utils/imageSrc';

/**
 * The composer's attachments: one name chip per image, under the text field.
 * The row only exists once there is a file. A pending upload draws the same
 * chip as a saved one. A saved chip's name is a button that opens the image;
 * its fill lightens on hover. A pending chip's tooltip says "Uploading…", and
 * a failed one gives the reason. The × says "Remove".
 * Without `onRemove` the chips are read-only, as on the panel's cards.
 */

interface CommentAttachStackProps {
  images: readonly ImageAttachment[];
  pending?: readonly PendingAttachment[];
  onRemove?: (path: string) => void;
  onRemovePending?: (id: string) => void;
  className?: string;
}

type Chip =
  | { kind: 'image'; key: string; name: string; path: string }
  | { kind: 'pending'; key: string; name: string; item: PendingAttachment };

/** "screenshot.png" -> ["screenshot", ".png"], so the name truncates and the
 *  extension stays visible. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

export const CommentAttachStack: React.FC<CommentAttachStackProps> = ({
  images,
  pending = [],
  onRemove,
  onRemovePending,
  className = 'px-0.5 pt-2',
}) => {
  const lastRemovalAt = useRef(0);
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);
  const chips: Chip[] = [
    ...images.map((image): Chip => ({ kind: 'image', key: image.path, name: image.name, path: image.path })),
    ...pending.map((item): Chip => ({ kind: 'pending', key: item.id, name: item.name, item })),
  ];
  if (chips.length === 0) return null;

  // Chips reflow when one goes, so a double click must not remove the next.
  const remove = (chip: Chip) => {
    const now = Date.now();
    if (isRemovalGuarded(lastRemovalAt.current, now)) return;
    lastRemovalAt.current = now;
    if (chip.kind === 'image') onRemove?.(chip.path);
    else onRemovePending?.(chip.item.id);
  };

  return (
    <div
      role="group"
      aria-label={`${chips.length} attached image${chips.length === 1 ? '' : 's'}`}
      data-comment-attach-stack="true"
      className={`flex flex-wrap items-center gap-1 ${className}`}
    >
      {chips.map((chip) => {
        const [base, ext] = splitName(chip.name);
        const failed = chip.kind === 'pending' && !!chip.item.error;
        const label = (
          <>
            <Image01 size={12} className="shrink-0 text-muted-foreground" />
            <span className="flex min-w-0">
              <span className="truncate">{base}</span>
              <span className="shrink-0">{ext}</span>
            </span>
          </>
        );
        return (
          <span
            key={chip.key}
            className={`inline-flex h-5.5 min-w-0 max-w-44 select-none items-center gap-0.5 rounded-sm bg-muted/60 pl-1.5 ${onRemove ? 'pr-0.5' : 'pr-1.5'} text-caption transition-colors has-[[data-chip-view]:hover]:bg-foreground/10 ${
              failed ? 'text-destructive' : 'text-foreground/90'
            } ${chip.kind === 'pending' && !failed ? 'opacity-70' : ''}`}
          >
            {chip.kind === 'image' ? (
              <button
                type="button"
                data-chip-view
                aria-label={`View ${chip.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview({ path: chip.path, name: chip.name });
                }}
                className="flex min-w-0 cursor-pointer items-center gap-1 rounded-xs"
              >
                {label}
              </button>
            ) : (
              <Tooltip
                content={failed ? chip.item.error : 'Uploading…'}
                side="top"
                className={COMPOSER_TOOLTIP}
                contentClassName="z-popover-hint"
              >
                <span className="flex min-w-0 items-center gap-1">{label}</span>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip content="Remove" side="top" className={COMPOSER_TOOLTIP} contentClassName="z-popover-hint">
                <button
                  type="button"
                  aria-label={`Remove ${chip.name}`}
                  onClick={() => remove(chip)}
                  className="grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <XClose size={12} />
                </button>
              </Tooltip>
            )}
          </span>
        );
      })}
      {preview && <ImageLightbox src={getImageSrc(preview.path)} alt={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
};

/** Dark tooltip with a border, in place of Fluid's inverted one. */
export const COMPOSER_TOOLTIP = 'border border-border bg-popover text-foreground shadow-md';

/** Ghost icon button that opens the image picker. */
export const CommentAttachButton: React.FC<{ onFiles: (files: File[]) => void }> = ({ onFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = ''; // reset so the same file can be picked twice
        }}
      />
      <Tooltip content="Attach image" side="top" className={COMPOSER_TOOLTIP} contentClassName="z-popover-hint">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Attach image"
          data-comment-attach="true"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
        </Button>
      </Tooltip>
    </>
  );
};
