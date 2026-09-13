# 11 — Sweep

Mechanical leftovers after every other spec has merged: exports, files,
dependencies and tests that point at something removed. Runs last, in wave 4,
after spec 02.

## Owned files

Whatever `knip` and the greps name, plus `knip.json`, every `package.json`,
`bun.lock`, and `tests/manual/**`.

## Baseline (before the waves)

`bunx knip --no-progress` on the current tree reports:

- **21 unused files**: `packages/shared/review-core.test-d.ts`; four
  `packages/ui/test-consumer/*.tsx` (these are compiled by
  `tsconfig.strict-consumer.json` — a false positive; add them as `entry` for
  the `packages/ui` workspace); `scripts/dast/target.ts`; four
  `scripts/release-security/*.mjs` (run by `.github/workflows/release.yml` and
  `security.yml` — false positive; add `scripts/**/*.mjs` as root `entry`);
  eleven under `tests/manual/` (3,425 lines, 189K).
- **4 unused dependencies**: `tailwindcss` (apps/review), `@anthropic-ai/claude-agent-sdk` (root — spec 09 A8), `@fontsource-variable/geist-mono`, `@fontsource-variable/inter` (packages/ui).
- **3 unused devDependencies**: `glimpseui` (server), `@happy-dom/global-registrator`, `tailwindcss` (ui).
- **1 unlisted binary**: `taskkill.exe` — Windows only, correct; add to `ignoreBinaries`.
- **26 unused exports**, **16 unused exported types**.
- **12 configuration hints** for `knip.json` itself.

## Procedure

1. Rebase on the merged tree. Run `bunx knip --no-progress > /tmp/knip.txt`.
2. **Config first.** Apply the configuration hints: drop the redundant
   `ignore`/`ignoreBinaries` entries and the redundant `packages/ui` entry
   patterns; add `entry` for `packages/ui/test-consumer/*.tsx` and root
   `scripts/**/*.mjs`; add `taskkill.exe` to `ignoreBinaries`; set
   `"ignoreDependencies"` for packages that are CSS-only side-effect imports
   **only after** checking each: `@fontsource-variable/inter` and
   `geist-mono` are `@import`ed from `packages/editor/index.css:1–2` and
   `packages/review-editor/index.css:1–2`, but declared in
   `packages/ui/package.json`. knip cannot see CSS imports. Move the two
   dependencies to `packages/editor/package.json` and
   `packages/review-editor/package.json` (they are the consumers) and list
   them under `ignoreDependencies` for those two workspaces. Re-run.
3. **Files.** Delete every remaining unused file. `tests/manual/` is eleven
   hand-run scripts for servers and fixtures for removed features
   (`test-jj-review.ts`, `test-worktree-review.ts`, `vim-ux-smoke.md` — Vim
   modes are gone). Delete the directory unless the maintainer says otherwise;
   log the count.
4. **Dependencies.** Remove every unused dependency knip still lists after
   step 2. `tailwindcss`: `bunfig.toml` sets `linker = "isolated"`, so a
   package only resolves what it declares — nothing is "pulled transitively".
   **Keep** it in `packages/ui` devDependencies (`packages/ui/styles-entry.css`
   imports it and `ui` otherwise lists it only as a peer); add it to that
   workspace's `ignoreDependencies` if knip still flags it. In `apps/review`,
   remove it only if `bun install && bun run --cwd apps/review build` still
   succeeds afterwards; otherwise keep it and add it to `ignoreDependencies`.
   `glimpseui`: `server/browser.ts:56` looks it up
   with `Bun.which` at runtime — an optional external binary, not an import;
   remove the devDependency. `@happy-dom/global-registrator`: nothing in
   `bunfig.toml`'s `[test] preload` or `tests/setup/` references it
   (`rg happy-dom bunfig.toml tests packages/ui` → nothing); remove.
5. **Exports.** For each unused export and type: delete the `export` keyword
   if the symbol is used in its own file, delete the symbol if not. Types in
   the list that spec 05 or 09 delete wholesale (`CodeNavRequest`, `SectionEntry`,
   `RowDecorationPart`) will already be gone.
6. **Leftover greps.** Each must return nothing on the merged tree:

   ```
   rg -n "archive|Archive" packages apps --type ts -g '!*.test.ts' | rg -v "feedback-archive|archiveAnnotateDecision|archiveReviewDecision|persistSubmittedDecision|FeedbackArchive|\.tar|zip"
   rg -n "viewed|Viewed" packages/review-editor packages/ui --type ts | rg -v "reviewed|Reviewed|previewed|Previewed"
   rg -n "quickLabel|QuickLabel|isQuickLabel" packages apps
   rg -n "documentReadOnly" packages
   rg -n "dockview|code-nav|codeNav" packages apps package.json
   rg -n "OpenCode|opencode|Codex|codex|\bPi\b server|Pi mirror" packages apps --type ts -g '!*.test.ts'
   rg -n "supportsAnnotateClientLease|clientLeaseSupported|Draft Recovered" packages apps
   rg -n "stagedFiles|StagedDot" packages
   rg -n "vscode-diff|VSCodeIcon" packages
   rg -n "onCleanup" packages/server/review.ts
   rg -n "goal-setup|GoalSetup|setup-goal" packages apps
   rg -n "live-proxy|live-probe|liveApp|annotate-app|--app\b|--static\b" packages apps
   rg -n "annotate-folder|FileBrowser|useFileBrowser" packages apps
   rg -n "urlToMarkdown|url-to-markdown|Jina|jina" packages apps
   rg -n -i "gitbutler|\bjj\b|jujutsu|evolog|perforce|\bp4\b" packages apps
   rg -n -i "obsidian|octarine|\bbear\b" packages apps
   ```

   The `Pi` grep will hit comments in `shared/annotate-client-lease.ts`,
   `shared/html-diff.ts`, `shared/feedback-archive.ts`, `server/annotate.ts`,
   `core/external-annotation.ts` (10 sites) that describe a "Pi server"
   mirror that no longer exists. Rewrite each comment to describe only the
   Bun server.
7. **Tests that still point at removed things.** After steps 3–6,
   `rg -n "from ['\"]\./" packages apps -g '*.test.ts'` resolved against disk
   (the one-liner in spec 01's audit) must show no broken import. Any test
   whose subject was deleted by a spec and that the spec forgot: delete it
   here and name it in the report.
8. Final: `bunx knip --no-progress` exits 0 with no findings; both typecheck
   lanes green; `bun install` leaves `bun.lock` clean (`git status` shows the
   lock only if a dependency changed).

## Report

The sweep's output is a list, appended to `FABLE-REMOVALS.md` as §30: files
deleted (count and lines), dependencies removed (names), exports removed
(count), comments rewritten (count).

## Completion

- `bunx knip --no-progress` → exit 0, `Unused files (0)`, no unused (dev)dependencies, no unused exports.
- Every grep in step 6 → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
