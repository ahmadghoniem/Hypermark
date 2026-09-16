# 01 — Composer chrome: dialled width, 4px strip, matching Close buttons, concentric arc on the free corner

Wave 1 — needs 08 (DialKit) merged. Design reference:
https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ, board **Composer**
(columns 01, 03, 04). Where the canvas and this spec disagree, this spec wins.

## What changes

| Today | After |
|---|---|
| Card is 384px wide | 344px by default, switchable in the DialKit panel |
| Anchor strip `py-1.5 pr-1.5`, anchor icon 13px, Close 22px with a 13px icon | 4px padding top, bottom and right; anchor icon 12px; Close 18px with a 12px icon |
| Global composer has no Close | Close at the textarea's top-right, same size, inset and radius as the strip's Close |
| Expand button at the textarea's top-right; the dialog shows Collapse buttons | No Expand or Collapse buttons |
| Arc at the top-left, radius 12, drag grows up and left, double-click resets size | Arc concentric with the card's corner, on the bottom-right, or the top-right when the card opens above its anchor; drag grows the card right and into the free space; double-click opens the dialog |
| — | The dialog (the centred, 720px expanded state) has the same arc at its bottom-right; double-click collapses it back to the popover |
| Inner corners `rounded-xl` (14px) inside a 14px card with a 1px border | Inner corners 13px, so they are concentric with the card |

Escape keeps its current behaviour: in a non-forced dialog it collapses to the
popover (`handleKeyDown`, lines 556–569), otherwise it closes. The arc has no
keyboard behaviour.

## Why these values

Radii come from `--radius: 10px`, so `rounded-xl` = 14px.

- **Concentric corners.** A shape nested inside a rounded corner with inset
  `i` gets radius `outer − i`, or the gap between the two curves is uneven.
  Inside the 1px card border the radius is 13. The Close buttons sit 4px in
  from that edge, so their radius is 13 − 4 = 9. The arc sits `gap` px
  outside the card edge, so its radius is 14 + gap.
- **4px inset everywhere.** The strip padding, the Close inset and the arc gap
  all use the same 4px step.
- **12px icons.** The icons draw a 2-unit stroke in a 24-unit viewBox. At 12px
  that is exactly 1px, so the lines are sharp; at 11 or 13px they blur. An
  18px button around a 12px icon leaves 3px on each side, a whole pixel.
- **Width.** The text area is the card width minus 30px (border and padding),
  at 12.5px text, about 6.5px per character. 344px gives about 48 characters a
  line, within the 45–75 range readers are comfortable with, on the 8px grid.
  The panel offers 320 / 336 / 344 / 352 / 368 / 384 (44–55 characters).

## Owned files

- `packages/ui/components/CommentPopover.tsx` — only the regions below.
  Do **not** touch line 4, lines 586–601, 695–733 (specs 02 and 03 own them).

## Edits

Line numbers are from the unedited file at `684b9c6e`. Make the edits from the
bottom of the file up (section 9 first, section 1 last) so the numbers stay
valid while you work.

### 1. Import and constants

After line 12 (`} from '../hooks/useViewportEnvironment';`) add:

```ts
import { useDialKit } from 'dialkit';
```

(Not next to the `react` imports: spec 02 edits line 4, and edits that close
together conflict when the branches merge.)

Replace line 77 (`const MAX_POPOVER_WIDTH = 384;`) with:

```ts
const MAX_POPOVER_WIDTH = 344;
/** rounded-xl with --radius 10px: the card's outer corner radius. */
const CARD_RADIUS = 14;
/** Corner radius just inside the card's 1px border. Nested corners subtract their inset from it. */
const INNER_RADIUS = CARD_RADIUS - 1;
```

### 2. Dials (after line 192, `const visibleBounds = useVisibleViewportBounds(16);`)

```tsx
  // Design dials (spec 08). Tuned from the DialKit panel in dev; the defaults
  // are the shipped values until they are baked back into constants.
  const dials = useDialKit('01 · Composer chrome', {
    width: { type: 'select', options: ['320', '336', '344', '352', '368', '384'], default: '344' },
    inset: [4, 2, 8, 1],
    closeSize: [18, 14, 24, 1],
    closeIcon: [12, 9, 16, 1],
    anchorIcon: [12, 9, 14, 1],
    arc: { gap: [4, 0, 10, 1], stroke: [2, 1, 3, 0.5], span: [60, 30, 90, 5] },
  }, { id: 'cl-01', persist: true });
  const baseWidth = Math.min(Number(dials.width), visibleBounds.width);
  const closeRadius = Math.max(2, INNER_RADIUS - dials.inset);
```

### 3. Grip state and handler (lines 329–365)

Replace the block from the comment `// Arc grip: drag the composer taller…`
through the end of `resetGripResize` with:

```tsx
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

    const move = (e: PointerEvent) => {
      const dy = growsUp ? startY - e.clientY : e.clientY - startY;
      setComposerHeight(Math.max(56, Math.min(480, startHeight + dy)));
      setComposerWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + (e.clientX - startX))));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }, [baseWidth, composerWidth, dragPosition, position?.flipAbove, visibleBounds.right]);

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
```

`resetGripResize` is gone; nothing else used it. Line 282 is unchanged.

### 4. Composer card corners and the anchor strip (lines 606–643)

