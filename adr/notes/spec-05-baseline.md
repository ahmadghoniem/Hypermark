# Spec 05 — Baseline and Reproduction Investigation

**Date:** 2026-09-07  
**Status:** Step 1 Baseline findings for `spec/05-comments-and-attachments.md`

---

## 1. Executive Summary

Investigation of the reported issue ("selected image does not appear in the composer") reveals two distinct root causes across separate surfaces:

1. **Document and Raw-HTML Annotation (`CommentPopover`):**
   When an image is selected via `AttachmentsButton`, it is intercepted by the modal `ImageAnnotator`. After user acceptance in `ImageAnnotator`, `UploadTransport.upload(file)` completes successfully, and the resulting `{ path, name }` is appended to `CommentPopover`'s internal `images` state array. However, `CommentPopover`'s JSX layout (`CommentPopover.tsx:572-625` dialog, `711-764` popover) **contains no thumbnail strip inside the composer body**. The only visual indicator rendered in the composer is a 20×20px stacked avatar icon inside the `AttachmentsButton` trigger button in the footer. The actual thumbnail list and remove controls only exist inside `AttachmentsButton`'s own sub-popover, which closed when file selection occurred (`AttachmentsButton.tsx:123`).
   Furthermore, pasting an image into the composer textarea fails to attach to the comment: `CommentPopover` has no paste handler, and `AttachmentsButton`'s paste listener early-returns when its sub-popover is closed (`AttachmentsButton.tsx:100`). The paste event instead bubbles to the document root where `packages/editor/App.tsx:3054-3074` attaches the image to the document-level `globalAttachments`, completely bypassing the active comment composer.

2. **Code Review (`packages/review-editor`):**
   `AnnotationToolbar` and `ExpandedCommentDialog` share no code or components with `CommentPopover`. They have **zero image UI, zero image state, and zero transport wiring**. Neither `useAnnotationToolbar.ts` nor `AnnotationToolbar.tsx` nor `ExpandedCommentDialog.tsx` renders an `AttachmentsButton` or calls `UploadTransport`. Even though `CodeAnnotation` in `packages/ui/types.ts:230` contains an optional `images?: ImageAttachment[]` field, the code-review composer provides no way to populate it, and `exportFeedback.ts:155-211` does not format images on code annotations.

---

## 2. Surface-by-Surface Trace

### Surface 1: Markdown Document Annotation (`CommentPopover`)

- **Picker / Trigger Seam:**
  - `packages/ui/components/CommentPopover.tsx:616` (dialog mode footer) and `line 755` (popover mode footer):
    Renders `<AttachmentsButton images={images} onAdd={(img) => setImages((prev) => [...prev, img])} onRemove={(path) => setImages((prev) => prev.filter((i) => i.path !== path))} variant="inline" />`.
  - `packages/ui/components/AttachmentsButton.tsx:62, 214-268`:
    User clicks trigger button (`buttonRef`), setting `isOpen = true`.
  - `packages/ui/components/AttachmentsButton.tsx:302-342`:
    Renders portal drop zone and `<input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} />`.
- **Image Selection & Modal Interception:**
  - `packages/ui/components/AttachmentsButton.tsx:118-124`:
    ```ts
    const handleFileSelect = (file: File) => {
      const initialName = deriveImageName(file.name, images.map(i => i.name));
      const blobUrl = URL.createObjectURL(file);
      setAnnotatorImage({ file, blobUrl, initialName });
      setIsOpen(false); // Closes AttachmentsButton popover!
    };
    ```
    Selection sets `annotatorImage` and immediately sets `isOpen = false`, closing the file picker popover.
  - `packages/ui/components/AttachmentsButton.tsx:398-407`:
    Mounts `<ImageAnnotator isOpen={annotatorOpen} imageSrc={annotatorSrc} onAccept={handleAnnotatorAccept} onClose={handleAnnotatorClose} />` into `document.body`.
