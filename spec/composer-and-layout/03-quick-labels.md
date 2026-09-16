# 03 — Quick labels float above the anchored composer

Wave 2 — cut from `main` after specs 01 and 02 are merged. Line numbers below
refer to `684b9c6e` for files 01/02 did not touch; inside `CommentPopover.tsx`
find the code by the quoted anchors instead.

Design reference: https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ,
board **Quick labels**, and **Composer** columns 01–02.

## What changes

A row of six label chips floats 8px above the anchored composer, outside the
card:

**Agreed · Needs explanation · Verify this · Give an example · Out of scope · Needs tests**

- One click saves a comment whose text is the label (and whose
  `quickLabelTip` is the label's tip), exactly like the removed quick-label
  picker did, and closes the composer.
- The row fades out (150ms) as soon as the composer has text or an image, and
  comes back when both are cleared. The card never moves: its position
  reserves a 32px lane for the row whenever labels are enabled.
- The row is one line. A vertical mouse wheel over it scrolls it sideways;
  the clipped edge(s) fade with a mask.
- Chip height, the gaps and the edge fade come from the `03 · Quick labels`
  dial panel (spec 08's convention), registered in `CommentPopover` because
  the lane it reserves is part of the card's position.
- **No tooltip.** Chips carry no `title` attribute.
- Not rendered for global comments.
- Surfaces: the markdown plan viewer's text-selection composer gets all six.
  The HTML viewer's pinpoint composer gets **Agreed** only (its restricted
  handler accepts no other label); it replaces the footer "Agreed" button.

The footer `Agreed` button (`quickLookGoodButton`) and the `onQuickAgree` prop
are removed.

**Agreed also leaves the selection toolbar.** The toolbar's Agreed button and
its `onQuickLabel` prop go: the label now lives at the top of the composer, and
two one-click Agreeds on the same selection is one too many. The toolbar keeps
Copy, Delete, Comment and Cancel.

## Owned files

- `packages/ui/utils/quickLabels.ts`
- `packages/ui/components/ComposerQuickLabels.tsx` (new)
- `packages/ui/components/CommentPopover.tsx` — props, `computeCommentPopoverPosition`, `quickLookGoodButton`, the position effect, the popover root.
- `packages/ui/hooks/useAnnotationHighlighter.ts` — `handleCommentSubmit` and the return value.
- `packages/ui/components/Viewer.tsx` — the highlighter destructure (~line 420) and the hook composer (~line 1139).
- `packages/ui/components/html-viewer/HtmlViewer.tsx` — the pinpoint composer (~line 817) and the toolbar's `onQuickLabel` (~line 805).
- `packages/ui/components/AnnotationToolbar.tsx` — the Agreed button and its prop.

## 1. `packages/ui/utils/quickLabels.ts`

Append:

```ts
/**
 * The labels floating above an anchored composer. One click saves a comment
 * with the label's text and tip. Agreed comes first and carries no tip.
 */
export const COMPOSER_QUICK_LABELS: QuickLabel[] = [
  AGREED_LABEL,
  { id: 'needs-explanation', emoji: '', text: 'Needs explanation', color: 'yellow', tip: 'Explain the reasoning behind this before going further.' },
  { id: 'verify-this', emoji: '', text: 'Verify this', color: 'orange', tip: 'This seems like an assumption. Verify by reading the actual code before proceeding.' },
  { id: 'give-an-example', emoji: '', text: 'Give an example', color: 'cyan', tip: 'This is too abstract. Show a before/after, a sample input/output, or a specific scenario so I can see how this actually works.' },
  { id: 'out-of-scope', emoji: '', text: 'Out of scope', color: 'red', tip: 'This is not part of the current task. Remove it and stay focused on what was actually requested.' },
  { id: 'needs-tests', emoji: '', text: 'Needs tests', color: 'blue' },
];
```

## 2. `packages/ui/components/ComposerQuickLabels.tsx` (new)

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AGREED_LABEL, type QuickLabel } from '../utils/quickLabels';

