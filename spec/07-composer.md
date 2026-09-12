# 07 — One composer: global comment fixes, and the review line composer becomes `CommentPopover`

Three maintainer observations about the composer, plus the structural fix
they point at: the review app still has its own line-comment composer
(`review-editor/components/AnnotationToolbar.tsx`, 236 lines + `ExpandedCommentDialog.tsx`, 217 + `useAnnotationToolbar.ts`, 368) while every
other comment in the product goes through `ui/components/CommentPopover.tsx`
(1,151). Editing an annotation in the plan sidebar uses a fourth, inline
textarea (`ui/components/AnnotationPanel.tsx:553–573`). Bring all of them to
`CommentPopover`.

Runs in wave 3, after spec 05 (which edits `AllFilesCodeView.tsx`) and spec
10 (which adds composer persistence to `CommentPopover`'s draft store).

## Owned files

- `packages/ui/components/CommentPopover.tsx`
- `packages/ui/components/AnnotationPanel.tsx` (the `editComposer` block and the two `isEditing` branches, lines 503–573, 649–670)
- `packages/review-editor/components/ToolbarHost.tsx`
- `packages/review-editor/components/AnnotationToolbar.tsx` (delete)
- `packages/review-editor/components/ExpandedCommentDialog.tsx` (delete)
- `packages/review-editor/hooks/useAnnotationToolbar.ts` (shrink to selection/anchor state)
- `packages/review-editor/components/AllFilesCodeView.tsx` — only the `toolbarHostRef` call sites (`startEdit`, `openLineAnnotation`, `handleLineSelectionEnd`)

## 1. Global comment fixes (`CommentPopover.tsx`)

1. **Top strip.** At `isGlobal` the strip already hides its contents
   (lines 810–830) but still renders a `rounded-t-xl py-1` div, 8px of wash
   above the body, and still carries `dragHandleProps`. Render nothing: the
   strip element is `!isGlobal && (<div …>)`. Move `dragHandleProps` for the
   global case onto the body's top padding region, or accept that a global
   composer is not draggable (it is anchored to a fixed header button — pick
   **not draggable**).
2. **Scroll owner.** The wash tier (line 801) is `overflow-y-auto` with
   `maxHeight: position.maxHeight`, so a long comment scrolls the whole card
   including the shelf and action row. Move the `maxHeight` to the textarea:
   the wash tier becomes `overflow-hidden`; the textarea's `sizeClassName`
   gets `max-h-[calc(<position.maxHeight>px - 8rem)]` via an inline `style`
   (strip 32 + shelf 40 + actions 44 + paddings ≈ 128px). The textarea already
   has `overflow-y-auto` from `field-sizing` growth. Dialog mode (`mode ===
   'dialog'`, line 673) already scrolls its own body; leave it.
3. **Resize grip.** `beginGripResize` (line 332) already applies only a
   vertical delta to `composerHeight`, but the grip's cursor is
   `cursor-nwse-resize` and it sits at the top-left corner, both of which say
   "diagonal". Change the cursor to `cursor-ns-resize`, move the grip to the
   top-centre of the body (`left-1/2 -translate-x-1/2 -top-[9px]`), and keep
   the inverted-delta drag (up = taller). Title: `Drag to resize`.

## 2. Plan sidebar edit uses the composer (`AnnotationPanel.tsx`)

Today the `Edit` action on a card sets `isEditing` and swaps the card body for
a `<textarea style={{ fieldSizing: 'content', minHeight: 44 }} className="…
text-base …">` with Cancel/Save buttons. It is larger than the card's display
text (`text-[13px]`) and looks like nothing else in the product.

Replace: `Edit` opens a `CommentPopover` anchored to the card
(`anchorEl = card element`, `contextText = annotation.originalText ?? 'Global comment'`,
`isGlobal = annotation.type === GLOBAL_COMMENT`, `initialText = annotation.text`,
`allowImages = true`, `draftKey = \`edit:${annotation.id}\``,
`onSubmit = (text, images) => onEdit({ text, images })`). Delete the
`editComposer` JSX, `editText`/`textareaRef` state and `handleKeyDown`. The
card body no longer has an editing state. Same change for the
`CodeAnnotationCard` at lines 715–830, which has a copy of the same textarea.

Because the review sidebar (`ReviewSidebar.tsx`) has no inline edit at all —
its `CommentActions` receives no `onEdit`, and editing happens from the gutter
popover — both sidebars now behave the same way: cards display; editing is a
composer.

## 3. Review line composer is `CommentPopover` (`ToolbarHost.tsx`)

`AnnotationToolbar.tsx` is a floating card positioned at the last mouse
position (`useAnnotationToolbar.ts:63,136–162`), with its own textarea,
attachment strip, attach button, `Add Comment`/`Update` button and an expand
control into `ExpandedCommentDialog`. `CommentPopover` already provides every
one of those (anchor placement, expand/collapse, shelf, Improve/Ask/Save, drag,
grip, `Ctrl ↵`).

Replace the render in `ToolbarHost.tsx` (lines ~53–140):

```tsx
{toolbar.toolbarState && (
  <CommentPopover
    anchorRect={toolbar.toolbarState.anchorRect}
    contextText={toolbar.editingAnnotationId ? 'Edit annotation' : formatLineRange(range.start, range.end)}
    isGlobal={false}
    initialText={toolbar.commentText}
    onSubmit={(text, images) => toolbar.submit(text, images)}
    onClose={toolbar.handleCancel}
    draftKey={`line:${filePath}:${range.start}-${range.end}`}
    allowImages
  />
)}
```

`CommentPopover` accepts `anchorRect?: DOMRect` (line 37) as an alternative to
`anchorEl`. `useAnnotationToolbar` gains `anchorRect` on `ToolbarState`,
computed from the selected line's gutter element at `openLineAnnotation` /
`startEdit` time (the `AllFilesCodeView` selection callbacks already receive
the `CodeViewItem`; use `getBoundingClientRect()` on the line row). Delete
`lastMousePosition`, `handleMouseMove`, `showCommentModal`, `modalLayout`,
`expandedComposerRequired`, `images`/`setImages` (the popover owns
attachments), and the window `mousemove` listener in `ToolbarHost`.

Delete `AnnotationToolbar.tsx` and `ExpandedCommentDialog.tsx`. The
`review-toolbar-btn` CSS class (if any rule remains in `review-editor/index.css`)
goes with them.

Button label: `CommentPopover` says `Save`; the review composer said `Add Comment`.
Keep `Save` — spec 02's convention: the UI noun is "comment" in both apps, and
the composer's verb does not need the noun.

## Open questions

1. `Improve` and `Ask` are still unwired (`onClick={() => {}}`). This spec
   keeps them as they are; wiring is a feature, not a refinement.
2. Should the review composer keep `Ctrl ↵` submit-on-enter semantics identical
   to plan? Yes by construction — same component.

## Completion

- `ls packages/review-editor/components/AnnotationToolbar.tsx packages/review-editor/components/ExpandedCommentDialog.tsx` → both missing.
- `rg -n "lastMousePosition|showCommentModal|modalLayout|handleMouseMove" packages/review-editor` → nothing.
- `rg -n "fieldSizing|editComposer|setEditText" packages/ui/components/AnnotationPanel.tsx` → nothing.
- `rg -n "cursor-nwse-resize" packages/ui/components/CommentPopover.tsx` → nothing; `rg -n "cursor-ns-resize"` → one hit.
- Behaviour, `bun run dev:review`: select lines → the composer that opens is visually the `CommentPopover` (anchor strip, shelf, Improve/Ask/Save). Behaviour, `bun run dev:hook`: add a comment, press its Edit action in the right panel → the same popover opens anchored to the card, prefilled. Open a global comment → no strip above the textarea; type 30 lines → only the textarea scrolls.
- `bun run typecheck && bun run typecheck:editors` green.
- Net ≈ −700 lines.
