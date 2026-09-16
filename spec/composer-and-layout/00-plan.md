# Composer and layout — execution plan

Ten specs that implement the settled composer and annotate-layout design.
Written against `main` at `684b9c6e`; every line number in these specs refers
to that commit.

**Design reference:** https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ
(boards: Composer, Attachments, Quick labels, Layout, Message rail states).
The canvas needs a claude.ai login. Every spec is self-contained — sizes,
classes and behaviour are written out — so an agent that cannot open the link
loses nothing. Where a spec and the canvas disagree, the spec wins.

## How to run a spec

Each spec runs in its own git worktree on its own branch, cut from the tip of
`main` at the start of its wave:

```
git worktree add ../hm-wt/<NN>-<name> -b cl/<NN>-<name> main
```

Commit `spec/composer-and-layout/` to `main` before cutting worktrees, or pass
the agent the absolute path of its spec in the main checkout.

Rules for every agent:

1. Edit only the files listed under **Owned files**. If a change seems to
   need another file, stop and report it instead of editing.
2. Do not run repo-wide searches before the edits are done. The specs list
   every reference. Run the searches in **Completion** once, at the end.
3. `packages/ui/tsconfig.strict-consumer.json` type-checks `CommentPopover`,
   `Viewer`, `AnnotationPanel`, `TableOfContents` and `useAnnotationHighlighter`
   with `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`.
   Delete every import, variable and helper your edit leaves unused, and
   import types with `import type`.
4. Gate before committing:
   ```
   bun run typecheck && bun run typecheck:editors
   ```
   plus the `bun test` files the spec names.
5. Commit on the spec's branch with a plain message. Leave nothing
   uncommitted.
6. A spec that exposes values through DialKit registers its own panel, named
   after the spec, per the convention in `08-dialkit`.

## Waves

| Wave | Specs | Why |
|---|---|---|
| 0 | `08-dialkit` | Installs DialKit; 01 imports `useDialKit`. Merge before cutting wave 1. |
| 1 | `01-composer-chrome`, `02-attachment-stack`, `04-plan-width`, `05-sidebars`, `06-message-rail` | Disjoint regions; see file ownership. |
| 2 | `03-quick-labels`, `07-sweep` | `03` edits the action row `02` rewrites and the popover root `01` rewrites. `07` deletes files that `05` and `06` leave unused. |
| 3 | `09-quick-label-settings`, `10-remove-view-modes` | 09 rewrites files 03 owns; 10 rewrites `App.tsx` across the regions 04, 05 and 06 touched. Disjoint from each other. |

## Merge order

```
08                         (wave 0)
01 → 02 → 04 → 05 → 06     (wave 1, cut from main after 08)
03 → 07                    (wave 2, cut from the merged wave-1 tip)
09 → 10                    (wave 3, cut from the merged wave-2 tip)
```

## File ownership (shared files)

| File | Specs, and the region each owns |
|---|---|
| `packages/ui/components/CommentPopover.tsx` | 01: import after line 12, constants (77), dials after line 192, grip state and handler (329–365), strip (611–643), textarea corner buttons (650–692), dialog wrapper (738–782), popover render and arc (784–856), `ComposerTextarea` (862–905), icons (909–948). 02: imports (lines 4 and 6), shelf (695–705), action row (707–733). 03 (wave 2): props, `computeCommentPopoverPosition`, `quickLookGoodButton`, label row. |
| `packages/editor/App.tsx` | 04: imports (35), the TOC preference (382, 579–588, 1145–1165) and the dialled `planMaxWidth` (2221–2224). 05: new title-offset effect above `renderPlanSidebar` (~2238), `renderPlanSidebar` props (2265–2269), `SidebarTabs` props (2374–2375). 06: new import, `messagePickerInfo` prop (2564–2574), rail mount after `</OverlayScrollArea>` (~2582). 07: `PickerMessage` import (line 59). |
| `packages/ui/components/Viewer.tsx` | 06: `MessagesIcon` import (39), `messagePickerInfo` (132, 335, 794–808). 03: highlighter destructure (~425), hook `CommentPopover` (1139–1148). |
| `packages/ui/package.json`, `bun.lock`, `apps/hook/index.tsx`, `apps/review/index.tsx` | 08 only. |
| `packages/ui/components/sidebar/SidebarContainer.tsx`, `SidebarTabs.tsx` | 05 only. |
| `packages/ui/utils/quickLabels.ts`, `packages/ui/components/Viewer.tsx` (composer props) | 03, then 09 in wave 3. |
| `packages/editor/App.tsx` (whole file), `packages/ui/utils/wideMode.ts`, `packages/ui/shortcuts/*` | 10 in wave 3, after everything else has landed. |

Git merges hunks this far apart cleanly. If a merge conflicts anyway, the
orchestrator resolves it keeping both specs' intent; the agent is not re-run.

## After wave 2

- `bun test` (full suite), both typechecks.
- `bun run dev:hook`, then walk the Completion checks of all ten specs in
  one session: select text → composer; global comment; attach, hover, remove
  an image; the rail (needs `annotate-last` with more than one recent
  message); the table of contents.
