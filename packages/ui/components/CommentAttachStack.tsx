import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDialKit } from 'dialkit';
import type { ImageAttachment } from '../types';
import { getImageSrc } from './ImageThumbnail';
import type { PendingAttachment } from './AttachmentStrip';
import {
  STACK_COLLAPSE_DELAY_MS,
  isRemovalGuarded,
  stackLayout,
} from '../utils/attachStack';

/**
 * The composer's attachments, as an overlapping stack on the left of the
 * action row.
 *
 * Empty, it is one dashed tile that opens the file picker. Filled, it shows up
 * to three overlapping thumbnails and a +N tile. Hover or keyboard focus
 * spreads every tile in place, each with its own remove button; leaving
 * collapses it again. Nothing opens over the composer.
 *
 * Attachments are saved to disk locally, so a pending file draws the same tile
 * as a saved one; only its tooltip differs when the save failed.
 *
 * The action row's height is set by Save, and the tiles are shorter, so
 * attaching never moves the row — the reason the old shelf was always mounted.
 */

interface CommentAttachStackProps {
  images: readonly ImageAttachment[];
  pending?: readonly PendingAttachment[];
  onFiles: (files: File[]) => void;
  onRemove: (path: string) => void;
  onRemovePending?: (id: string) => void;
}

type Tile =
  | { kind: 'image'; key: string; name: string; src: string; path: string }
  | { kind: 'pending'; key: string; name: string; src: string; item: PendingAttachment };

export const CommentAttachStack: React.FC<CommentAttachStackProps> = ({
  images,
  pending = [],
  onFiles,
  onRemove,
  onRemovePending,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<number | null>(null);
  const lastRemovalAt = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const dials = useDialKit('02 · Attachment stack', {
    tile: [24, 18, 32, 1],
    overlap: [9, 4, 16, 1],
    spreadGap: [6, 2, 12, 1],
    ring: [2, 1, 3, 0.5],
    collapseDelay: [STACK_COLLAPSE_DELAY_MS, 0, 500, 25],
    /** The add tile at the end of a spread stack: the only way to reach the
     *  file picker once images are attached. */
    addTile: true,
  }, { id: 'cl-02', persist: true });
  const tileSize = { width: dials.tile, height: dials.tile };
  // The ring separates overlapping tiles; it is the card colour, not a border,
  // so it does not eat into the thumbnail.
  const tileRing = `0 0 0 ${dials.ring}px var(--color-popover)`;

  const tiles: Tile[] = [
    ...images.map((image): Tile => ({
      kind: 'image', key: image.path, name: image.name, src: getImageSrc(image.path), path: image.path,
    })),
    ...pending.map((item): Tile => ({
      kind: 'pending', key: item.id, name: item.name, src: item.previewUrl, item,
    })),
  ];
  const layout = stackLayout(tiles.length, expanded);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(() => {
    cancelCollapse();
    collapseTimer.current = window.setTimeout(() => setExpanded(false), dials.collapseDelay);
  }, [cancelCollapse, dials.collapseDelay]);

  useEffect(() => cancelCollapse, [cancelCollapse]);

  useEffect(() => {
    if (tiles.length === 0) setExpanded(false);
  }, [tiles.length]);

  // Touch: a tap outside collapses a spread stack.
  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [expanded]);

  const openPicker = () => inputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = ''; // reset so the same file can be picked twice
  };

  const remove = (tile: Tile) => {
    const now = Date.now();
    if (isRemovalGuarded(lastRemovalAt.current, now)) return;
    lastRemovalAt.current = now;
    if (tile.kind === 'image') onRemove(tile.path);
    else onRemovePending?.(tile.item.id);
  };

  const fileInput = (
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
  );

  if (tiles.length === 0) {
    return (
      <>
        {fileInput}
        <AddTile onClick={openPicker} style={tileSize} />
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${tiles.length} attached image${tiles.length === 1 ? '' : 's'}`}
      data-comment-attach-stack="true"
      data-expanded={expanded ? 'true' : undefined}
      tabIndex={expanded ? -1 : 0}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancelCollapse();
        setExpanded(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') scheduleCollapse();
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'mouse' && !expanded) setExpanded(true);
      }}
      onFocus={() => {
        cancelCollapse();
        setExpanded(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleCollapse();
      }}
      className="-my-1.5 -ml-0.5 flex min-w-0 max-w-full items-center overflow-x-auto overscroll-x-contain rounded-md py-1.5 pl-0.5 pr-1.5 outline-none [scrollbar-width:none] focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden"
      style={{ gap: expanded ? dials.spreadGap : 0 }}
    >
      {fileInput}
      {layout.visible.map((index, position) => {
        const tile = tiles[index];
        return (
          <span
            key={tile.key}
            title={tile.kind === 'pending' && tile.item.error ? tile.item.error : tile.name}
            className="group/tile relative shrink-0 rounded-md transition-[margin] duration-150 motion-reduce:transition-none"
            style={{
              ...tileSize,
              boxShadow: tileRing,
              marginLeft: position > 0 && !expanded ? -dials.overlap : 0,
            }}
          >
            <img src={tile.src} alt={tile.name} className="rounded-md object-cover" style={tileSize} />
            {expanded && (
              <button
                type="button"
                onClick={() => remove(tile)}
                aria-label={`Remove ${tile.name}`}
                title={`Remove ${tile.name}`}
                className="absolute -right-1.25 -top-1.25 z-1 grid size-3.75 place-items-center rounded-full border border-border bg-popover p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <RemoveGlyph />
              </button>
            )}
          </span>
        );
      })}
      {layout.overflow > 0 && (
        <span
          className="grid shrink-0 place-items-center rounded-md bg-muted font-mono text-4xs font-semibold text-muted-foreground"
          style={{ ...tileSize, boxShadow: tileRing, marginLeft: -dials.overlap }}
        >
          +{layout.overflow}
        </span>
      )}
      {expanded && dials.addTile && <AddTile onClick={openPicker} style={tileSize} />}
    </div>
  );
};

/** Dashed tile that opens the file picker: the empty stack, and the last tile
 *  of a spread one. */
const AddTile: React.FC<{ onClick: () => void; style: React.CSSProperties }> = ({ onClick, style }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Attach images"
    title="Attach images"
    data-comment-attach="true"
    className="grid shrink-0 place-items-center rounded-md border border-dashed border-muted-foreground/45 p-0 text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground"
    style={style}
  >
    <ImagePlusGlyph />
  </button>
);

const RemoveGlyph: React.FC = () => (
  <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/** Image placeholder with a plus in its bottom-right corner. */
const ImagePlusGlyph: React.FC = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
    <path d="M19 2v6M16 5h6" />
  </svg>
);