/** Dot colour per label colour key. Agreed shows a check instead. */
const DOT_CLASS: Record<string, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  orange: 'bg-orange-400',
  cyan: 'bg-cyan-400',
  red: 'bg-destructive',
  blue: 'bg-primary',
};

interface ComposerQuickLabelsProps {
  labels: readonly QuickLabel[];
  onSelect: (label: QuickLabel) => void;
  /** Faded out and inert while the composer has content. */
  hidden: boolean;
  /** Dialled in CommentPopover: chip height, the gap between chips, and how
   *  wide the clipped edges fade. */
  chipHeight: number;
  gap: number;
  fade: number;
}

/**
 * One line of label chips above the composer. A vertical wheel scrolls it
 * sideways; the clipped edges fade. No tooltips.
 */
export const ComposerQuickLabels: React.FC<ComposerQuickLabelsProps> = ({ labels, onSelect, hidden, chipHeight, gap, fade }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft > 1,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    measure();
    // Non-passive, so a wheel over the row scrolls it instead of the page.
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      observer.disconnect();
    };
  }, [measure]);

  const fadeStart = `transparent, black ${fade}px`;
  const fadeEnd = `black calc(100% - ${fade + 8}px), transparent`;
  const mask = edges.start && edges.end
    ? `linear-gradient(to right, ${fadeStart}, ${fadeEnd})`
    : edges.start
      ? `linear-gradient(to right, ${fadeStart})`
      : edges.end
        ? `linear-gradient(to right, ${fadeEnd})`
        : undefined;

  return (
    <div
      data-quick-labels="true"
      aria-hidden={hidden ? 'true' : undefined}
      className={`transition-opacity duration-150 motion-reduce:transition-none ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div
        ref={rowRef}
        role="toolbar"
        aria-label="Quick labels"
        onScroll={measure}
        className="flex items-center overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap, ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}
      >
        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            tabIndex={hidden ? -1 : 0}
            onClick={() => onSelect(label)}
            style={{ height: chipHeight }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card pl-2 pr-2.25 text-2xs font-medium text-foreground/85 shadow-[0_1px_2px_rgb(0_0_0/0.3),0_6px_14px_-6px_rgb(0_0_0/0.6)] transition-colors hover:bg-muted hover:text-foreground"
          >
            {label.id === AGREED_LABEL.id ? (
              <svg className="size-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[label.color] ?? 'bg-muted-foreground'}`} />
            )}
            {label.text}
          </button>
        ))}
      </div>
    </div>
  );
};
```

## 3. `CommentPopover.tsx`

1. Imports (top of file):
   ```ts
   import type { QuickLabel } from '../utils/quickLabels';
   import { ComposerQuickLabels } from './ComposerQuickLabels';
   ```
2. In `interface CommentPopoverProps`, replace the `onQuickAgree` doc comment and prop with:
   ```ts
   /** Label chips floating above an anchored composer. A click saves a comment
    *  with that label; the host creates the annotation and closes the composer.
    *  Ignored for global comments. */
   quickLabels?: readonly QuickLabel[];
   onQuickLabel?: (label: QuickLabel) => void;
   ```
   In the component's destructured props, replace `onQuickAgree,` with `quickLabels,` and `onQuickLabel,`.
3. Leave `const GAP = 8;` as it is. The label lane is dialled instead — see
   step 5.
4. `computeCommentPopoverPosition` gains a third parameter. Replace its signature and first lines through `const top = …;` with:
   ```ts
   export function computeCommentPopoverPosition(
     anchorRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>,
     bounds: VisibleViewportBounds,
     labelsLane = 0,
   ): CommentPopoverPosition {
     const spaceBelow = Math.max(0, bounds.bottom - anchorRect.bottom - GAP - labelsLane);
     const spaceAbove = Math.max(0, anchorRect.top - bounds.top - GAP - labelsLane);
     const flipAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
     const width = Math.min(MAX_POPOVER_WIDTH, bounds.width);

     // Below the anchor the label row sits between the anchor and the card, so
     // the card moves down by the lane. Above the anchor the row sits above the
     // card, so only the available height shrinks.
     const top = flipAbove
       ? anchorRect.top - GAP
       : anchorRect.bottom + GAP + labelsLane;
   ```
   The rest of the function is unchanged.
5. Just after `const hasUnsavedContent = …` add:
   ```ts
   const labelDials = useDialKit('03 · Quick labels', {
     chipHeight: [24, 18, 32, 1],
     /** Between the row and the card, and between the row and the anchor. */
     cardGap: [8, 2, 16, 1],
     gap: [6, 2, 12, 1],
     /** Width of the fade over a clipped edge of the row. */
     fade: [36, 16, 64, 4],
   }, { id: 'cl-03', persist: true });
   const showQuickLabels = !isGlobal && !!onQuickLabel && (quickLabels?.length ?? 0) > 0;
   // Room reserved above the card, so the row never covers the document and
   // the card does not move when the row fades out.
   const labelsLane = showQuickLabels ? labelDials.chipHeight + labelDials.cardGap : 0;
   ```
   `useDialKit` is already imported by spec 01.
   Move these two lines above the position-tracking effect if `hasUnsavedContent` is declared after it (it is not at `684b9c6e`).
6. In the position-tracking effect (`const nextPosition = computeCommentPopoverPosition(rect, visibleBounds);`) pass the lane: `computeCommentPopoverPosition(rect, visibleBounds, labelsLane)`, and add `labelsLane` to that effect's dependency array.
7. Delete the whole `quickLookGoodButton` constant (the comment `// Shared by both footers…` through its `) : null;`) and the `{quickLookGoodButton}` line in the action row.
8. In the popover-mode root (`<div ref={popoverRef} data-comment-popover="true" className={`group/composer fixed …`}`), insert directly after its `onPointerDown={(e) => e.stopPropagation()}` / `>` line, before the `<style>` element:
   ```tsx
        {showQuickLabels && quickLabels && onQuickLabel && (
          <div className="absolute inset-x-0" style={{ bottom: `calc(100% + ${labelDials.cardGap}px)` }}>
            <ComposerQuickLabels
              labels={quickLabels}
              onSelect={onQuickLabel}
              hidden={hasUnsavedContent}
              chipHeight={labelDials.chipHeight}
              gap={labelDials.gap}
              fade={labelDials.fade}
            />
          </div>
        )}
   ```
   Nothing is added in dialog mode.

## 4. `useAnnotationHighlighter.ts`

1. `handleCommentSubmit` (line 1199) takes the tip and forwards it:
   ```ts
   const handleCommentSubmit = (text: string, images?: ImageAttachment[], quickLabelTip?: string) => {
   ```
   - the `createAnnotationFromMathSource(…)` call (1202–1207) gets `quickLabelTip` as a fifth argument after `images`;
   - the `createAnnotationFromSource(…)` call (1214–1217) gets `quickLabelTip` as a sixth argument after `images`.
2. After `handleCommentSubmit` add:
   ```ts
   const handleCommentQuickLabel = (label: QuickLabel) => {
     handleCommentSubmit(formatQuickLabel(label), undefined, label.tip);
   };
   ```
3. Return object (~line 1236): add `handleCommentQuickLabel,` after `handleCommentSubmit,`.
4. The return type interface (~line 271–275): change `handleCommentSubmit`'s type to `(text: string, images?: ImageAttachment[], quickLabelTip?: string) => void;` and add `handleCommentQuickLabel: (label: QuickLabel) => void;`.

`QuickLabel` and `formatQuickLabel` are already imported in this file.

## 5. `Viewer.tsx`

1. Line 44 becomes `import { COMPOSER_QUICK_LABELS } from '../utils/quickLabels';`
   — after step 7 nothing in this file uses `QuickLabel` or `formatQuickLabel`,
   and the strict-consumer typecheck fails on either left behind.
2. In the `useAnnotationHighlighter` destructure (~line 426), after `handleCommentSubmit: hookCommentSubmit,` add `handleCommentQuickLabel: hookCommentQuickLabel,`.
3. The hook composer (~line 1139): add two props after `onClose={hookCommentClose}`:
   ```tsx
              quickLabels={COMPOSER_QUICK_LABELS}
              onQuickLabel={hookCommentQuickLabel}
   ```
   Leave the second `CommentPopover` (global and code-block, ~line 1151) alone.

## 6. `HtmlViewer.tsx`

1. Below the imports add:
   ```ts
   /** Comment-only surfaces may emit Agreed and nothing else. */
   const HTML_QUICK_LABELS = [AGREED_LABEL];
   ```
2. In the pinpoint composer (~line 817–836) replace
   ```tsx
              // Pinpoint clicks open this composer directly, so it carries
              // the surface's one-click "Agreed" (the global composer does
              // not: a document-wide Agreed is not a thing).
              onQuickAgree={hook.handleCommentAgree}
   ```
   with
   ```tsx
              // Pinpoint clicks open this composer directly, so it carries
              // the surface's one-click Agreed as a label chip (the global
              // composer does not: a document-wide Agreed is not a thing).
              quickLabels={HTML_QUICK_LABELS}
              onQuickLabel={hook.handleCommentAgree}
   ```

## 7. `AnnotationToolbar.tsx`

1. Delete the `onQuickLabel` prop from `AnnotationToolbarProps` (line 26) with
   its doc line (~30), from the destructured props (line 50), and the
   `{onQuickLabel && (<ToolbarButton … Agreed … />)}` block (lines 213–219).
2. Delete the now-unused `AgreedIcon` component and the
   `import { type QuickLabel, AGREED_LABEL } from "../utils/quickLabels";`
   line (5) if nothing else in the file uses either.
3. Remove every `onQuickLabel` the toolbar is given, and whatever that leaves
   unused:
   - `Viewer.tsx` line 1035, `onQuickLabel={handleQuickLabel}`, and line 1089,
     `onQuickLabel={handleCodeBlockQuickLabel}` (the code-block toolbar loses
     its Agreed too).
   - `Viewer.tsx` line 424: drop `handleQuickLabel,` from the
     `useAnnotationHighlighter` destructure.
   - `Viewer.tsx` lines 723–732: delete `handleCodeBlockQuickLabel` whole.
   - `HtmlViewer.tsx` ~line 804–806: delete the `onQuickLabel={(label) => {…}}`
     arrow and the four comment lines above it that explain it (798–803). Keep
     `commentOnly`. `AGREED_LABEL` stays imported — `HTML_QUICK_LABELS` uses it.

`handleQuickLabel` stays on `useAnnotationHighlighter` and `useHtmlAnnotation`
(it is returned, so it is not an unused local); spec 09 deletes it if nothing
calls it by then.

## Do not

- Do not bring back the label picker, label settings, emoji or `LABEL_COLOR_MAP`.
- Do not add `title` attributes or tooltips to chips.
- Do not render labels in `PlanCleanDiffView`, `AnnotationPanel`, `CodeFilePopout` or the review editor.

## Completion

- `rg -n "onQuickAgree|quickLookGoodButton" packages --glob '!**/dist/**'` → nothing.
- `rg -n "title=" packages/ui/components/ComposerQuickLabels.tsx` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook` on a markdown plan: select text → Comment:
  - six chips float above the card, one line; the wheel over them scrolls sideways and the edges fade;
  - the DialKit panel shows an **03 · Quick labels** section; `chipHeight`, `cardGap`, `gap` and `fade` change the open row, and the card moves with the lane so the row never overlaps it;
  - hovering a chip shows no tooltip;
  - type a letter → chips fade; delete it → they return; the card does not move either time;
  - click **Verify this** → a comment "Verify this" is saved and the composer closes; the exported feedback includes the tip;
  - open a global comment → no chips;
  - the selection toolbar shows Copy, Delete, Comment, Cancel and no Agreed.
- On an HTML document, pinpoint an element → one **Agreed** chip above the card and no Agreed button in the footer; clicking it saves Agreed.
