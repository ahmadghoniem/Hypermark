# Spec 05 — Step 4 design decisions (single-file gutter)

**Date:** 2026-09-07
**Scope:** `spec/05-comments-and-attachments.md` §3.1, §4.3, step 4.

These are the choices the gutter work makes, recorded before the renderer
integration so the reasoning is reviewable separately from the diff.

## 1. The marker is a zero-height overlay, not a row

Spec §4.3.5 requires range markers to be zero-layout-height. The marker is
therefore an absolutely positioned button inside a `height: 0` slot, pulled up
onto the annotated line with `translateY(-100%)`. The diff's own line boxes,
text, selection, and scroll anchoring are untouched: nothing is written into the
source DOM, and no line gains height.

## 2. The marker is styled inline, the popup through the app stylesheet

The marker renders inside the diff renderer's shadow root, where
`packages/review-editor/index.css` does not reach. Its visual is therefore
inline `style`, using CSS custom properties (`--primary`, `--border`,
`--popover`), which *do* inherit across a shadow boundary. That keeps the marker
themed by the same tokens as everything else without adding another `unsafeCSS`
selector to the Pierre surface guarded by the `pierre-guard` skill.

The popup is portaled to `document.body` — outside the shadow root — so it
reuses the existing `.review-comment` styling and is bound to the visible
viewport rather than clipped by the diff's scroll container.

## 3. Hover previews are read-only; pinning grants the actions

§3.1.2 separates a transient hover preview from a pinned, focusable popup. The
preview shows the comment body and nothing actionable; Edit and Delete appear
only once the popup is pinned by click, Enter, or Space. A pinned popup never
demotes back to a preview, and a pointer leave closes only an unpinned one
(after a short grace period so the pointer can travel to the popup).

## 4. Escape returns focus without reopening

Escape closes the popup and focuses its marker (§4.2.3). Because a focused
marker otherwise opens a preview, the controller suppresses exactly that one
focus event; tabbing back to the marker later still opens a preview normally.
Escape never discards a draft — that remains Cancel's job in the composer.

## 5. Edit hands off to the existing review composer, at the same anchor

§3.1.4 requires the pinned entry's **Edit** to become the full composer at the
same anchor, with no second composer, side panel, or below-line block.

The review composer already exists (`AnnotationToolbar` / its expanded dialog),
owns suggestions, conventional labels, decorations, the draft/undo pipeline, and
— as of step 3's sibling work — attachments. Re-implementing a composer inside
the popup would create exactly the duplicate surface the spec forbids, and would
fork the draft-race contract in `useCodeAnnotationDraft`.

So Edit closes the read-only popup and opens that one composer anchored at the
same marker. At any moment there is a single surface at the anchor: preview, or
pinned list, or composer — never two. This is a deliberate reading of "transforms
that popup into the full composer": one surface at one anchor, sequentially, not
a second editor built inside the popup.

## 6. What overlapping annotations look like

Every annotation at an anchor is listed in one ordered popup, each entry
carrying its own text so entries are told apart by content, never by an
"N of M" counter (§3.1.3). Author, avatar, "You", relative time, and profile
badges are omitted from this surface (§3.1.5) — the fields stay in the data and
in exports; only the chrome is gone. Severity dots and conventional labels stay:
they are comment content, not identity chrome.
