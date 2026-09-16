# 02 — Attachments: the shelf becomes a stack in the action row; Ask moves next to Save

Wave 1 — needs 08 (DialKit) merged. Design reference: https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ,
board **Attachments** (all four columns) and **Composer** column 01 (action row).

## What changes

`CommentAttachShelf` is a 40px row between the textarea and the action row,
mounted even when empty. It goes away. Attachments move into the left side of
the action row as a small overlapping stack:

| State | Looks like |
|---|---|
| No images | One 24px dashed tile with an image glyph and a small plus. Click opens the file picker. |
| Spread, with the `addTile` dial on (the default) | The same dashed tile sits after the last thumbnail, so the picker stays reachable once images are attached. |
| 1–3 images | 24px thumbnails overlapping by 9px, each with a 2px ring in the card colour (`ring-popover`); later tiles sit on top. No add tile. |
| 4+ images | First three thumbnails, then a `+N` tile. |
| Pointer over the stack, or keyboard focus inside it | Every tile spreads out in place with a 6px gap (no popover, no `+N`). The tile under the pointer shows an × at its top-right. |
| Pointer leaves / focus leaves | Collapses after 150ms. |
| Touch (no hover) | Tap the stack to spread it; tap outside to collapse. × buttons are visible while spread. |
| Saving, or saved | One tile either way. Attachments are written to disk locally, so there is no upload state worth drawing; a file that failed keeps its tile, with the reason in the tooltip, and the × removes it. |

After removing an image, the × buttons ignore clicks for 250ms, so a quick
second click cannot delete the tile that just slid under the pointer. The
guard covers the whole stack, not just the tile that was removed.