- Line 607: `rounded-xl` → `rounded-[13px]`.
- Line 647 (the body): `rounded-xl` → `rounded-[13px]`.
- Replace lines 608–643 (the strip comment through the strip's closing `)}`) with:

```tsx
      {/* Top strip - anchor mark, location, Close at the far right. Draggable by
          the strip in popover mode. Not rendered for global comments. The
          inset is the same on the top, bottom and right, and Close's radius is
          concentric with the corner it sits in. */}
      {!isGlobal && (
        <div
          className="flex items-center gap-2 rounded-t-[13px] pl-3"
          {...(mode === 'popover' ? dragHandleProps : {})}
          style={{
            ...(mode === 'popover' ? dragHandleProps.style : {}),
            paddingTop: dials.inset,
            paddingBottom: dials.inset,
            paddingRight: dials.inset,
          }}
        >
          <span className="flex shrink-0 text-primary" aria-hidden="true">
            <AnchorIcon size={dials.anchorIcon} />
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
            style={{ width: dials.closeSize, height: dials.closeSize, borderRadius: closeRadius }}
            title="Close"
            aria-label="Close"
          >
            <CloseIcon size={dials.closeIcon} />
          </button>
        </div>
      )}
```

The `style` prop comes after the `dragHandleProps` spread so it wins, and it
copies `dragHandleProps.style` in so the drag cursor is kept.

### 5. Textarea corner (lines 650–692)

- Line 650: the comment becomes
  `{/* Textarea. The global composer has no strip, so its Close sits in this corner. */}`
- Keep line 651 (`<div className="relative px-3.25 pb-0.5 pt-2.5" {...composerDropProps}>`).
- Replace lines 652–671 (the whole `{mode === 'popover' ? (…) : (…)}` expression) with:

```tsx
          {isGlobal && (
            <button
              type="button"
              onClick={() => handleClose()}
              className="absolute z-1 grid place-items-center p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={{
                // The body has its own 1px border, so inset − 1 puts this button
                // the same distance from the card edge as the strip's Close.
                top: dials.inset - 1,
                right: dials.inset - 1,
                width: dials.closeSize,
                height: dials.closeSize,
                borderRadius: closeRadius,
              }}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon size={dials.closeIcon} />
            </button>
          )}
```

- In `sizeClassName` (lines 679–685) delete `pr-[26px] ` from all three strings.
- Add a prop to the `<ComposerTextarea` element, after `heightPx`:

```tsx
            // Keep text 4px clear of the global Close:
            // (inset − 1) + closeSize + 4 − 13px container padding.
            padRight={isGlobal ? dials.inset + dials.closeSize - 10 : undefined}
```

### 6. Dialog: add the arc (lines 752–778)

Replace lines 752–778 (from `{/* Dialog card */}` through the card's closing
`</div>`) with:

```tsx
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
              {...dials.arc}
              edge={0}
              corner="bottom-right"
              title="Double-click to collapse"
              onDoubleClick={collapseFromGrip}
            />
          )}
        </div>
```

### 7. Popover render (lines 784–856)

Replace lines 787–789 with:

```tsx
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
```

The non-drag style object (lines 815–823) keeps its current shape; only
`left` and `width` come from the two lines above.

Delete the arc `<span>` block, lines 839–849 (comment included). Replace
`{composerCard}` (line 851) with:

```tsx
        {composerCard}

        {/* Arc grip on the corner the card grows from: bottom-right normally,
            top-right when the card opened above its anchor. Drag resizes;
            double-click expands into the dialog. */}
        <ArcGrip
          {...dials.arc}
          edge={1}
          corner={growsUp ? 'top-right' : 'bottom-right'}
          title="Drag to resize · double-click to expand"
          onPointerDown={beginGripResize}
          onDoubleClick={expandFromGrip}
        />
```

### 8. `ComposerTextarea` (lines 862–905)

- Add to `ComposerTextareaProps`, after `maxHeight`:
  ```ts
    /** Right padding in px; overrides the class padding. */
    padRight?: number;
  ```
- Destructure `padRight` in the component and add to `boxStyle`:
  ```ts
      ...(padRight != null ? { paddingRight: padRight } : {}),
  ```

### 9. Icons and the grip component (lines 909–948)

- Delete `ExpandIcon` (923–927) and `CollapseIcon` (938–942).
- `CloseIcon` and `AnchorIcon` take a pixel size:

```tsx
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
```

  Keep `AnchorIcon`'s doc comment.

- Add, after `ComposerTextarea`:

```tsx
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
```

## Do not

- Do not change `computeCommentPopoverPosition` (spec 03 edits it).
- Do not touch the shelf or the action row (spec 02).
- Do not add keyboard handling to the arc.

## Completion

- `rg -n "ExpandIcon|CollapseIcon|resetGripResize|pr-\[26px\]" packages/ui/components/CommentPopover.tsx` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook`, select text, open a comment:
  - the card is 344px wide, has no Expand button, and the DialKit panel shows an **01 · Composer chrome** section; changing `width`, `inset`, `closeSize` and the `arc` values updates the open card, and the values survive a reload;
  - the strip's Close sits 4px from the top, bottom and right of the strip;
  - hovering the card shows the arc just outside its bottom-right corner, following the corner's curve; clicking the bottom-right corner of Save saves (the arc does not take the click);
  - dragging the arc grows the card right and down; the left edge does not move;
  - double-clicking the arc opens the dialog; the dialog's arc collapses it on double-click; Escape in the dialog's textarea also collapses it.
- Open a global comment: Close sits at the textarea's top-right, the same size and distance from the card edge as the strip's Close, and closes the composer.
- Scroll so a composer opens above its anchor: the arc is at the card's
  top-right corner, dragging it up makes the card taller, the card's bottom
  edge stays on the anchor, and Close still takes clicks at that corner.
