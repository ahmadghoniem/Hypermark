# Execution plan

Branch `fable-exec` (cut from `8351f40c`; `ui-decluttering-pass` is not
touched). Fourteen specs in `spec/`, run in four waves. Each spec runs in its
own git worktree on its own branch (`fable/<NN>-<name>`), cut from the tip of
`fable-exec` at the start of its wave. The orchestrator reviews each branch,
merges it into `fable-exec` in the merge order below, and starts the next wave
from the merged tip.

Gate for every spec before merge:

```
bun run typecheck && bun run typecheck:editors
```

plus the tests the spec's Completion section names. The work runs on the
maintainer's Windows machine, so tests are executed, not only read.
`WINDOWS-HANDOFF.md` runs once after wave 4.

## Maintainer decisions (2026-09-13)

- Cut: goal-setup (12); live-app, remote-URL and folder annotate (13);
  jj, GitButler and Perforce (14); Obsidian, Bear and Octarine end to end (09 B4).
- Keep: all seven theme palettes; `tailwindcss` in `packages/ui`; parent-PID
  polling and `taskkill /T` (10); client lease always on for annotate (10).

## Waves

| Wave | Specs | Notes |
|---|---|---|
| 1 | `10-session-lifecycle`, `09-removals`, `01-test-pruning` | Server and test work. `10` and `09` both edit `apps/hook/server/index.ts`; merge `10` first. |
| 2 | `03-left-panel`, `04-decision-menu`, `05-review-dock`, `06-input-and-scrollbars`, `08-gutter-markers`, `12-goal-setup-cut` | `12` and `06` both touch `editor/App.tsx` (06: one line). |
| 3 | `07-composer`, `13-annotate-targets-cut`, `14-vcs-providers-cut` | `07` waits for `05` and `10`. `13` edits `editor/App.tsx`, `server/annotate.ts`, hook `index.ts`; `14` edits `review-editor/App.tsx`, `AllFilesCodeView.tsx`, `server/review.ts` — both after the wave-2 edits to those files. |
| 4 | `02-duplication`, then `11-sweep` | Run one after the other; `11` is always last. |

## Merge order

```
10 → 09 → 01                    (wave 1)
03 → 04 → 05 → 06 → 08 → 12     (wave 2)
07 → 14 → 13                    (wave 3)
02 → 11                         (wave 4)
```

## File ownership (shared files)

| File | Specs, in merge order |
|---|---|
| `apps/hook/server/index.ts` | 10, 09 (wave 1); 12 (wave 2); 13, 14 (wave 3) |
| `apps/hook/server/cli.ts` (+test) | 12; 13, 14 |
| `packages/server/index.ts` | 09 (permission fallback, vscode-diff, integrations, vault routes); 13 (files tree route) |
| `packages/server/annotate.ts` | 10 (lease, parent watcher); 09 (vault routes, save-notes); 13 (live, folder) |
| `packages/server/review.ts` | 10 (parent watcher); 05 (code-nav routes); 14 (providers) |
| `packages/editor/App.tsx` | 10, 09; 06 (one line), 12; 13 |
| `packages/review-editor/App.tsx` | 10, 09 (staged dot); 05 (dock); 14 (providers) |
| `packages/review-editor/components/AllFilesCodeView.tsx` | 05; 07 (toolbar call sites), 14 |
| `packages/review-editor/components/FileTree.tsx` | 09 (staged dot); 14 |
| `packages/ui/components/CommentPopover.tsx` | 10 (draft store); 07 |
| `packages/ui/hooks/useAnnotationDraft.ts`, `useCodeAnnotationDraft.ts` | 10; 02 (dedupe) |
| `packages/ui/shortcuts/**` | 09 (dead hooks + registry test); 12 (goal-setup scope) |
| `packages/ui/components/sidebar/*`, `packages/ui/hooks/useSidebar.ts` | 03 (MessagesBrowser only); 13 (Files tab) |
| `packages/shared/package.json`, `packages/server/package.json` | 12, 13, 14 (export entries); 11 |
| `knip.json`, root `package.json`, `bun.lock` | 09 (agent-sdk), 05 (dockview); 11 |

A conflict at merge time on any row above is resolved by the orchestrator,
keeping both specs' intent; the later spec's agent is not re-run for it.

## After the waves

The orchestrator checks the merged tree against every spec's Completion
section, runs the full `bun test`, then `WINDOWS-HANDOFF.md`.
