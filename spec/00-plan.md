# Execution plan

Branch `ui-decluttering-pass`. Twelve specs in `spec/`, dispatched by the
orchestrator in four waves. A spec names the files it owns; two specs that
share a file sit in different waves. Every spec ends on checks the orchestrator
runs; the shared gate for every wave is both typecheck lanes green:

```
bun run typecheck && bun run typecheck:editors
```

Tests are read, classified and deleted by spec; they are not executed on
this Linux sandbox. `WINDOWS-HANDOFF.md` at the repo root lists what an agent on
the maintainer's Windows machine runs after the waves merge.

## Waves

| Wave | Specs | Why together |
|---|---|---|
| 1 | `01-test-pruning`, `09-removals`, `10-session-lifecycle` | Server-side and test-only work; disjoint from every UI file. `09` and `10` both touch `apps/hook/server/index.ts` — see the sequence note below. |
| 2 | `03-left-panel`, `04-decision-menu`, `05-review-dock`, `06-input-and-scrollbars`, `08-gutter-markers` | Five UI specs with disjoint owned files. |
| 3 | `07-composer` | Owns `CommentPopover.tsx`, `AnnotationPanel.tsx` and the review composer; waits for `05` (which deletes the dock and touches `AllFilesCodeView.tsx`) and `10` (which adds composer persistence to the draft hooks). |
| 4 | `02-duplication`, `11-sweep` | `02` repoints imports across packages; `11` runs `knip` and the leftover greps over the merged tree. Both must see the final shape. |

Sequence inside wave 1: `10` lands before `09`. Both edit
`apps/hook/server/index.ts`; `10` adds the parent watcher and `--kill`, `09`
removes the OpenCode comment and the permission fallback in `packages/server/index.ts`.
Merge `10` first, rebase `09`.

## Merge order

```
10 → 09 → 01        (wave 1)
03 → 04 → 05 → 06 → 08   (wave 2, any order; listed for determinism)
07                  (wave 3)
02 → 11             (wave 4; 11 is always last)
```

## File ownership

| File | Owner |
|---|---|
| `apps/hook/server/index.ts` | 10, then 09 (sequenced) |
| `apps/hook/server/annotate-output.ts` (+test) | 10 |
| `packages/server/sessions.ts`, new `packages/server/parent-watch.ts` | 10 |
| `packages/server/index.ts` | 09 (permission fallback, vscode-diff route, integrations) |
| `packages/server/annotate.ts`, `packages/server/review.ts` | 10 (parent watcher wiring only) |
| `packages/server/ide.ts`, `p4.ts`, `integrations.ts`, `packages/shared/integrations-common.ts` | 09 (deletions) |
| `packages/ui/hooks/useAnnotationDraft.ts`, `useCodeAnnotationDraft.ts` | 10 |
| `packages/editor/App.tsx` | 10 (draft restore), 09 (comments, VS Code diff), 03 (Files tab), 07 (sidebar edit) — waves 1 → 2 → 3, rebased each time |
| `packages/review-editor/App.tsx` | 10 (draft restore), 05 (dock), 09 (staged dot) — 10 in wave 1, 05 and 09 conflict: 09 owns only the `stagedFiles` block (lines ~1005–1020, 2204, 2289); 05 owns the dockview block. Rebase 09 onto 05 if both land in the same day; otherwise the orchestrator resolves the trivial conflict. |
| `packages/ui/components/sidebar/MessagesBrowser.tsx`, `SidebarContainer.tsx`, `SidebarTabs.tsx`, `FileBrowser.tsx`, `packages/ui/hooks/useFileBrowser.ts`, `useSidebar.ts` | 03 |
| `packages/ui/utils/decisionSpec.ts` (+test), `packages/ui/components/DecisionControl.tsx`, `ActionMenu.tsx` | 04 |
| `packages/review-editor/dock/**`, `packages/review-editor/index.css`, `packages/review-editor/components/AllFilesCodeView.tsx` (dock/code-nav props only) | 05 |
| `packages/ui/utils/inputMethod.ts`, `packages/ui/theme.css` (scrollbar block) | 06 |
| `packages/ui/components/CommentPopover.tsx`, `AnnotationPanel.tsx`, `packages/review-editor/components/AnnotationToolbar.tsx`, `ExpandedCommentDialog.tsx`, `ToolbarHost.tsx`, `packages/review-editor/hooks/useAnnotationToolbar.ts` | 07 |
| `packages/review-editor/components/GutterAnnotations.tsx` | 08 |
| `packages/ui/hooks/useViewportEnvironment.ts`, `packages/ui/components/plan-diff/*`, staged-dot files (`FileTree.tsx`, `SectionsPanel.tsx`, `FileRowBits.tsx`, `fileTreeRowDecoration.ts`) | 09 |
| `packages/editor/annotateDecision.ts`, `packages/review-editor/reviewDecision.ts` | 09 |
| `packages/review-editor/utils/generateId.ts`, `packages/ui/hooks/useCodeAnnotationDraft.ts` (dedupe only, after 10) | 02 |
| `knip.json`, every `package.json`, `bun.lock` | 11 |

## After the waves

The author of these specs reviews the merged tree against each spec's
completion criterion, then runs `WINDOWS-HANDOFF.md` items on the maintainer's
machine (or hands that file to an agent there).
