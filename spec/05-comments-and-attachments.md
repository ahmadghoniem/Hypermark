# 05 — Gutter comments and comment-owned attachments
**Status:** implementation specification; no product change is authorized by this file alone.

**Depends on:** [01's shared rules](01-foundation-and-scope.md),
[02's retained serializer boundary](02-feature-removal-and-claude.md), and
[03's verified renderer baseline](03-theme-icons-and-fonts.md).

**Owns:** code-review gutter comment presentation and the migration from global images to
comment-owned attachments.

**Does not own:** feature removal, Claude command work, themes/icons/fonts, file tree,
branding, package rename, release, storage-root migration, or a durable asset store.
## 1. Goal and non-goals

Make a code comment live at its code location: hover a gutter marker to preview it; click
or keyboard-activate it to pin a focusable popover; choose **Edit** to turn that *same*
popover into the complete comment composer. Images belong at the bottom of that composer as
compact visual thumbnails, not as filename-and-size attachment cards.
This is the approved D8 direction in
[`adr/specs/hypermark-fork-spec-20260905.md`](../adr/specs/hypermark-fork-spec-20260905.md)
and [`adr/specs/hypermark-design-decisions-20260905.md`](../adr/specs/hypermark-design-decisions-20260905.md).
The interaction reference is the synthetic-only
[`adr/prototypes/hypermark-design`](../adr/prototypes/hypermark-design/README.md) fixture.
It demonstrates layout and draft semantics only; it is not the product renderer, upload
transport, persistence proof, or a root-cause fix.

Before changing product code, reproduce the reported "selected image does not appear in the
composer" flow against the current product. Record the exact surface, action, network result,
and state transition. Do not claim that `globalAttachments`, an upload error, or a rendering
bug is the cause until that reproduction establishes it.

Out of scope:

- permanent below-line cards, margin notes, or a second editor/composer in the right rail;
- a double-click-only edit affordance (double-click may be an optional convenience later);
- author/"You" labels, avatars, timestamps, or ordinal/count chrome in the single-user popup;
- a soft-fill/gutter-only diff preference or reduction of red/green change fills;
- automatic approval of unrelated open decisions, scope expansion, durable image storage,
  garbage collection, or data-directory changes;
- copying, committing, or uploading the user-provided images. This document is standalone
  text; use the prototype as its visual reference.

## 2. Existing seams to preserve and inspect

Treat local source as authority at implementation time; these are verified entry points, not
permission to blindly rewrite them.

| Concern | Current entry points / contract |
| --- | --- |
| Single-file Pierre renderer | `packages/review-editor/components/DiffViewer.tsx`: `FileDiff`, `lineAnnotations`, `renderAnnotation` |
| Virtualized all-files renderer | `packages/review-editor/components/AllFilesCodeView.tsx`: `CodeView`, item updates, `renderAnnotation` |
| Current code annotation body | `packages/review-editor/components/InlineAnnotation.tsx` |
| Review state and mutation/undo/drafts | `packages/review-editor/App.tsx`, `packages/ui/hooks/useCodeAnnotationDraft.ts` |
| Review create/edit composer | `packages/review-editor/components/AnnotationToolbar.tsx`, `ExpandedCommentDialog.tsx`, `packages/review-editor/hooks/useAnnotationToolbar.ts` |
| Document comment composer and app bindings | `packages/ui/components/CommentPopover.tsx`, `packages/editor/App.tsx` |
| Existing picker/thumbnail | `packages/ui/components/AttachmentsButton.tsx`, `packages/ui/components/ImageThumbnail.tsx` |
| Image annotation overlay | `packages/ui/components/ImageAnnotator/index.tsx` |
| Upload seam | `packages/ui/utils/upload.ts` (`UploadTransport`) |
| Annotation/image/export formats | `packages/ui/types.ts`, `packages/ui/utils/parser.ts`, `packages/ui/utils/sharing.ts` |
| Review export/server transport | `packages/review-editor/utils/exportFeedback.ts`, `packages/server/review.ts`, `packages/server/annotate.ts`, `packages/server/index.ts` |
| Document draft race contract | `packages/ui/hooks/useAnnotationDraft.ts` |

`CodeAnnotation` in `packages/ui/types.ts` already has optional `images`, line range and
character-offset fields. Preserve that
model rather than creating a competing persisted range format. `AllFilesCodeView` is
virtualized and recycles DOM: one-shot DOM decoration is incorrect. Load the `pierre-guard`
skill before touching `DiffViewer.tsx`, `AllFilesCodeView.tsx`, `FileDiff`, `CodeView`,
`unsafeCSS`, or a shadow-DOM boundary, then verify the pinned package types before choosing a
Pierre integration approach.

The review toolbar is not the document `CommentPopover` and does not automatically inherit
its image UI. Trace and wire both creation/edit paths, mutation callbacks, image preview,
draft restore, feedback export and server validation; a thumbnail in one shared component
does not establish end-to-end review attachment support. Apply the bottom-thumbnail contract
to retained markdown/HTML comment composers too. Keep Global Comment and Copy Plan.

## 3. Required comment interaction

### 3.1 One canonical surface

1. Project each code annotation into a compact gutter marker in **both** `FileDiff` and
   virtualized `CodeView`; do not render the current permanent in-diff `InlineAnnotation`
   block as a second canonical editor.
2. Pointer hover opens a transient read-only preview. Pointer leave may close only when it is
   not pinned, focused, or editing. Click, Enter, and Space pin a persistent, focusable popup.
3. Every overlapping annotation at an anchor must be reachable in one ordered popup list.
   Each entry needs a distinguishable text snippet or anchor context; never use an `N of M`
   counter as the differentiator.
4. A pinned read-only entry has an explicit **Edit** action. It transforms that popup into the
   full composer at the same anchor. No separate side panel, duplicate composer, margin note,
   or below-line block may appear. A sidebar may remain navigation/listing only.
5. Hide presentation-only bylines, author/avatar, `You`, relative time, and ordinal/count
   labels. Keep source, author, creation time, provenance, and historical fields in data and
   exports; do not delete metadata to remove chrome.
6. Keep unified and split controls working. Existing red deletion and green addition fills
   remain visible on hover, pin, selection, and edit; no emphasis-reduction toggle is added.

### 3.2 Composer layout and attachment contract

The composer must visibly match this structure; exact pixels, colors, border radii, and
prototype CSS values are *reference only*, not a binding production palette:

```text
┌─ anchored comment popover ───────────────────────────────┐
│ selected-code context                         [close]    │
│ textarea: "Leave a comment…"                             │
│                                                          │
│ [ actual image thumbnail × ] [ thumbnail × ] …          │
│  image-only, horizontal/wrapping strip at composer bottom │
│ ───────────────────────────────────────────────────────  │
│ [Attach image]                         [Cancel] [Save]   │
└──────────────────────────────────────────────────────────┘
```

1. Place the thumbnail strip **inside** the composer, immediately after the textarea and
   before the attachment/cancel/save row. It is not an outside floating card or a footer-only
   preview. Image-only comments must be supported; do not leave a text-required submit guard
   that makes a successfully selected image impossible to send.
2. A normal attachment renders the actual image cropped/contained as a compact thumbnail with
   a small overlaid remove button. It must not default to a file card, generic icon, filename,
   or byte-size label. Filename is available through an accessible name plus hover/focus
   tooltip; it is not normal strip copy.
3. The remove control is pointer- and keyboard-accessible, has a specific accessible label
   such as "Remove <filename>", is focus-visible, and returns sensible focus (normally the
   attach action or neighboring thumbnail) after removal.
4. Loading, invalid, failed, and retrying uploads are the exception: show compact, explicit
   status and retry/removal controls in the strip. Never silently omit a selected attachment,
   discard its draft, or report success without a usable stored image reference.
5. Preserve supported picker, paste, and drop input paths. Validate real upload responses:
   require a successful HTTP status and a valid nonempty `path`; reject malformed/error
   responses, retain the file/preview and typed text on failure,
   allow retry, and prevent a failed new upload from replacing a prior saved image.
6. Reuse or carefully evolve the existing `UploadTransport` and image-source resolver. Do not
   introduce a new durable asset backend, image GC process, or separate asset/data-root scheme.
   Saved references can outlive temporary upload files: missing bytes must show an explicit
   unavailable-image state while preserving the comment/reference, never silently remove the
   attachment. Do not promise survival of temp-directory cleanup without an approved asset store.

## 4. State, migration, and lifecycle rules

### 4.1 Comment ownership and legacy compatibility

1. The end state is images only on individual comments/annotations and in their exports.
   Remove the global Images action and writable top-level `globalAttachments` state only after
   migration works across all readers/writers.
2. Read legacy tuple `a`/`g` and modern object drafts/`globalAttachments`. Convert the top-level
   image list into **one image-only `GLOBAL_COMMENT` per owning document/message**, preserving
   image names, order and references. The conversion must be deterministic/idempotent across
   restore/save retries without renumbering existing annotation IDs. Keep legacy readers;
   new writes use comment-owned attachments, not parallel top-level arrays. There is no
   approved expiry date for compatibility readers and no need to rewrite historical records.
3. Make ambiguous ownership explicit before coding. If a legacy global reference cannot be
   truthfully associated with a comment, preserve it through an explicit compatibility path or
   stop for approval; never invent a comment anchor or silently delete user content. This is
   for malformed/missing owner identity only: an ordinary top-level list with a known document
   already has the approved Global Comment conversion above and needs no new product decision.
4. Update retained exports (`exportAnnotations`, linked-document/message exports, review
   feedback, Download Annotations) and neutral legacy decoding so attached images appear with
   their comment. Sharing was removed in 02: do not rebuild share URLs or sharing serializers.
   Eliminate separate "Reference Images" output only after its input has a safe conversion.
5. Images must survive creating, editing, undoing/redoing, restoring, exporting, and sending
   their owning comment. They must not appear in an unrelated comment or document.

### 4.2 Draft behavior and races

1. Save routes through the ordinary annotated mutation, undo-history, and code-review draft
   pipeline; it must not create a parallel local-only comment store. One saved mutation is
   undoable/redoable with its image list.
2. **Cancel** abandons the edit draft and restores the last saved text/images. For a brand-new
   comment it removes the unsaved shell, including typed text/pending images that were never
   saved. **Save** clears only the matching edit draft.
3. Incidental close, Escape, pointer leave, scroll/re-anchor, virtualization recycle, layout
   switch, and ordinary viewer re-render preserve unfinished draft text/images for reopening,
   scoped by annotation id plus document/review identity. Escape closes the popup and returns
   focus to its marker; it does not delete an incidental draft. Deliberate Cancel is distinct.
4. Preserve the existing 500 ms debounce, pending-save flush, generation/tombstone semantics,
   submit/delete race protection, and recovery behavior in `useCodeAnnotationDraft` and
   `useAnnotationDraft`. A late autosave must not resurrect a submitted/deleted draft; an
   upload completion after cancel/delete/document switch must not mutate a stale comment.
5. Do not delete provenance or external annotations just because their presentation changes.
   Existing source-tagged annotations retain their non-human lifecycle and cannot accidentally
   become local draft writes.

### 4.3 Renderer anchoring and event boundaries

1. Project the annotation's persisted file path, side, `lineStart`/`lineEnd`, and optional
   `charStart`/`charEnd` consistently on old and new sides. Cover zero-height selections,
   line-end anchors, deleted/new-only lines, Unicode surrogate pairs/graphemes, wrapped lines,
   empty/context lines, and resized/reflowed diffs without changing source text or line data.
2. Implement the same lifecycle-aware projection in `DiffViewer` and `AllFilesCodeView`.
   For `CodeView`, reapply/update it whenever an item mounts, recycles, expands, collapses,
   receives full content, changes version, or is replaced after a diff switch. Markers must
   neither disappear nor leak to another file after virtualization.
3. The projection is presentation-only: source DOM/text stays byte-identical, normal selection
   and Pierre line utilities still work, and expansion/scroll anchoring keeps its current
   behavior. Do not write annotations into source or patch text.
4. Respect host/shadow-root boundaries and Pierre's supported APIs. Do not use brittle global
   selectors, cross-shadow hacks, or unsupported mutation assumptions. Do not steal native
   editor shortcuts, selection gestures, token-hover behavior, or edit-session shortcuts.
5. Keep range markers zero-layout-height and cover every visible line in a multi-line range,
   not only `lineEnd`. Preserve all overlapping IDs; hidden context must not gain a false
   visible anchor. A comment trigger takes precedence over token hover on that trigger only.
   Bound/reanchor the popup to the visible viewport and release detached references on recycle.
   File/general comments retain suitable non-range surfaces, and suggestions keep their full
   payload/edit behavior rather than being downgraded to plain text by the new popup.

## 5. Incremental implementation and verification

Perform these in order. Run the **full root `bun test` after each numbered implementation
step**, plus focused regression tests. Do not batch a failing earlier step into later work.

1. **Baseline and reproduction.** Capture current behavior with a synthetic review fixture,
   identify exact relevant call sites/types, reproduce the missing-image complaint, and add a
   regression test for the observed failure rather than a guessed cause. Load `pierre-guard`.
2. **Pure data and compatibility.** Add narrowly scoped normalizers/migration tests for legacy
   tuple `g` and `globalAttachments`, idempotence, explicit ambiguous handling, comment-owned
   export/restore, mutation history, and draft generation/tombstone races. Do not remove UI yet.
3. **Attachment composer.** Adapt the real `CommentPopover`/attachment seam to the thumbnail
   strip contract. Test picker/paste/drop, image-only save, filename access, remove focus,
   malformed response, failure retention, retry, Cancel, incidental close/reopen, and restored
   draft images. Test real transport validation, not only mock state.
4. **Single-file gutter.** Replace block presentation with hover/pinned/Edit popup behavior in
   `DiffViewer`. Test keyboard activation, overlapping snippets, Escape/focus return, unified
   and split persistent fills, line/range edge cases, and source-DOM invariance.
5. **Virtualized all-files gutter.** Apply the equivalent behavior to `AllFilesCodeView` and
   prove mount/recycle/full-content/reflow/diff-switch behavior under virtualization. Include
   independent multiple-file drafts and no marker leakage.
6. **Remove global UI last.** Once legacy fixtures, exports, restored drafts, and ordinary
   workflows prove safe, remove the global Images action/state and obsolete output path. Search
   all call sites, types, fixtures, and tests; retain only intentional compatibility readers.

For every step, add focused behavior tests in the owning package beside current annotation,
draft, `DiffViewer`, and `AllFilesCodeView` tests. Then run the relevant package suite plus the
root `bun test` required by the parent spec. Use isolated draft/data state and restore globals.
Do not weaken a pre-existing test merely to pass the migration.
Run maintained typechecks and build `bun run --cwd apps/review build` before
`bun run build:hook` after frontend changes. Add any new TSX directories to the appropriate
Tailwind `@source` paths so the tested styles exist in the built artifact.

After each UI-changing step, run **markdown, raw-HTML annotation, and code review** with safe
synthetic fixtures. Verify bottom-inside-composer image-only thumbnails, overlay removal,
image-only submission, real upload failure/retry, saved images and draft reopen on all three
surfaces, including disappearance of the global Images action after step 6. In code review,
also verify gutter hover→click→Edit, keyboard/Escape focus behavior, and unified/split fills
in single-file and all-files modes. Capture and inspect matching baseline/after evidence and
check browser console/network errors. Browser proof supplements,
never replaces, Bun tests. If renderer behavior, the actual upload failure, or browser evidence
contradicts this spec, stop at the demonstrated boundary and request the necessary decision;
do not broaden scope silently.

## 6. Acceptance checklist

- [ ] A selected image is visible as an image-only thumbnail **inside** the full composer;
  ordinary UI shows neither filename/size card nor default attachment label.
- [ ] Filename remains accessible on hover/focus and remove is accessible, visible on focus,
  and does not strand keyboard focus.
- [ ] Failed/malformed uploads remain visible with explicit retry/remove and preserve text.
- [ ] Save, Cancel, incidental dismiss/reopen, undo/redo, recovery, export, and legacy restore
  retain the correct image ownership without ghost drafts or duplicates.
- [ ] Gutter hover, click, keyboard pinning, explicit Edit, overlapping comments, and focus
  management work in single-file and virtualized all-files modes.
- [ ] No margin note, below-line comment card, duplicate right-side editor, metadata deletion,
  or new emphasis toggle was introduced; unified/split red/green fills persist.
- [ ] Tests and inspected browser evidence establish behavior; the prototype was not cited as
  proof that production upload or renderer integration works.
- [ ] Markdown, raw-HTML annotation, and code-review fixtures each prove image-only comments,
  bottom-thumbnail layout, upload recovery, draft restore, and unavailable temporary references.

Handoff: append completed step IDs, actual modified contracts, migration fixtures, command
results, browser evidence and any blocked gates as required by spec 01.
