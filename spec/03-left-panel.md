# 03 — Left panel: Messages tab and Files tab

Two changes to the plan app's left side panel. The Messages panel loses its
heading, its star and its gutter. The Files tab disappears from `annotate` and
`annotate-last` sessions.

## Owned files

- `packages/ui/components/sidebar/MessagesBrowser.tsx`
- `packages/ui/components/sidebar/SidebarContainer.tsx`
- `packages/ui/components/sidebar/SidebarTabs.tsx`
- `packages/editor/App.tsx` — only the `showFilesTab` derivation at line 1185 and the `sidebar.open('files')` at line 2728.

## 1. Messages panel

`MessagesBrowser.tsx` is 109 lines. Three edits, all inside the `return` at
lines 60–107.

1. **Heading.** Delete the `<div className="px-2 pt-1 pb-2 text-[10px] …">Recent messages — newest first</div>` (lines 62–64). The tab label already says Messages; the list order is visible from the timestamps.
2. **Star.** The `#N` span (lines 82–85) appends `" ★"` when `idx === 0`. Delete the conditional; the first row is already first.
3. **Gutter.** The same span is `w-8 shrink-0 text-right` — a fixed 32px column for a two-character index. Change it to `w-auto` with `tabular-nums`, or drop the index entirely. Pick: **drop the index**. The rows carry a timestamp and a preview; a number nobody types is dead space. That removes the span, so the row becomes `[preview + timestamp][count badge]`.

After the edit the row's text starts at `px-2` from the button edge. Verify in
the browser that `line-clamp-2` now clips noticeably later for a typical
message (run `bun run dev:hook`, the mock serves no messages — use
`annotate-last` on the Windows machine or temporarily seed `recentMessages` in
`apps/hook/dev-mock-api.ts`; do not commit the seed).

## 2. Files tab

Today `showFilesTab = !!projectRoot` (`editor/App.tsx:1185`). Every server
sends `projectRoot` (`server/index.ts:229`, `server/annotate.ts:670,730`), so
the tab shows in plan, annotate, annotate-last and annotate-folder alike.

The tab is the file picker for `hypermark annotate <folder>` (annotate-folder
mode opens it at `App.tsx:2728`; picking a file routes through
`handleFileBrowserSelect` at ~1427). It has no role in a single-file or
last-message session: there is one document and no second one to open.

Edit:

```ts
// editor/App.tsx:1185
const showFilesTab = annotateSource === 'folder';
```

`annotateSource` is set from `data.mode` at line ~2731, after `projectRoot`
lands; both live in the same `.then`, so the derived flag is stable by first
paint of the sidebar. Leave the `useFileBrowser()` hook, `SidebarContainer`'s
`showFilesTab` prop, and the folder-select handlers alone — they are live for
folder mode.

Plan mode (`hypermark` hook) also loses the tab under this rule. That is the
intended reading of "end to end": a plan has no files to open.

## Open questions

1. Does the maintainer use `hypermark annotate <folder>` at all? If not, the
   whole file browser goes: `FileBrowser.tsx` (623), `useFileBrowser.ts`
   (337), `server/reference-watch.ts`, `shared/file-browser-watch-core.ts`
   (385), the `/api/reference/files` + `/stream` routes in two servers, and
   `annotate-folder` in `annotate-resolution.ts` — about 1,500 lines. That is a
   spec 09 follow-up, not this spec.

## Completion

- `rg -n "newest first|★" packages/ui/components/sidebar/MessagesBrowser.tsx` → nothing.
- `rg -n "w-8 shrink-0" packages/ui/components/sidebar/MessagesBrowser.tsx` → nothing.
- `rg -n "const showFilesTab" packages/editor/App.tsx` → one hit, `annotateSource === 'folder'`.
- Behaviour: `bun run dev:hook`, open `http://localhost:3000` — the left panel shows `Contents` and `Versions` only (the mock is plan mode).
- `bun run typecheck && bun run typecheck:editors` green.