- **Network / Transport Result:**
  - `packages/ui/components/AttachmentsButton.tsx:126-161`:
    User clicks "Accept" in `ImageAnnotator`. `handleAnnotatorAccept` executes:
    ```ts
    const data = await getUploadTransport().upload(fileToUpload);
    if (data.path) {
      onAdd({ path: data.path, name });
    }
    ```
    `UploadTransport.upload(file)` executes. The transport resolves with `{ path: string, originalName?: string }`.
- **State Transition:**
  - In `CommentPopover.tsx:618, 757`:
    `onAdd` callback updates `images` state: `setImages((prev) => [...prev, img])`.
  - `CommentPopover.tsx:88-97`:
    `useCommentDraftSync(draftKey, text, images)` updates module-level `draftStore`.
  - `CommentPopover.tsx:181, 482`:
    `hasUnsavedContent` becomes `true` via `hasUnsavedCommentContent(text, images)`. The submit button `canSubmit` enables.
- **Observed Presentation Failure in Composer:**
  - `CommentPopover.tsx:572-597` (dialog) and `lines 711-736` (popover):
    The composer body only renders `<ComposerTextarea ... />`.
  - **There is no thumbnail strip inside the composer body** (no elements between the textarea and the footer row).
  - In the footer row, `AttachmentsButton` receives `images.length > 0`. Because `variant === 'inline'`, it renders only a 20×20px stacked thumbnail icon with the label hidden (`AttachmentsButton.tsx:224-267`).
  - The actual thumbnails with remove buttons (`AttachmentsButton.tsx:364-389`) exist only inside `AttachmentsButton`'s portal popover when `isOpen === true`. Since `isOpen` was set to `false` at line 123 when the file was selected, the thumbnails remain invisible to the user.
- **Paste Flow Anomaly:**
  - When typing in `CommentPopover`'s textarea, pressing `Mod+V` with an image in clipboard does not trigger `AttachmentsButton`'s paste listener (`AttachmentsButton.tsx:100` returns immediately because `!isOpen`).
  - The paste event bubbles to `packages/editor/App.tsx:3054-3074`.
  - `App.tsx` opens a separate `ImageAnnotator` session and on accept calls `setGlobalAttachments(prev => [...prev, { path: data.path, name }])` (`App.tsx:3072`).
  - State transition: The image is added to `globalAttachments` at the document root, not to the active `CommentPopover`!

---

### Surface 2: Raw-HTML Annotation (`HtmlViewer.tsx`)

- **Picker / Trigger Seam:**
  - `packages/ui/components/html-viewer/HtmlViewer.tsx:936-957`:
    Pinpoint comment creation opens `<CommentPopover ... />` for element comments.
  - `packages/ui/components/html-viewer/HtmlViewer.tsx:962-971`:
    "Global comment" toolbar button opens `<CommentPopover isGlobal={true} ... />`.
- **Execution & Presentation:**
  - Identical to Surface 1: `HtmlViewer` directly reuses `CommentPopover.tsx`.
  - Image selection via `AttachmentsButton` passes through `ImageAnnotator` and `UploadTransport.upload(file)`.
  - State updates `images` inside `CommentPopover`.
  - No thumbnail strip is rendered in the composer body.
  - No HTML-specific paste handler exists; paste in `HtmlViewer` routes to `App.tsx:setGlobalAttachments`.

---

### Surface 3: Code Review (`packages/review-editor`)

- **Toolbar / Composer Seam:**
  - Floating toolbar: `packages/review-editor/components/AnnotationToolbar.tsx:43-256`.
  - Expanded dialog: `packages/review-editor/components/ExpandedCommentDialog.tsx:20-160`.
  - Hook / state owner: `packages/review-editor/hooks/useAnnotationToolbar.ts`.
