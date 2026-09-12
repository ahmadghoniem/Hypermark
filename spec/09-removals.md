# 09 — Removals

Each item: what it is, the count, the verdict, and the edit. The maintainer
decides from the number; the executor performs every item marked **cut** or
**trim**, and leaves **ask** items alone.

## Owned files

Listed per item. Wave 1, after spec 10 (both edit `apps/hook/server/index.ts`
and `packages/editor/App.tsx`; rebase onto 10).

## A. The brief's open questions

### A1. `useViewportEnvironment.ts` — 350 lines → **trim to ~120**

Publishes five CSS variables from `window.visualViewport` (`--pn-viewport-*`,
`--pn-keyboard-inset`) and exposes `useVisibleViewportBounds`, used by
`CommentPopover`, the review toolbar, `DiffOptionsButton` and `theme.css`
(13 consumer sites). `visualViewport` exists to track pinch-zoom and the
on-screen keyboard — phone concerns. `--pn-keyboard-inset` is written and read
nowhere. `hasPrimaryCoarsePointer` and `shouldUseExpandedComposer` gate the
touch composer that spec 07 no longer needs.

Edit: keep `calculateVisibleViewportBounds`, `useVisibleViewportBounds`, and
a `useViewportEnvironment` that publishes `--pn-viewport-width/height` from
`window.innerWidth/innerHeight` on `resize`. Delete `VisualViewportSnapshot`,
the `visualViewport` branch of `calculateViewportEnvironment`, the offset and
keyboard variables, `shouldUseExpandedComposer`, `hasPrimaryCoarsePointer`
and their consumers (`rg -n "coarsePointer|shouldUseExpandedComposer" packages`
— 6 sites, each collapses to the non-coarse branch). `theme.css` keeps
`var(--pn-viewport-height, 100vh)`; drop the two `--pn-viewport-offset-*`
uses (they become `0`).

### A2. VS Code diff path — 175 lines → **cut**

`PlanDiffViewer.tsx` has a "Open in VS Code" button (`onOpenVscodeDiff`,
lines 37–90) that POSTs `/api/plan/vscode-diff`; `server/index.ts:291–320`
spawns `code --diff` via `server/ide.ts` (43 lines). `VSCodeIcon.tsx` is 132
lines of brand SVG. The in-app clean/raw diff (`PlanCleanDiffView`, 853;
`PlanRawDiffView`, 102) stays — it is the version diff the maintainer uses.

Edit: delete `VSCodeIcon.tsx`, `server/ide.ts`, the route, and the button +
its `vscodeDiff*` state in `PlanDiffViewer.tsx`. Owned: those files,
`server/index.ts:16,291–320`.

### A3. Staged dot — 14 prop sites → **cut**

The server's status sidecar marks paths `staged`; `App.tsx:1005–1020` builds
a `Set`, threads it as `stagedFiles` through `FileTree` (65, 126, 277, 280,
293, 386) and `SectionsPanel` (58, 168, 214–221, 289), `fileTreeRowDecoration.ts`
(42, 82, 95, 109) reads it, `FileRowBits.tsx:43–56` draws a primary dot.
Staging controls were removed in `0473298b`; the dot is the last trace of a
concept the UI cannot act on. The `Changes` group still sorts staged-first
(`SectionsPanel.tsx:221`); without controls that order is arbitrary from the
user's seat.

Edit: delete `stagedFiles`/`isStaged`/`StagedDot`/`stagedCount` end to end
(the "N added" count at `SectionsPanel.tsx:287–289` goes too). Keep the
server sidecar field; nothing reads it, and removing it is a server-side
change with its own tests (spec 11 may flag it). Owned: `review-editor/App.tsx`
(that block only), `FileTree.tsx`, `SectionsPanel.tsx`, `FileRowBits.tsx`,
`utils/fileTreeRowDecoration.ts` (+ its test).

### A4. `note-with-approval` — 6 non-test sites, 9 test sites → **keep**

The id is emitted by `decisionSpec.ts:127–146` only when
`approvalFlow && approvalNotesSupported` — that is the live "Approve with a
note…" item in gate-annotate and review. It is not dead. The comment at
`annotateDecision.ts:36–42` describes a *non-gate* arm that is unreachable;
that arm is three lines. Edit: collapse
`return ctx.gate ? {…approve} : {…feedback}` to the gate form and delete the
seven-line comment. Owned: `packages/editor/annotateDecision.ts:35–45`.

