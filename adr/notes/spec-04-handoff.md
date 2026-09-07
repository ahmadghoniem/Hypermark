# Hypermark spec 01-04 — session handoff (2026-09-07)

Branch: `hypermark/implementation`.

## Where the specs stand

| Spec | State |
| --- | --- |
| 01 foundation and scope | Complete. |
| 02 feature removal and Claude | Complete. Step 5's orphan sweep closed by `6b079178`. |
| 03 theme, icons, fonts | Steps 1-5 complete. Step 6 inventoried (below); deletions outstanding. |
| 04 file tree | Steps 1-2 complete (`fa67d2db`, `b15c5010`). Step 3 attempted and PARKED (below). Steps 4-5 not started. |
| 05, 06 | Not started. |

## Step 3 is parked on branch `spec-04-step-3-wip` — read before redoing it

A first attempt at step 3 exists on `spec-04-step-3-wip`. It is NOT merged and
must not be merged as-is. Salvage from it; do not start from scratch, and do not
trust it.

Right, and worth keeping:

- The fixed tree contract is applied exactly as `spec/04-file-tree.md:39-48`
  specifies, density omitted.
- Selection routes through the step-2 adapter, so a reported path is normalized
  (path OR oldPath -> canonical `file.path`) before `onSelectFile` sees it.
- `onSelectionChange` reads `files`/`onSelectFile` through a ref, because
  `useFileTree` reads its options ONCE at construction — the closure it was built
  with goes stale. This is a real trap and the fix is correct.
- `areAllFoldersExpanded` and expand/collapse-all are recomputed against real
  canonical ancestor paths, because the Pierre model keys directory nodes by
  those, not by the collapsed display paths `getAllFolderPaths` emits.

Wrong, and why it cannot ship:

- It drops `FileTreeNodeItem` along with `annotationCountMap`,
  `getAnnotationCount`, and the `sinceBaseSections` `getSectionEntry` lookup.
  `spec/04-file-tree.md:67-68` requires preserving viewed state/progress,
  applicable annotation counts, and active-file highlighting. Nothing re-renders
  that per-row metadata on the Pierre rows, so review progress and annotation
  counts vanish from the tree. **This is the main thing to solve** — find out
  how `@pierre/trees` allows per-row adornments before rewriting step 3.
- Step 3's four acceptance behaviors have no tests: fresh tree opens folders,
  empty directories flatten, query hides non-matches, and
  clear/close/Enter/Shift+Enter search behavior stays correct.
- It removes the old expansion/search rendering during step 3. That removal is
  step 5's, and only after adapter parity is proven.
- The DOM gate does NOT pass against it. A sweep run by the coordinator returned
  **2014 pass / 1 skip / 1 fail across 231 files**, against a 2015/1/0/231
  baseline — so it breaks one existing test. Treat that number with one caveat:
  the run overlapped the branch switch that parked this work, so the single
  failure could be an artifact of files moving mid-run. Re-run the sweep against
  `spec-04-step-3-wip` in isolation before concluding which test broke and why.
  `typecheck` exits 0 and both TS baselines hold (review-editor 51, editor 39).

## Gates (the ONLY correct ones)

    bun run typecheck                                    # must exit 0
    tsc -p packages/review-editor/tsconfig.json --noEmit  # <= 51 errors (baseline)
    tsc -p packages/editor/tsconfig.json --noEmit         # <= 39 errors (baseline)
    DOM_TESTS=1 bun test --isolate packages/ui packages/editor packages/review-editor

The DOM baseline before spec 04 work was **1976 pass / 1 skip / 0 fail across 230 files**.

Do NOT run an unscoped `bun test`. It reaches into `packages/server` and `apps/`
and reports roughly **220 pre-existing failures** — verified pre-existing by running
the same command against a clean `HEAD` with no change applied, which also produced
220. They are all server/integration suites that stand up real servers (`API route
404 guards`, `/api/pr-action submission contract`, `Call flow install endpoints`,
`CallFlowService`). Out of scope for specs 01-04, but real and untriaged; worth
attention before spec 06's release work.

## Step-1 research documents

Two documents drove spec 04 step 1 and remain the reference for steps 2-5:

- `spec04-contract-inventory.md` — the adapter map. All ~55 `FileTreeProps`, the
  `buildFileTree` identity model, the navigation funnel, picker ownership,
  all-files ordering, and a PRESENTATION vs SHARED classification of all nine
  tree/search/picker test files.
- `spec04-trees-audit.md` — the `@pierre/trees` registry audit behind `fa67d2db`.

Both were written to the session scratchpad, not the repo. If they are gone, their
findings survive in `fa67d2db`'s commit message and in the traps below.

## Traps that will bite a fresh session

1. `buildFileTree.ts` is split down the middle. `getAncestorPaths`,
   `getAllFolderPaths`, and `getVisualFileOrder` are SHARED identity plumbing that
   `AllFilesCodeView.tsx` also calls. `buildTrie`, `trieToNodes`, and
   `collapseSingleChild` are the disposable presentational half. Spec 04 step 5
   must not delete the module wholesale.
2. Selection has two producers keyed differently: forward through `openDiffFile`
   matches `path` OR `oldPath`; the reverse dockview `onDidActivePanelChange` sync
   matches `path` only. It is safe today solely because `openDiffFile` normalizes
   to `file.path` before writing dock params. Anything writing dock params by
   another route reintroduces a rename bug.
