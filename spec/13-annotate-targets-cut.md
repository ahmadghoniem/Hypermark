# 13 — Annotate: local files only

Maintainer decision: `hypermark annotate` keeps local files (`.md`, `.mdx`,
`.txt`, `.html`) and the last-message mode (`annotate-last`). Remove the
three other target kinds, end to end:

- **Live-app annotate** — `http://localhost:…` proxied through a loopback
  reverse proxy with an injected bridge (`annotate-app` mode, `--app`,
  `--static`).
- **Remote URL annotate** — `https://…` fetched through Jina Reader or
  fetch + Turndown and converted to markdown (`--no-jina`).
- **Folder annotate** — `hypermark annotate <folder>/` with the Files tab
  file picker (`annotate-folder` mode).

Wave 3. Spec 12 (wave 2) has already removed goal-setup from `editor/App.tsx`.

## Must keep (shared with local-file annotate)

Read this before deleting anything:

- `packages/ui/components/html-viewer/**` renders local `.html` files. Only its
  live-session props go (`liveSession`, `currentPageUrl`, `onPageChange`, `src`
  when used for the app URL). `bridge-script*.ts`, `srcdoc.ts`,
  `useHtmlAnnotation.ts` stay — remove only live-specific branches inside them.
- `packages/shared/html-to-markdown.ts` stays: local `.html` with `--markdown`
  (`annotate-resolution.ts:~260`) and `reference-handlers.ts:360,386` use it.
- `/api/reference/files/stream`, `handleFileBrowserFilesStream`,
  `packages/server/reference-watch.ts` and
  `packages/shared/file-browser-watch-core.ts` **stay**: `editor/App.tsx`
  (`sourceWatchSubscription`, ~2553–2594) uses that stream to reload an open
  local file when it changes on disk.
- `packages/shared/annotate-target.ts` (tolerant token resolution) stays;
  remove only its URL and folder probes.

## Owned files

Delete:

- `packages/server/live-proxy.ts`, `packages/server/live-proxy.test.ts`
- `packages/shared/live-proxy-core.ts`, `packages/shared/live-probe.ts`,
  `packages/shared/live-proxy-bridge-inline.test.ts`
- `apps/hook/server/annotate-live-resolution.test.ts`
- `scripts/live-annotate-smoke.sh`
- `packages/shared/url-to-markdown.ts`, `packages/shared/url-to-markdown.test.ts`
- `packages/ui/components/sidebar/FileBrowser.tsx` (+ `FileBrowser.test.ts`)
- `packages/ui/hooks/useFileBrowser.ts`

Edit:

- `apps/hook/server/annotate-resolution.ts` — delete the `isUrl` branch
  (~112–210: loopback probe, `forceApp`/`forceStatic`, Jina fetch) and the
  folder branch (~211+). A token that looks like a URL or names a directory
  now fails with a plain message: `hypermark annotate takes a file path`.
  Drop `liveApp`, `isUrl`, `folderPath`, `annotateMode: "annotate-folder"`
  from the result type (mode becomes `"annotate"` only). Update
  `annotate-resolution.test.ts` and `annotate-cli.test.ts`: delete URL and
  folder cases; add one case per removed kind asserting the error.
- `apps/hook/server/index.ts` — the `--no-jina`, `--app`, `--static` flag
  parsing (~189 and the annotate arm), `LIVE_BRIDGE_BOOTSTRAP`, the
  `liveApp`/`folderPath`/`isUrl` plumbing into `startAnnotateServer`, the
  folder session label, and the usage string (becomes
  `hypermark annotate <file.md | file.txt | file.html> [--markdown] [--gate] [--json] [--hook] [--require-approval] [--result-file <path>]`).
- `apps/hook/server/cli.ts` (+ `cli.test.ts`) — the same flags and target kinds in help text.
- `packages/server/annotate.ts` (+ `annotate.test.ts`) — `liveApp` option,
  proxy start/stop, `annotate-app` and `annotate-folder` modes in `/api/plan`,
  `folderPath`, and the `/api/reference/files` **tree** route (~972). Keep the
  `/stream` route.
