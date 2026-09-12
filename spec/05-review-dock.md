# 05 — Review dock: move collapse-all, remove the tab strip

The review app's centre is a `dockview-react` workspace with one permanent
panel (`All files`) and one optional side panel (`References: <symbol>`, opened
by Ctrl/Alt-click on a token). The tab strip survives only because collapse-all
lives in its right-actions slot. Move collapse-all to the header beside the
split/unified toggle, then remove dockview and the code-nav side panel.

## Owned files

- `packages/review-editor/App.tsx` — the dock block (lines ~404–447, 515–545, 560–580, 630–645, 2349–2356) and the header's diff-toggle cluster (~2160)
- `packages/review-editor/dock/**` (delete the directory)
- `packages/review-editor/components/AllFilesCodeView.tsx` — `onCodeNavRequest` prop and `handleTokenClick` (lines ~207, 397, 1485–1499)
- `packages/review-editor/hooks/useCodeNav.ts`, `useCodeNavPreview.ts`, `utils/buildCodeNavRequest.ts` (delete)
- `packages/review-editor/index.css` (dockview import + 17 `.dv-*` lines)
- `packages/server/code-nav.ts`, `packages/shared/code-nav.ts` (+ tests), the two `/api/code-nav/*` routes in `packages/server/review.ts:1076–1110` (delete)
- root `package.json`: `dockview-react` dependency (spec 11 also runs knip; remove it here so the tree typechecks)

## 1. Collapse-all moves to the header

Today: `ReviewDockRightActions.tsx` (55 lines) renders a button that calls
`state.onToggleAllFilesCollapsed` and reads `state.allFilesAllCollapsed` from
`ReviewStateContext`. Both values originate in `App.tsx:191–199`.

Move: in `App.tsx`'s header, immediately left of the split/unified button
(`title="Split diff (switch to unified)"`, ~line 2162), render the same button
with the same `title`/`aria-label` pair (`Collapse all files` /
`Expand all files`), the same two-chevron SVG, and the header's icon-button
classes (copy the split/unified button's `className`). It reads
`allFilesAllCollapsed` and calls `onToggleAllFilesCollapsed` directly — no
context.

Order in the header, left to right: `[collapse-all] [split/unified] [diff options] [theme] [shortcuts]`.

## 2. Remove the dock

With the tab strip empty, dockview manages one panel. Replace it with the
panel's content.

In `App.tsx`:

- Delete `dockApi` state, `needsInitialDiffPanel`, `openAllFilesPanel`,
  `handleDockReady`, the `isAllFilesActive` sync (it is now always true — fold
  the flag to a constant `true` and let TypeScript flag dead branches), the
  initial-panel effect (~642), and the `DockviewReact` element (~2349).
- Render `<ReviewAllFilesDiffPanel />`'s body inline: the `AllFilesCodeView`
  with the same props (the panel file lists them; `ReviewStateContext` was
  only a prop bus for dockview, so pass them as props and delete the context).
  `CommitDescriptionHeader` stays as `leadingContent`.
- `openDiffFile` (~421) called `dockApi` to activate the panel before
  scrolling; drop the activate, keep the scroll.

Delete `packages/review-editor/dock/` entirely (5 files, 201 lines + the
code-nav panel, 266).

## 3. Remove code navigation

The only other dock panel. Trigger: Ctrl/Alt-click on a diff token
(`AllFilesCodeView.tsx:1485–1499`), which posts to `/api/code-nav/resolve`
(a ripgrep over the checkout) and opens `References: <symbol>` beside the
diff. This is the surviving half of the token-hover pipeline removed in
`18e8180f`; without a dock there is nowhere to put its panel.

Delete: `hooks/useCodeNav.ts`, `hooks/useCodeNavPreview.ts`,
`utils/buildCodeNavRequest.ts`, `dock/panels/ReviewCodeNavPanel.tsx`,
`server/code-nav.ts` (86), `shared/code-nav.ts` (+ `code-nav.test.ts`, 562),
the two routes in `server/review.ts`, the `onCodeNavRequest` prop and
`handleTokenClick`'s meta/ctrl/alt branch in `AllFilesCodeView.tsx`, and the
`codeNav.*` state in `App.tsx` (515–545, 630–635, 1578–1595). Total ≈ 1,012
lines + routes.

`packages/review-editor/workerPool.tsx` mentions code-nav in a comment only;
leave it.

## 4. CSS and dependency

`review-editor/index.css:4` imports `dockview-react/dist/styles/dockview.css`;
lines ~40–60 map dockview variables to theme tokens. Delete both blocks.
Remove `dockview-react` from root `package.json` and run `bun install` so
`bun.lock` follows.

## Open questions

None. The maintainer named the tab strip; the dock and code-nav go because
nothing else needs them.

## Completion

- `ls packages/review-editor/dock` → does not exist.
- `rg -n "dockview|DockviewReact|useCodeNav|code-nav|onCodeNavRequest" packages apps --type ts` → nothing; `rg -n dockview package.json bun.lock packages/review-editor/index.css` → nothing.
- Behaviour, `bun run dev:review`: no tab strip above the diff; a collapse-all chevron button sits left of the split/unified toggle; clicking it collapses every file and flips to `Expand all files`; Ctrl-click on a token does nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- Net ≈ 1,500 lines and one dependency.