### A5. Permission-mode fallback (`server/index.ts:441–442`) — 3 lines → **cut**

`/api/approve` reads `body.permissionMode`, else falls back to the hook event's
`permission_mode` (guarded against `plan`). The only live caller is
`editor/App.tsx:2913–2919`, which always sets `PLAN_APPROVAL_PERMISSION_MODE`
(`'bypassPermissions'`) for `claude-code`, the only origin. The fallback is
unreachable. Edit: delete `inheritedPermissionMode`/`effectivePermissionMode`;
pass `requestedPermissionMode` through; keep the comment explaining why `plan`
must never be echoed, shortened to one sentence. Also drop the
`obsidian`/`bear`/`octarine` body fields and the integrations block in the same
handler (lines 374–420) — see B4.

### A6. OpenCode comments — 2 comments → **cut one, rewrite one**

`editor/App.tsx:1880` `// Fetch available agents for OpenCode (for validation on approve)` annotates nothing (blank line follows). Delete.
`editor/App.tsx:2922` `// Include annotations as feedback if any exist (for OpenCode "approve with notes").` annotates live code. Rewrite: `// Annotations and direct edits ride the approval as feedback.`

### A7. Shortcut bindings with no handler — 15 actions across 7 scopes → **cut the dead hooks, add the check**

The registry has 14 scope files. Six exported scope hooks are never mounted:
`useReviewFileTreeShortcuts`, `useReviewAllFilesDiffShortcuts`,
`useAnnotationPanelShortcuts`, `useAnnotationToolbarShortcuts`,
`useViewerShortcuts`, `useGoalSetupShortcuts`. Their 15 actions
(`fileTree.nextFile/prevFile/firstFile/lastFile`, `allFilesDiff.undoCollapse/addFileComment/nextFile/prevFile`,
`annotationPanel.cancelEdit`, `annotationToolbar.typeToComment`,
`viewer.copySelection/closeLightbox`, `commentPopover.skillMenuOpen`,
`inputMethod.temporarySwitch/toggleSwitch`) have zero `handlers` registrations.
Their keys *do* work — implemented by hand in `FileTree.tsx:197–210`
(`j/k/Home/End`), `AllFilesCodeView.tsx:1707–1760` (`x/z/c/[/]`),
`useInputMethodSwitch.ts` (Alt), etc. The scope files exist only so
`KeyboardShortcutsDialog` can list them.

Edit: keep the scope *definitions* (the dialog needs them) but delete the six
unused `create…Hook` exports, and add one test,
`packages/ui/shortcuts/registry.test.ts`: for every scope in
`shortcuts/index.ts`, every action id appears either in a `handlers` object
somewhere under `packages/{editor,review-editor,ui}` **or** in an allowlist
`HAND_WIRED` that names the file implementing it. The allowlist is the
mechanical check the brief asked for; a new binding with neither fails the
test. Owned: `packages/ui/shortcuts/**`.

### A8. `@anthropic-ai/claude-agent-sdk` — 0 imports → **cut, with the sentinel**

No code imports it (`rg -n "claude-agent-sdk" packages apps scripts --type ts`
→ nothing). `scripts/release-security/release-evidence.mjs:29–35` lists it in
`SBOM_SENTINELS`: the release workflow fails if the generated SBOM lacks any
sentinel, as a check that the SBOM was built from the real dependency tree.
Any real dependency serves; `@pierre/diffs` and `marked` are already there.
Edit: remove the dependency from root `package.json`, remove the sentinel
entry, run `bun install`. Owned: `package.json`, `bun.lock`,
`scripts/release-security/release-evidence.mjs` (+ `.test.mjs` fixture list).

## B. Further candidates

Counted with `wc -l` over the named files.