- **Investigation of Image Seam in Code Review:**
  - `AnnotationToolbarProps` (`AnnotationToolbar.tsx:14-37`) contains:
    `commentText`, `setCommentText`, `suggestedCode`, `setSuggestedCode`, `conventionalLabel`, `decorations`, `onSubmit`, `onDismiss`, `onCancel`.
    **No `images` prop or image callback exists.**
  - `ExpandedCommentDialogProps` (`ExpandedCommentDialog.tsx:5-18`):
    **No `images` prop exists.**
  - `useAnnotationToolbar.ts:41-50` (`Draft` interface):
    ```ts
    interface Draft {
      commentText: string;
      suggestedCode: string;
      showSuggestedCode: boolean;
      conventionalLabel: ConventionalLabel | null;
      decorations: ConventionalDecoration[];
      range: SelectedLineRange;
      position: { top: number; left: number };
      tokenSelection?: TokenSelection;
    }
    ```
    **No `images` field in draft storage.**
  - `useAnnotationToolbar.ts:224-256` (`handleSubmitAnnotation`):
    Invokes `onAddAnnotation('comment', text, code, original, conventionalLabel, decorations, tokenMeta)`.
    **No image parameter is accepted or forwarded.**
  - `packages/review-editor/utils/exportFeedback.ts:155-211` (`formatFileAnnotations`):
    Formats line range, conventional label, text, reasoning, call-flow targets, selected text, and suggestions.
    **Does not check or format `ann.images`.**
- **Observed Failure:**
  - In Code Review, an image cannot reach the composer because there is no attachment UI, no paste handler, no drop zone, no hook state, and no export formatting.

---

## 3. Verified Entry Points and Seams Table

| File | Lines | Purpose / Behavior |
| --- | --- | --- |
| `packages/ui/components/AttachmentsButton.tsx` | 62, 118-124 | Picker state; `setIsOpen(false)` on file select hides thumbnails |
| `packages/ui/components/AttachmentsButton.tsx` | 140-149 | Upload execution: `await getUploadTransport().upload(fileToUpload)` |
| `packages/ui/components/AttachmentsButton.tsx` | 222-267 | Trigger button: renders 20×20 stacked thumbnail icon when `images.length > 0` |
| `packages/ui/components/AttachmentsButton.tsx` | 364-389 | Portal thumbnails: only rendered when `isOpen === true` (closed during normal composing) |
| `packages/ui/components/CommentPopover.tsx` | 175, 201 | `images` state initialized from draft or prop |
| `packages/ui/components/CommentPopover.tsx` | 572-597, 711-736 | Composer body: only `<ComposerTextarea>`, lacks thumbnail strip |
| `packages/ui/components/CommentPopover.tsx` | 616, 755 | Footer: renders `<AttachmentsButton variant="inline">` |
| `packages/review-editor/components/AnnotationToolbar.tsx` | 14-37, 43-256 | Code review floating composer: lacks all image UI |
| `packages/review-editor/components/ExpandedCommentDialog.tsx` | 5-18, 20-160 | Code review dialog composer: lacks all image UI |
| `packages/review-editor/hooks/useAnnotationToolbar.ts` | 41-50, 224-256 | Code review composer state: lacks `images` in `Draft` and `onAddAnnotation` |
| `packages/ui/utils/upload.ts` | 23-26, 43-56 | `UploadTransport` interface, `setUploadTransport`, `getUploadTransport` |
| `packages/ui/hooks/useAnnotationDraft.ts` | 127-142, 333-358 | Document draft persistence: reads legacy `g` and modern `globalAttachments` |
| `packages/ui/hooks/useCodeAnnotationDraft.ts` | 14-32, 122-174 | Review draft persistence: `CodeAnnotation[]` with optional `images` |
| `packages/editor/App.tsx` | 3040-3079 | Global paste handler: intercepts paste during comment compose and redirects to `globalAttachments` |
| `packages/review-editor/utils/exportFeedback.ts` | 155-211, 252-268 | Review export: ignores `ann.images` |

---

## 4. Distinction Between Review Toolbar and Document `CommentPopover`

`AnnotationToolbar` in `packages/review-editor` and `CommentPopover` in `packages/ui` are completely separate implementations:
- `CommentPopover` handles markdown document annotations and raw-HTML pinpoint comments. It has `images` state and an `AttachmentsButton` in its footer (though lacking an in-composer thumbnail strip).
- `AnnotationToolbar` is specific to the Pierre diff viewer and code review. It does not import `CommentPopover` or `AttachmentsButton`. Its state machine in `useAnnotationToolbar` does not track images.
- A fix or thumbnail strip added to `CommentPopover` will have **zero effect** on code review. Both must be wired independently in subsequent spec steps.
