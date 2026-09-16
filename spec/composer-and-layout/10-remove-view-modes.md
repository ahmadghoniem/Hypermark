# 10 — Remove the Wide | Focus view modes

Wave 3 — cut after wave 2 is merged, alongside 09 (no shared files: 09 edits
`AppHeader.tsx` and `Viewer.tsx`, this spec edits `App.tsx`).

The small `Wide | Focus` control above the document, and the `Mod+.` shortcut
that drives Focus, both hide the sidebar and the annotation panel — Wide also
widens the document past its reading column, the same thing the removed `wide`
plan width did. Both go, with the layout snapshot and restore machinery behind
them. The sidebar and the panel keep their own buttons.

Around 95 references, nearly all in `App.tsx`. Work top-down through the list;
every line number is from `684b9c6e`, and specs 04, 05 and 06 have already
edited this file, so **find each site by its quoted code, not by its line
number**.

## Owned files

- `packages/editor/App.tsx`
- `packages/ui/utils/wideMode.ts` (delete)
- `packages/ui/utils/wideMode.test.ts` (delete)
- `packages/ui/types.ts` — line 21 only.
- `packages/ui/shortcuts/plan-review/documentView.shortcuts.ts` (delete)
- `packages/ui/shortcuts/index.ts` — line 14 only.
- `packages/ui/shortcuts/surfaces.ts` — lines 10 and 41 only.

## Edits to `App.tsx`

1. **Imports.**
   - Delete line 70, the `@hypermark/ui/utils/wideMode` import.
   - Delete line 71, `import { modKey } from '@hypermark/ui/utils/platform';`
     — its only use is the tooltip in step 10.
   - Line 26 becomes
     `import { TooltipProvider } from '@hypermark/ui/components/Tooltip';`
     — `Tooltip` is used only in step 10; `TooltipProvider` stays (line 2313).
   - In the `@hypermark/ui/shortcuts` import (line ~76), delete
     `useDocumentViewShortcuts,`.
2. **State (lines 379–380).** Delete both:
   ```ts
   const [wideModeType, setWideModeType] = useState<WideModeType | null>(null);
   const wideModeSnapshotRef = useRef<WideModeLayoutSnapshot | null>(null);
   ```
3. **`exitWideMode` (lines 524–551).** Delete the whole `useCallback`.
4. **The three callbacks that exited it first (lines 553–576).** Delete each
   guard, leaving:
   ```tsx
     const openSidebarTab = useCallback((tab: SidebarTab) => {
       sidebar.open(tab);
     }, [sidebar.open]);

     const toggleSidebarTab = useCallback((tab: SidebarTab) => {
       sidebar.toggleTab(tab);
     }, [sidebar.toggleTab]);

     const handleAnnotationPanelToggle = useCallback(() => {
       setIsPanelOpen(prev => !prev);
     }, []);
   ```
5. **`canUseWideMode`, `enterViewMode`, `toggleViewMode` (lines 776–800)** and
   the effect right after them that exits when the mode is unavailable
   (lines 802–806): delete all four.
6. **The focus shortcut (lines 852–877).** Delete `handleToggleFocusMode` with
   its comment block, and the whole `useDocumentViewShortcuts({ … });` call.
7. **Effect guards.** Four effects open with `if (wideModeType !== null) return;`
   or test it in a dependency array. Delete the guard line and the
   `wideModeType,` dependency in each:
   - the table-of-contents auto-open effect (guard ~1147, dep ~1163 — spec 04
     already edited this effect);
   - the HTML chrome restore effect (guard ~1176, dep ~1192).
8. **Mobile panel effects (lines 1812–1813 and 1854–1855).** The condition
   drops the mode and the dependency array drops `wideModeType`:
   ```tsx
     if (id && isMobile) setIsPanelOpen(true);
   }, [isMobile]);
   ```
   and
   ```tsx
     if (isMobile) setIsPanelOpen(true);
   }, [codeAnnotations, codeFilePopout.open, isMobile]);
   ```
