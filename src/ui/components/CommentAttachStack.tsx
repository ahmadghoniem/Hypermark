import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDialKit } from 'dialkit';
import type { ImageAttachment } from '../types';
import { getImageSrc } from './ImageThumbnail';
import type { PendingAttachment } from './AttachmentStrip';
import {
  isRemovalGuarded,
  stackLayout,
} from '../utils/attachStack';

/**
 * The composer's attachments, as an overlapping stack on the left of the
 * action row.
 *
 * Empty, it is one image glyph that opens the file picker. Filled, it shows up
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
    tile: {
      type: 'select',
      options: [
        { value: '20', label: '20' },
        { value: '24', label: '24 · default · rec' },
        { value: '28', label: '28' },
        { value: '32', label: '32' },
      ],
      default: '24',
    },
    ring: [2, 1, 3, 0.5],
    /** Corner radius of every tile in the stack: thumbnails, the +N tile and
     *  the add tile. 6px read as too round on a 24px tile. */
    imageRadius: {
      type: 'select',
      options: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '4', label: '4 · default · rec' },
      ],
      default: '4',
    },
    collapseDelay: {
      type: 'select',
      options: [
        { value: '0', label: '0' },
        { value: '100', label: '100' },
        { value: '150', label: '150 · default' },
        { value: '250', label: '250 · rec' },
        { value: '400', label: '400' },
      ],
      default: '150',
    },
  }, { id: 'cl-02', persist: true });
  const tile = Number(dials.tile);
  const collapseDelay = Number(dials.collapseDelay);
  const radius = Number(dials.imageRadius);
  const tileSize = { width: tile, height: tile };
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
    collapseTimer.current = window.setTimeout(() => setExpanded(false), collapseDelay);
  }, [cancelCollapse, collapseDelay]);

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
        <AddTile onClick={openPicker} style={{ ...tileSize, borderRadius: radius }} />
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
      className="-my-1.5 -ml-0.5 flex min-w-0 max-w-full items-center overflow-x-auto overscroll-x-contain rounded-md py-1.5 pl-0.5 pr-1.5 outline-none scrollbar-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden"
      style={{ gap: expanded ? 6 : 0 }}
    >
      {fileInput}
      {layout.visible.map((index, position) => {
        const tile = tiles[index];
        return (
          <span
            key={tile.key}
            title={tile.kind === 'pending' && tile.item.error ? tile.item.error : tile.name}
            className="group/tile relative shrink-0 transition-[margin] duration-150 motion-reduce:transition-none"
            style={{
              ...tileSize,
              borderRadius: radius,
              boxShadow: tileRing,
              marginLeft: position > 0 && !expanded ? -9 : 0,
            }}
          >
            <img src={tile.src} alt={tile.name} className="object-cover" style={{ ...tileSize, borderRadius: radius }} />
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
          className="grid shrink-0 place-items-center bg-muted font-mono text-4xs font-semibold text-muted-foreground"
          style={{ ...tileSize, borderRadius: radius, boxShadow: tileRing, marginLeft: -9 }}
        >
          +{layout.overflow}
        </span>
      )}
      {expanded && <AddTile onClick={openPicker} style={{ ...tileSize, borderRadius: radius }} />}
    </div>
  );
};

/** The glyph that opens the file picker: the empty stack, and the last tile of
 *  a spread one. Borderless — it fills the tile box, so the icon itself is the
 *  target rather than something floating inside a dashed ring. */
const AddTile: React.FC<{ onClick: () => void; style: React.CSSProperties }> = ({ onClick, style }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Attach images"
    title="Attach images"
    data-comment-attach="true"
    className="grid shrink-0 place-items-center p-0 text-muted-foreground transition-colors hover:text-foreground"
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
  <svg className="size-full p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
    <path d="M19 2v6M16 5h6" />
  </svg>
);