3. Ancestor-expansion-on-reveal is a side effect of `activeFileIndex` changing, not
   something `useReviewSearch` does. Wire only the hook and reveal silently stops
   expanding folders.
4. Tree click/dblclick/keyboard while "All files" is open switches away from All
   files; search-reveal has an in-place guard and does not. This asymmetry is
   PRESERVED deliberately — spec 04 step 4 says preserve navigation, and unifying
   them is a product decision the user has not made.
5. Double-click is currently identical to single-click. There is no pin behavior to
   preserve, only to avoid inventing.
6. `@pierre/trees` provides no double-click/activate and no j/k binding; both are
   spec step-4 adapter work. Rows carry `data-item-path`, `dblclick` bubbles
   composed through the shadow boundary, and `focusNextItem`/`focusPreviousItem`
   are public methods.
7. The tree renders through Preact 11 (itself a beta) inside its own shadow-DOM
   custom element, alongside React 19. Isolated, but it is a second UI runtime in
   the bundle and a second beta dependency. Flagged to the user, who elected to
   proceed.
8. Spec 02 removed staging MUTATOR controls only. The read side — `stagedFiles`,
   `'staged'`/`'unstaged'` diff options, diff views — is RETAINED. Do not
   re-delete it.

## Spec 03 step 6 — the deletion list

Step 6 requires user visual sign-off before these are removed. The user directed
that the work be finished first and reviewed after, so these are to be deleted
LAST, in their own single commit, keeping the revert trivial.

TEMPORARY — delete only after visual sign-off:

1. Legacy `totman` -> Classic favicon compatibility path: `packages/core/favicon.ts`
   (`FaviconStyle`, `FAVICON_SVG`, `faviconDataUrl`),
   `packages/server/shared-handlers.ts:198-210`,
   `packages/shared/config.ts:240-246,516-529`,
   `packages/ui/components/ThemeProvider.tsx:159-165`.
2. Legacy single-palette -> pair migration bridge:
   `packages/ui/config/settings.ts:35-89`,
   `packages/ui/components/ThemeProvider.tsx:89-101,131-141,232-266`.
3. `theme`/`setTheme` legacy naming alias in ThemeProvider's public context:
   `packages/ui/components/ThemeProvider.tsx:24-28,50-51,274-276`.
4. Orphaned `everforest`, `everforest-hard`, `everforest-soft` ANSI terminal
   presets — a pruned-palette leftover, not one of the seven retained:
   `packages/editor/components/annotateAgentTerminalTheme.ts:345-398`.

PERMANENT — the spec forbids deleting these; they are not outstanding work:

- Per-half corrupted/unknown/unsupported-mode palette recovery to Pierre:
  `packages/ui/utils/themeRegistry.ts` (`normalizeThemePair`, `resolvePairTheme`,
  `resolveModeDescriptor`) and `packages/ui/utils/syntaxTheme.ts`
  (`resolveSyntaxTheme`, `resolveFenceTheme`).
- Unavailable-font recovery: `packages/ui/config/settings.ts:402-412`,
  `packages/ui/components/Settings.tsx:449,458`,
  `packages/review-editor/hooks/usePierreTheme.ts:245-249`.

The seven retained palettes are `pierre`, `plannotator`, `catppuccin`, `github`,
`ayu-dark`, `one-dark-pro`, `tokyo-night`.

## Open decisions

**`localFontPickerPolicy`** is still unmade. The current state is the worst of both
worlds: zero font files ship, the CDN injection is gone, and
`packages/ui/components/Settings.tsx` still hardcodes nine families that silently
fall back to `monospace` when the user lacks them — the picker offers fonts it
cannot provide. Recommended and tentatively agreed: local enumeration via
`queryLocalFonts()` plus a fallback list trimmed to fonts actually present on stock
Windows, rather than bundling. Enumeration must be opt-in, cached, deduplicated,
never uploaded, with only the selected family persisted; monospace classification
must be measured (`i` vs `W` advance width) because `FontData` carries no monospace
flag. Windows font files must not be redistributed. Queued behind spec 04 because
it touches `review-editor/App.tsx`, which the tree work also touches.

## Standing constraints from the user

- Implement the specs autonomously; do not stop for confirmation on ordinary
  implementation steps.
- Browser screenshots, manual browser verification, and interactive PTY evidence
  are explicitly WAIVED. Do not spend tokens on them or block a step for them.
- NEVER read or write `~/.claude/plugins/marketplaces/plannotator`. Live
  `/plannotator-*` commands run from it; it is not a project checkout.
- Do not delete or purge anything under `~/.plannotator/`.
- Git worktrees are standard Git and are RETAINED — not the removed multi-repo
  Workspaces feature.
- Do not delete `packages/ui/utils/aiChatFormat.ts`; `formatRelativeTime` is used by
  `CommitsPanel.tsx` and `CommitDescriptionHeader.tsx`.
- Do not delete `useAgents.ts` / `agentSwitch.ts` — the OpenCode agent switcher,
  distinct from the removed agent jobs.
- Do not remove `typescript` from root `devDependencies`.
- Verify agent diffs directly; do not trust agent summaries.

## Delegation note

Five concurrent `agy` (Gemini) delegations all died at `printmode.go: timed out
after 4492 polls` — the plugin's default `--print-timeout 15m`, blown because five
agy processes each spawn their own language server and contend on one machine.
Neither agy nor the delegate plugin imposes a concurrency limit; there is no lock
in the plugin. Either raise `--timeout` well past 900s or keep concurrency to two
or three. In-process Sonnet subagents have none of this failure mode and were used
instead.
