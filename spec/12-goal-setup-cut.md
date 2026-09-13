# 12 — Remove goal-setup

Maintainer decision: goal-setup is not used. Remove the `hypermark setup-goal`
command, its server, its UI surface, its shared types and the
`hypermark-setup-goal` skill, end to end.

Wave 2. Spec 09 (wave 1) already deleted the unmounted `useGoalSetupShortcuts`
hook; this spec deletes the rest of the shortcut scope.

## What it is

`hypermark setup-goal <interview|facts> <bundle.json | ->` loads a JSON bundle
(`normalizeGoalSetupBundle`), starts `startGoalSetupServer`
(`packages/server/goal-setup.ts`), and the plan editor renders
`GoalSetupSurface` (`packages/ui/components/goal-setup/GoalSetupSurface.tsx`)
instead of the document when `/api/plan` returns `mode: "goal-setup"`. It is
only launched by the `apps/skills/extra/hypermark-setup-goal` skill.

## Owned files

Delete:

- `packages/ui/components/goal-setup/` (whole directory)
- `packages/server/goal-setup.ts`, `packages/server/goal-setup.test.ts`
- `packages/core/goal-setup.ts`, `packages/core/goal-setup.test.ts`
- `packages/shared/goal-setup.ts`
- `packages/ui/shortcuts/plan-review/goalSetup.shortcuts.ts`
- `apps/skills/extra/hypermark-setup-goal/` (whole directory)

Edit (goal-setup parts only):

- `apps/hook/server/index.ts` — the header comment item 7, the imports at
  lines ~66–75, `loadGoalSetupBundle` (~242), and the whole
  `args[0] === "setup-goal"` arm (~428–480). Also remove `"setup-goal"` from
  the known-subcommands list if one exists (`rg -n "setup-goal" apps/hook`).
- `apps/hook/server/cli.ts` — the `setup-goal` lines in the top-level help
  (~145), the `"setup-goal"` help entry (~213–220) and the example (~297);
  `apps/hook/server/cli.test.ts` — the matching assertions.
- `apps/hook/dev-mock-api.ts` — the goal-setup mock branch.
- `packages/editor/App.tsx` — every `goalSetup*` state, prop, branch and the
  `'goal-setup'` member of the `/api/plan` `mode` union; conditions like
  `goalSetupMode || annotateSource === 'folder'` keep only the other operand.
- `packages/editor/components/AppHeader.tsx` — goal-setup props and branches.
- `packages/ui/shortcuts/index.ts` — the goal-setup scope import/entry.
- `packages/server/sessions.ts:23` — drop `"goal-setup"` from the `mode` union.
- `packages/core/package.json`, `packages/server/package.json`,
  `packages/shared/package.json`, `packages/ui/package.json` — the
  `./goal-setup` / `./components/goal-setup/*` export entries.
- Comments only: `packages/server/shared-handlers.ts:171`,
  `packages/server/no-outbound-share.test.ts:11` (drop the goal-setup mention).
- Docs: `apps/skills/core/hypermark/SKILL.md` (the `setup-goal` usage lines),
  `packages/ui/HANDOFF.md`, `packages/ui/.migration/project.md`.

Keep: `packages/server/uninstall.ts:54` lists `"hypermark-setup-goal"` among
skills to uninstall. Leave it, so running uninstall still removes a copy
installed before this change.

## Procedure

1. Delete the files above.
2. Run both typecheck lanes; fix every error by deleting the goal-setup branch
   at the reported site (never by stubbing a type).
3. `rg -n -i "goal-?setup|GoalSetup|setup-goal" packages apps` and remove what
   remains, except `uninstall.ts:54`.

## Completion

- `rg -n -i "goal-?setup|GoalSetup|setup-goal" packages apps` → only `packages/server/uninstall.ts`.
- `bun run apps/hook/server/index.ts setup-goal` → the unknown-subcommand error.
- `bun test apps/hook/server/cli.test.ts packages/ui/shortcuts` passes.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook`, open `http://localhost:3000`: the plan loads as before.