9. **`annotateReaderMaxWidth` (line 2225).** Delete the constant. Its five uses
   become `planMaxWidth` (spec 04 made that a plain number):
   - line 2417 `maxWidth={annotateReaderMaxWidth}` → `maxWidth={planMaxWidth}`;
   - line 2430 `style={annotateReaderMaxWidth == null ? undefined : { maxWidth: annotateReaderMaxWidth }}`
     → `style={{ maxWidth: planMaxWidth }}`;
   - line 2514 `maxWidth={isHtmlSurface ? null : annotateReaderMaxWidth}`
     → `maxWidth={isHtmlSurface ? null : planMaxWidth}`;
   - line 2546 `maxWidth={annotateReaderMaxWidth}` → `maxWidth={planMaxWidth}`;
   - line 2467 disappears with step 10.
10. **The toggle itself (lines 2464–2495).** Delete the whole
    `{canUseWideMode && !isPlanDiffActive && !isHtmlSurface && (…)}` block: the
    absolutely positioned wrapper, the `['wide', 'focus']` map, the `Tooltip`
    and the buttons. Keep the `<div className={`w-full relative …`}>` around it
    and everything after it.
11. **Remaining `wideModeType === null` conditions.**
    - Line 2368: `{wideModeType === null && !sidebar.isOpen && !(isHtmlSurface && htmlToolsHidden) && (`
      → `{!sidebar.isOpen && !(isHtmlSurface && htmlToolsHidden) && (`
    - Line 2391: `${!sidebar.isOpen && wideModeType === null ? 'lg:pl-7.5' : ''}`
      → `${!sidebar.isOpen ? 'lg:pl-7.5' : ''}`
    - Line 2590: `{isPanelOpen && wideModeType === null && <ResizeHandle …`
      → `{isPanelOpen && <ResizeHandle …`
    - Line 2595: `isPanelOpen && wideModeType === null,` → `isPanelOpen,`
    - Spec 06 mounts the message rail on
      `annotateSource === 'message' && recentMessages.length > 1 && wideModeType === null`
      — drop that last term too.

## Edits outside `App.tsx`

12. Delete `packages/ui/utils/wideMode.ts` and `packages/ui/utils/wideMode.test.ts`.
13. `packages/ui/types.ts` line 21: delete `export type WideModeType = 'wide' | 'focus';`.
14. Delete `packages/ui/shortcuts/plan-review/documentView.shortcuts.ts`.
15. `packages/ui/shortcuts/index.ts` line 14: delete the
    `documentViewShortcuts, useDocumentViewShortcuts` export line.
16. `packages/ui/shortcuts/surfaces.ts`: delete the import (line 10) and the
    `documentViewShortcuts,` entry of `planShortcutRegistry` (line 41). It is
    in no other registry, so the keyboard-shortcuts dialog loses its
    "Document View" section by itself.

## Do not

- Do not touch `htmlToolsHidden` or the HTML surface's own chrome state. It is
  a different feature with its own persistence, and the header's eye toggle
  still drives it.
- Do not remove the sidebar or the annotation panel, their buttons or their
  resize handles.
- Do not add a replacement control.

## Completion

- `rg -n "wideMode|WideMode|toggleViewMode|enterViewMode|documentViewShortcuts|toggleFocusMode" packages apps --glob '!**/dist/**'` → nothing.
- `rg -n "annotateReaderMaxWidth|modKey" packages/editor/App.tsx` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun test` green (the wideMode tests are gone; nothing else referenced them).
- `bun run dev:hook`:
  - no `Wide | Focus` control above the document, and `Mod+.` does nothing;
  - the keyboard-shortcuts dialog has no "Document View" section;
  - the sidebar and the annotation panel still open, close and resize from
    their own buttons, and the document stays in its centred column;
  - open an HTML document and toggle the header's eye: its chrome still hides
    and comes back.
