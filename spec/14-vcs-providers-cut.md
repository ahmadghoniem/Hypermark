# 14 — Review: git only

Maintainer decision: the review app supports git only. Remove the Jujutsu
(jj), GitButler and Perforce (p4) providers, end to end.

Wave 3. Spec 05 (wave 2) has already removed the dock and code-nav from
`review-editor/App.tsx`, `AllFilesCodeView.tsx` and `server/review.ts`; spec 09
(wave 1) removed the staged dot from `FileTree.tsx`.

## What exists

`packages/server/vcs.ts` registers four providers (`createGitProvider`,
`createJjProvider`, `createGitButlerProvider`, the p4 provider) built on
`packages/shared/vcs-core.ts`. Each non-git provider adds diff types
(`jj-current/last/line/evolog/all`, `gitbutler:*`, `p4-default`,
`p4-changelist:*` in `shared/review-core.ts:35–47`), context fields
(`vcsType`, `gitButlerRevision`, `jjEvologs`, `JjEvoLogEntry`), CLI flags
(`--gitbutler`, `--vcs`), and UI (the jj evolog picker, GitButler stack/branch
handling, empty-state strings).

## Owned files

Delete:

- `packages/server/jj.ts`, `packages/server/gitbutler.ts`, `packages/server/p4.ts`
- `packages/shared/jj-core.ts`, `packages/shared/gitbutler-core.ts` (+ any tests named after them)
- `packages/review-editor/components/EvoLogPicker.tsx`
- `tests/manual/test-jj-review.ts`

Edit:

- `packages/shared/vcs-core.ts` (+ `vcs-core.test.ts`) — `createJjProvider`,
  `createGitButlerProvider`, the p4 provider, `JJ_DIFF_TYPES`, jj/gitbutler
  imports and re-exports; `VcsSelection` becomes `"auto" | "git"` (or drop the
  selection if only git is left — keep it if `review.ts` still reads it).
- `packages/server/vcs.ts` — the provider list keeps only git; drop runtimes
  and re-exports for the removed providers.
- `packages/shared/review-core.ts` — the jj/gitbutler/p4 members of the diff
  type union, `JJ_TRUNK_REVSET`, `jjCompareTargetRevset`, `jjLineBaseRevset`,
  `parseJjBookmarkName`, `quoteJjString`, `JjEvoLogEntry`, `jjEvologs`,
  `gitButlerRevision`, `parseP4DiffType`, `isP4DiffType`; `vcsType` becomes
  `"git"` or is removed. `packages/shared/types.ts` — matching re-exports.
- `packages/server/review.ts` — provider-specific branches.
- `packages/review-editor/App.tsx` — `activeGitButlerContext`,
  `canUseLiveWorkspaceActions` (becomes true where it was gating GitButler),
  evolog enter/leave logic (~1201–1215), `jj-*` members in the base-dependent
  mode checks (~1187, 1546), the `jjEvologs`/`detectedEvoBase` props (~2287),
  the jj/gitbutler empty-state strings (~2388–2399), and comments naming
  jj/p4.
- `packages/review-editor/components/DiffTypePicker.tsx` — jj descriptions
  and options; `workspace-last` description drops "or previous jj change".
- `packages/review-editor/components/FileTree.tsx`,
  `AllFilesCodeView.tsx`, `hooks/useAnnotationFactory.ts`,
  `utils/exportFeedback.ts` (+ test) — jj/gitbutler/p4 branches.
- `packages/shared/generated-files.ts`, `packages/core/external-annotation.ts`
  (+ `shared/external-annotation.test.ts`), `packages/server/generated-files-endpoint.test.ts`,
  `packages/server/review-workspace.test.ts`, `packages/shared/diff-fingerprint.test.ts`,
  `packages/shared/review-args.test.ts`, `packages/review-editor/utils/commitViewRestore.test.ts`
  — remove jj/gitbutler/p4 cases; keep git cases.
- `apps/hook/server/cli.ts` (+ `cli.test.ts`), `apps/hook/server/index.ts` —
  `--gitbutler`, `--vcs`, `--jj` flags and help text.
- `packages/server/package.json`, `packages/shared/package.json` — export entries for deleted modules.
- Docs: `README.md` (the `--gitbutler` line ~93), `apps/hook/README.md`,
  `apps/skills/core/hypermark/SKILL.md`, `packages/review-editor/.migration/*.md`.
- `scripts/install.sh`, `install.ps1`, `install.cmd` — only if they mention
  jj/GitButler/p4 as review backends (check each hit; a hit inside unrelated
  text such as a hash stays).

Binary assets that match the grep (`*.png`, `*.webm`) are false positives.
Leave them.

## Procedure

1. Delete the files above.
2. Run both typecheck lanes; fix each error by deleting the removed branch.
3. Clear the grep below.
4. `bun test packages/shared packages/server packages/review-editor apps/hook/server/cli.test.ts`.

## Completion

- `rg -n -i "gitbutler|\bjj\b|jj-|jujutsu|evolog|perforce|\bp4\b|p4-" packages apps scripts tests README.md -g '!*.png' -g '!*.webm'` → nothing.
- `bun run apps/hook/server/index.ts review --help` lists no `--gitbutler` or `--vcs`.
- Behaviour: `bun run dev:review` — the diff type picker shows only git modes; switching modes works.
- `bun run typecheck && bun run typecheck:editors` green; the step 4 tests pass.
