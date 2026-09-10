# 04 — Review file tree

**Status:** IMPLEMENTED (steps 1-5). The PR/worktree-picker questions stay open by design.

**Objective:** Replace the retained review navigator with the fixed, compact
tree configuration while preserving review identity, search, navigation, and
ordinary Git-worktree correctness.

## Authority, start here, and boundaries

Read `spec/01-foundation-and-scope.md` first. It is the shared authority for
approvals, baseline recording, safety rules, and test discipline. Verify these
existing paths before editing:

- `packages/review-editor/components/FileTree.tsx` and `FileTreeNode.tsx`
- `packages/review-editor/utils/buildFileTree.ts`, `utils/reviewSearch.ts`, and
  `hooks/useReviewSearch.ts`
- `packages/review-editor/components/PanelChrome.tsx`, `PanelViewToggle.tsx`,
  `DiffTypePicker.tsx`, and `WorktreePicker.tsx`
- `packages/review-editor/App.tsx` and the FileTree/build-tree/search tests

This slice owns the **retained review tree adapter and presentation** after the
approved removals in spec 02. It does not implement feature/app deletion,
comments/attachments (spec 05), themes/icons/fonts (spec 03), or
branding/install/storage (spec 06). Do not edit the design prototype.

**After every numbered implementation step:** run `bun test`; document any
unrelated baseline failure and fix causes rather than weakening tests. Before
handoff, run maintained typechecks plus `bun run --cwd apps/review build` then
`bun run build:hook` for review UI work.

## Fixed tree contract

Configure the adopted tree once, with no user-exposed alternative:

```ts
{
  paths,
  initialExpansion: 'open',
  flattenEmptyDirectories: true,
  search: true,
  fileTreeSearchMode: 'hide-non-matches',
  icons: 'complete',
  // Deliberately omit density.
}
```

“Open” is the initial state and active-file/reveal ancestors must still open.
Flattening must preserve a file's canonical repository-relative identity;
search hides non-matches rather than changing the underlying diff membership.
`icons: 'complete'` is the required tree-icon configuration, not permission to
replace Pierre internals or reopen a global icon decision.

There is no tree rename, drag/drop, staging/status UI, or configuration switch.
Spec 02 owns deletion of stage/unstage commands and legacy settings; this tree
must consume the resulting no-staging API instead of preserving hidden props,
preferences, decorations, or controls. Do not introduce density, compact-row,
status, or staging switches as a substitute.

## Retained invariants and approvals

- Keep in-tree search, search result/reveal behavior, keyboard navigation,
  active-file visibility, panel chrome, diff/base selectors, and review setup.
  Preserve viewed state/progress, applicable annotation counts, and active-file
  highlighting. Review progress is not the removed per-file Git status badge.
  Search must not steal keystrokes from inputs, editors, dialogs, menus, or
  picker listboxes.
- Retain `Tree | Git status | Commits` where currently supported. The tree is
  a fallback for unavailable sections/commits; sections and commits do not
  become a reason to change tree identity or all-files ordering.
- Preserve path case and rename (`oldPath`) identity through selection,
  annotation matching, reveal, file-content requests, and copied paths. Never
  key by display basename or collapse two case-distinct paths.
- Preserve ordinary Git worktree selection and review correctness. A worktree
  is not the removed multi-repository workspace feature. Keep the worktree and
  diff/base picker state during tree replacement.
- GitHub/GitLab PR review/posting, PR-worktree behavior, non-Git VCS, and
  worktree-picker retention are **OPEN pending explicit approval**. Do not
  remove, simplify, or promise them; retain safe current behavior while
  documenting evidence needed for a later decision.
- Preserve Pierre virtualized diff lifecycle: tree selection/reveal must never
  attach stale identity to recycled diff DOM or break large-diff rendering.

## Dependencies and implementation sequence

1. **Inventory the current contract and dependency types.** Start from the
   verified paths above; trace all `FileTree` props, `buildFileTree` identities,
   `useReviewSearch` reveal callbacks, panel/view toggles, diff/base/worktree
   pickers, all-files ordering, and tests. Depend on spec 02's completed
   staging/status removal and spec 03's independently verified Pierre Diffs
   upgrade. Before adding Trees, inspect actual published types, tarball,
   integrity, license, peers, and lockfile; the prior target is
   `@pierre/trees` `1.0.0-beta.6`, not a claim it is installed or a reason to
   force an override. Acceptance: an adapter map records every retained input,
   callback, path key, and removed staging/status dependency.

2. **Build a narrow identity-safe adapter.** Map canonical `DiffFile.path`,
   `oldPath`, status-independent change counts, annotation counts, selection,
   viewed state, and active/reveal state to the tree API without mutating review data. Keep
   any version-sensitive integration in one reviewed adapter. Acceptance:
   synthetic fixtures cover added, deleted, renamed, binary, generated,
   case-distinct, and deeply nested files; selecting/revealing each reaches the
   correct single-file and all-files target.

3. **Adopt the fixed presentation contract.** Apply exactly the fixed config;
   omit density and remove old folder-expansion/search rendering only once its
   behavior is covered by the adapter. Keep the panel header, `PanelChrome`,
   search field, `PanelViewToggle`, diff/base selectors, review setup, and
   worktree picker in their established positions/ownership. Acceptance: fresh
   tree opens folders, empty directories flatten, query hides non-matches, and
   clear/close/Enter/Shift+Enter search behavior remains correct.

4. **Preserve navigation under virtualized diffs.** Wire click, double-click,
   j/k, arrows, Home/End, search-reveal, and active ancestor expansion through
   the existing selection funnel; respect focus ownership for editable and
   overlay surfaces. Test long/recycled all-files diffs to ensure a tree action
   neither selects a reused DOM file nor loses the scroll/reveal target.
   Acceptance: keyboard-only navigation and search selection work after diff,
   panel, mode, base, and worktree switches.

5. **Remove only superseded tree code and prove integration.** After adapter
   parity, remove obsolete custom-tree UI/state/tests that exclusively protect
   replaced presentation—not shared path parsing, review search, picker, or
   identity behavior. Run a dead-export sweep. Acceptance: no tree staging or
   status decoration/control/config switch remains, no hidden legacy setting
   influences output, and retained search/picker/review setup tests stay live.

## Failure cases and evidence

- Test zero/one/many files; flat roots; nested empty-directory flattening;
  duplicate basenames; case-only paths; rename `oldPath`; deleted/binary/
  generated files; and a large virtualized all-files diff.
- Test the search lifecycle: Cmd/Ctrl+F, typing, debounce, no match, clear,
  close, Enter/Shift+Enter wrapping, and reveal after a diff/worktree/base
  change. Inputs, contenteditable edit sessions, dialogs, menus, and listboxes
  retain their normal key handling.
- Test local Git main/worktree changes and retained staged changes as readable
  review input without any staging mutation. Do not substitute untested PR or
  external VCS removal for an approval.
- Capture safe browser evidence for fresh expansion, flattened paths, filtered
  search/reveal, keyboard navigation, and a large diff. Inspect console and
  network errors; build success is not interaction proof.

## Completion handoff

Report the actual Trees/Diffs versions and package evidence, adapter location,
removed legacy-only paths, fixed configuration proof, focused fixture coverage,
tests/typechecks/ordered review→hook build, and browser evidence. Explicitly
list PR/PR-worktree/non-Git/worktree-picker decisions still awaiting approval;
do not claim that removing Workspaces removed ordinary worktrees.