- `packages/server/index.ts` — the `/api/reference/files` tree route (~341);
  keep `/stream`. `packages/server/reference-handlers.ts` — delete
  `handleFileBrowserFiles` if nothing else calls it (`rg -n handleFileBrowserFiles packages`).
- `packages/shared/annotate-target.ts` (+ test) — URL and folder probes.
- `packages/shared/config.ts` (+ test) — `resolveUseJina` and the jina config key.
- `packages/shared/package.json`, `packages/server/package.json` — export
  entries for deleted modules; root/package `package.json` — any dependency
  only `url-to-markdown.ts` used (check `turndown` and friends with
  `rg -n "from \"turndown" packages`; `html-to-markdown.ts` may still need it).
- `packages/editor/App.tsx` — `liveApp`/`livePageUrl` state and every use
  (~474–478, 1141, 2606, 2688–2700, 3247, 4483–4509), the `annotate-app` and
  `annotate-folder` mode handling, `annotateSource === 'folder'` branches
  (`'folder'` leaves the union), `useFileBrowser()` and
  `handleFileBrowserSelect`, the "Folder Feedback" title, the `file list` back
  label, and the `showFilesTab` derivation.
- `packages/ui/components/sidebar/SidebarContainer.tsx`, `SidebarTabs.tsx`,
  `packages/ui/hooks/useSidebar.ts` — the `files` tab and `showFilesTab`.
- `packages/ui/components/html-viewer/HtmlViewer.tsx`, `useHtmlAnnotation.ts`,
  `bridge-script.ts`, `hostThreads.ts`, `unanchored.ts` — live-session
  branches only. `packages/ui/scripts/build-bridge-assets.ts` — the live-proxy
  inline bridge output, if it builds one only for the proxy; regenerate
  `bridge-script.asset.js` with the script if it changes.
- `packages/shared/feedback-archive.ts`, `packages/shared/source-save-node.ts`,
  `packages/shared/resolve-file.ts`, `packages/shared/annotate-reference-roots-node.ts`,
  `packages/shared/review-workspace-node.ts`, `packages/core/agent-terminal.ts`,
  `packages/ui/configure.ts` — remove folder/live references
  (`rg -n "folderPath|annotate-folder|liveApp|annotate-app"`), keeping the
  single-file behaviour.
- Docs: `apps/skills/core/hypermark/SKILL.md`, `apps/skills/*/hypermark-annotate/SKILL.md`,
  `packages/ui/HANDOFF.md`, `README.md` / `apps/hook/README.md` — remove URL,
  localhost and folder usage.

## Procedure

1. Delete the files listed under Delete.
2. Run both typecheck lanes; fix each error by deleting the removed branch.
3. Run the greps below and clear what remains.
4. Run `bun test apps/hook/server packages/server/annotate.test.ts packages/shared packages/ui/components/html-viewer`.

## Completion

- `rg -n "live-proxy|live-probe|liveApp|LiveApp|annotate-app|forceApp|forceStatic|LIVE_BRIDGE" packages apps scripts` → nothing.
- `rg -n -i "urlToMarkdown|url-to-markdown|jina" packages apps` → nothing.
- `rg -n "annotate-folder|folderPath|FileBrowser|useFileBrowser|showFilesTab" packages apps` → nothing.
- `rg -n "/api/reference/files/stream" packages/editor/App.tsx packages/server` → still present.
- Behaviour: `bun run apps/hook/server/index.ts annotate README.md` opens and annotates as before; editing `README.md` on disk reloads it; `annotate https://example.com`, `annotate http://localhost:5173` and `annotate packages/` each exit with the file-path error.
- `bun run typecheck && bun run typecheck:editors` green; the test command in step 4 passes.