Sizes come from a DialKit panel (spec 08's convention), so they are tuned in
the running app: tile size, overlap, spread gap, ring width, the collapse
delay, and whether the add tile appears in a filled stack.

Paste and drop keep working exactly as today (they live in `CommentPopover`,
lines 222–253, untouched).

The shelf existed so that attaching could not move the Save row. That still
holds: the action row's height is set by Save (`py-1.5 text-xs` ≈ 28px), and
24px tiles fit inside it. Ask and Save are right-aligned, so a spreading stack
never moves them.

The action row's right group becomes `{quickLookGoodButton}`, **Ask**,
**Save** — Ask sits directly beside Save. The `Ctrl ↵` hint is dropped; the
shortcut still works and is still in the keyboard help.

## Owned files

- `packages/ui/utils/attachStack.ts` (new)
- `packages/ui/components/CommentAttachStack.tsx` registers the
  `02 · Attachment stack` dial panel; no other file reads it.
- `packages/ui/utils/attachStack.test.ts` (new)
- `packages/ui/components/CommentAttachStack.tsx` (new)
- `packages/ui/components/CommentAttachShelf.tsx` (delete)
- `packages/ui/components/CommentPopover.tsx` — only line 4, line 6, lines 695–705, lines 707–733.

## 1. `packages/ui/utils/attachStack.ts`

```ts
/** Collapsed attachment stack: how many tiles show before a +N tile. */
export const STACK_MAX_COLLAPSED = 3;
/** Delay before a spread stack collapses once the pointer or focus leaves. */
export const STACK_COLLAPSE_DELAY_MS = 150;
/** After a removal, further removals are ignored for this long. */
export const STACK_REMOVE_GUARD_MS = 250;

export interface StackLayout {
  /** Indexes of the tiles to render, in order. */
  visible: number[];
  /** Tiles folded into the +N tile; 0 when there is none. */
  overflow: number;
}

export function stackLayout(count: number, expanded: boolean, maxCollapsed = STACK_MAX_COLLAPSED): StackLayout {
  if (count <= 0) return { visible: [], overflow: 0 };
  const shown = expanded ? count : Math.min(count, maxCollapsed);
  return {
    visible: Array.from({ length: shown }, (_, i) => i),
    overflow: count - shown,
  };
}

/** True when a removal at `now` falls inside the guard window of the last one. */
export function isRemovalGuarded(lastRemovalAt: number, now: number, guardMs = STACK_REMOVE_GUARD_MS): boolean {
  return now - lastRemovalAt < guardMs;
}
```

## 2. `packages/ui/utils/attachStack.test.ts`

```ts
import { describe, test, expect } from 'bun:test';
import { stackLayout, isRemovalGuarded } from './attachStack';

describe('stackLayout', () => {
  test('empty', () => {
    expect(stackLayout(0, false)).toEqual({ visible: [], overflow: 0 });
    expect(stackLayout(0, true)).toEqual({ visible: [], overflow: 0 });
  });
  test('up to three collapsed tiles show without overflow', () => {
    expect(stackLayout(3, false)).toEqual({ visible: [0, 1, 2], overflow: 0 });
  });
  test('more than three collapse into +N', () => {
    expect(stackLayout(5, false)).toEqual({ visible: [0, 1, 2], overflow: 2 });
  });
  test('expanded shows every tile', () => {
    expect(stackLayout(5, true)).toEqual({ visible: [0, 1, 2, 3, 4], overflow: 0 });
  });
});

describe('isRemovalGuarded', () => {
  test('inside and outside the window', () => {
    expect(isRemovalGuarded(1000, 1100)).toBe(true);
    expect(isRemovalGuarded(1000, 1250)).toBe(false);
  });
});
```

## 3. `packages/ui/components/CommentAttachStack.tsx`

Same props as the shelf, so the call site only changes its tag name.

```tsx
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
```

## 4. `CommentPopover.tsx`

1. Line 4: `import { CommentAttachShelf } from './CommentAttachShelf';` →
   `import { CommentAttachStack } from './CommentAttachStack';`
   Delete line 6, `import { submitHint } from '../utils/platform';` — the
   `Ctrl ↵` hint was its only use, and an unused import fails the
   strict-consumer typecheck.
2. Delete lines 695–705 (the `{/* Attachment shelf … */}` comment and the `{allowImages && (<CommentAttachShelf … />)}` block).
3. Replace lines 707–733 (the action row) with:

```tsx
        {/* Action row. Attachments on the left; Ask sits right beside Save.
            Save sets the row's height, so attaching never moves it. */}
        <div className="flex items-center justify-between gap-3 pb-2 pl-2.5 pr-2 pt-1.75">
          <div className="flex min-w-0 items-center gap-0.5">
            {allowImages && (
              <CommentAttachStack
                images={images}
                pending={uploads.pending}
                onFiles={attachFiles}
                onRemove={removeImage}
                onRemovePending={uploads.removePending}
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {quickLookGoodButton}
            <button
              type="button"
              onClick={() => {}}
              title="Ask about this line"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-2.25 py-1.25 text-2xs font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              Ask
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGlobal ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
```

4. Delete `packages/ui/components/CommentAttachShelf.tsx`.

## Do not

- Do not change `useAttachmentUploads`, the paste handler or the drop handler.
- Do not touch `quickLookGoodButton`'s definition (spec 03 removes it).
- Do not add a popover or tray for attachments.

## Completion

- `ls packages/ui/components/CommentAttachShelf.tsx` → missing.
- `rg -n "CommentAttachShelf" packages apps --glob '!**/dist/**'` → nothing.
- `bun test packages/ui/utils/attachStack.test.ts` green.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook`, open a comment:
  - empty: one dashed 24px tile left of the action row; clicking it opens the file picker;
  - paste two images: they overlap, the composer's height does not change, and no tile flashes a different state while it saves;
  - paste three more: three thumbnails and `+2`;
  - hover the stack: all five spread with gaps, with the dashed add tile after the last one; hovering one shows its ×; clicking × removes it and a fast second click does nothing; moving away collapses after a moment;
  - the DialKit panel shows an **02 · Attachment stack** section; `tile`, `overlap`, `spreadGap`, `ring` and `collapseDelay` change the open stack, and turning `addTile` off drops the add tile from a filled stack;
  - Tab into the stack: it spreads; Tab reaches each ×;
  - Ask sits immediately left of Save, with no `Ctrl ↵` hint, and Ctrl+Enter still submits;