| # | What | Lines | Verdict | Why |
|---|---|---|---|---|
| B1 | `server/p4.ts` — Perforce diff provider, reachable via `hypermark review --vcs p4` | 417 | **cut** | Windows-first, git-only maintainer; `vcs.ts` registers it as one of three providers. Delete file, its `vcsProvider` entry and `p4-*` diff types in `vcs.ts`. |
| B2 | `server/jj.ts` (88) and `server/gitbutler.ts` (58) — Jujutsu and GitButler providers | 146 | **ask** | Same shape as p4. The maintainer removed GitButler *docs* but README:93 still advertises `--gitbutler`. Cut both unless one is in use. |
| B3 | Extra skills `apps/skills/extra/` (compound, setup-goal, visual-explainer) + goal-setup mode (`GoalSetupSurface.tsx` 1,367, `server/goal-setup.ts` 211, `core/goal-setup.ts` 336, the `setup-goal` CLI arm, 220 refs) | ≈2,900 | **ask** | Goal-setup is a whole interview UI reachable only from the `hypermark-setup-goal` skill. If the maintainer does not run `/hypermark-setup-goal`, this is the largest single cut left. |
| B4 | Note-app integrations (`server/integrations.ts` 214, `shared/integrations-common.ts` 230, `handleObsidian*` routes, `/api/approve` body fields) | 444 + routes | **cut** | Obsidian/Bear/Octarine save-on-approve. No UI sends the body fields (`rg -n "obsidian|bear|octarine" packages/ui packages/editor packages/review-editor` → nothing). Bear and Octarine are macOS-only apps. `detectObsidianVaults` also backs `/api/reference/obsidian/*` (skill references from a vault) — keep that one function in `reference-handlers.ts`, delete the rest. |
| B5 | Live-app annotate (`server/live-proxy.ts` 359, `shared/live-proxy-core.ts`, bridge 910 total; `ui/components/html-viewer/` 6,210) | ≈7,100 | **ask** | `hypermark annotate http://localhost:PORT/` proxies a running dev server and lets you comment on its DOM. It is the biggest subsystem in the repo. The brief's HTML-surface fixes (spec 06) assume it stays. Ask: is it used? |
| B6 | Theme palettes — 7 CSS files | 1,008 | **trim to 2** | `pierre` (default) and `hypermark`. Delete `catppuccin`, `github`, `ayu-dark`, `one-dark-pro`, `tokyo-night` (736 lines) and their entries in the theme list (`rg -n "catppuccin" packages/ui`). One palette per mode is what a single user picks once. |
| B7 | Codex remnants: `~/.codex/skills` skill root (`review-skill-loader.ts`, 9 refs; `skillReferences.ts`), `isCodexDesktopHost` (`shared-handlers.ts:198–220`) | ≈40 | **cut** | Codex adapters went in `73f373d8`; these scan a directory and an env var only Codex sets. |
| B8 | `isQuickLabel` field: `types.ts:47`, `parser.ts:1292,1320,1344`, tuple decoder `annotationSerialization.ts:94–108` | ≈25 | **cut** | The picker is gone; the flag only affects how old drafts render. Also lets spec 01's trimmed test shrink further. |
| B9 | Folder annotate + Files tab (spec 03 open question): `FileBrowser.tsx` 623, `useFileBrowser.ts` 337, `reference-watch.ts`, `file-browser-watch-core.ts` 385, two routes ×2 servers | ≈1,500 | **ask** | Keep if `hypermark annotate <folder>` is used. |
| B10 | `hypermark sessions --open N` | ≈20 | keep | Spec 10 builds `--kill` beside it. |

## Completion

For every **cut**/**trim** item above, the named symbol returns no hits:

```
rg -n "vscode-diff|VSCodeIcon|openEditorDiff" packages apps
rg -n "stagedFiles|isStaged|StagedDot|stagedCount" packages/review-editor
rg -n "inheritedPermissionMode|effectivePermissionMode" packages/server
rg -n "OpenCode" packages/editor/App.tsx
rg -n "claude-agent-sdk" package.json scripts
rg -n "p4Provider|from \"./p4\"" packages/server
rg -n "saveToObsidian|saveToBear|saveToOctarine|integrations-common" packages
rg -n "catppuccin|tokyo-night|one-dark-pro|ayu-dark|\"github\"" packages/ui --type ts
rg -n "isCodexDesktopHost|CODEX_HOME|\.codex" packages
rg -n "isQuickLabel" packages
rg -n "visualViewport|keyboard-inset|coarsePointer" packages/ui
```

Plus `packages/ui/shortcuts/registry.test.ts` exists and reads clean, and
both typecheck lanes are green. Expected net for the cut/trim set: ≈ 3,000
lines; the **ask** set is a further ≈ 12,000 if all approved.
