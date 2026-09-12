# 08 — Review comment markers: bigger target, instant preview

`packages/review-editor/components/GutterAnnotations.tsx` (451 lines) renders
a 14px marker at each annotated line and a popup that opens on hover
(preview) or click/Enter (pinned). The marker is easy to scroll past and the
preview feels slow.

## Owned files

- `packages/review-editor/components/GutterAnnotations.tsx`

## What the code does today

- Marker (lines 205–232): `position: absolute; bottom: 0; left: 2; transform: translateY(-100%)`, `minWidth: 14; height: 14; padding: 0 3px; borderRadius: 4`, 9px bold count or an 8px comment glyph, `border: 1px solid var(--border)`, `background: var(--popover)`. Styled inline because it renders inside Pierre's shadow root.
- Open: `onPointerEnter` → `openPreview` (line 187) sets state synchronously. There is **no open delay** in code; `CLOSE_DELAY_MS = 120` (line 35) only governs leave.
- The popup (line ~270+) positions from `state.rect` and viewport size; it mounts a focus effect on a `setTimeout(…, 0)` when pinned.

So the "slow to appear" observation is not a timer. Candidates, in order of
likelihood: (a) the popup is portalled and its first paint waits on a React
commit plus Pierre's virtualised row re-render — the marker itself is
recycled with its row (see the comment at `AllFilesCodeView.tsx:~684`); (b)
the marker's 14×14 hit area means the pointer often misses it and the
"hover" the user perceives as slow is a hover that never registered.

## Edits

1. **Marker size.** `minWidth: 14; height: 14` → `minWidth: 18; height: 18`,
   `padding: 0 5px`, `borderRadius: 5`, glyph `svg` 10×10, count font
   `600 10px/1`. Keep `left: 2`. The line row is 20–22px at the default code
   size, so 18px fills it without overlapping the neighbour row.
2. **Hit area.** Add an invisible padding box: wrap the visible marker in a
   `button` whose own box is `minWidth: 26; height: 22` with `padding: 2px 4px`
   and transparent background, and move the visible styles to an inner
   `span`. Pointer enter fires on the button, so the target grows by 8×8
   without changing what is drawn. Keep `data-gutter-marker` on the button
   (the pinned-popup outside-click handler at line ~292 looks for it).
3. **Visibility while scrolling.** Give the marker a `box-shadow: 0 0 0 2px var(--background)`
   ring so it separates from the gutter's line numbers, and `color:
   var(--primary)` at rest for the glyph (border stays `var(--border)`). The
   selected state is unchanged.
4. **Preview latency.** Two changes, both measurable on the Windows machine:
   - Render the popup with `position: fixed` from the cached `state.rect`
     (already the case) but pre-mount its container once per file list rather
     than per open: `useGutterAnnotations` keeps one portal root; `openPreview`
     only toggles content. This removes the mount cost from the hover path.
   - Cancel `CLOSE_DELAY_MS` when the pointer moves marker → popup (already
     wired via `onPointerEnter={controller.cancelClose}` at 314) and raise it
     to 200ms so a diagonal move does not drop the preview.
   If (a) above is the cause, the first change fixes it; if (b), the hit area
   does. Both ship.

## Measurement (Windows handoff)

Open a review with ≥10 comments, hover a marker with the Performance panel
recording: the popup's first paint should follow `pointerenter` within one
frame (<16ms) after this spec. Record the before/after in `WINDOWS-HANDOFF.md`
§4.

## Open questions

1. Is a 200ms leave grace too long, making the popup feel sticky? Try 200; fall
   back to 150 if it does.

## Completion

- `rg -n "minWidth: 14|height: 14" packages/review-editor/components/GutterAnnotations.tsx` → nothing.
- `rg -n "CLOSE_DELAY_MS = 200" packages/review-editor/components/GutterAnnotations.tsx` → one hit.
- Behaviour, `bun run dev:review`: add a line comment; the marker is 18px tall with a 2px ring; hovering anywhere in a 26×22 box around it opens the preview with no visible delay.
- `bun run typecheck:editors` green.
