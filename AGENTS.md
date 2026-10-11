# Hypermark

A browser UI for annotating documents and Claude's messages (`src/annotate`) and reviewing diffs (`src/review`); feedback goes back to Claude Code through the skills in `skills/`. One Bun package, React 19 + TypeScript + Tailwind v4, `@/` → `src/`.

## Where things live

| Area | Files |
| --- | --- |
| CLI entry, subcommands (`annotate`, `annotate-last`, `review`) | `src/cli/index.ts`, `src/cli/cli.ts`; last-message lookup in `src/cli/session-log.ts` |
| HTTP servers behind each session | `src/server/` (`annotate.ts`, `review.ts`, `shared-handlers.ts`) |
| Annotate app shell | `src/annotate/App.tsx` |
| Composer (comment popover, quote row, quick labels, attachments) | `src/ui/components/CommentPopover.tsx`, `ComposerQuickLabels.tsx`, `CommentAttachStack.tsx` |
| Highlights | `src/ui/hooks/useAnnotationHighlighter.ts` (wraps text in `<mark class="annotation-highlight">` via `@plannotator/web-highlighter`); styles in `src/ui/theme.css` |
| Right-side annotation panel | `src/ui/components/AnnotationPanel.tsx` |
| Message rail (ticks + preview card) | `src/ui/components/MessageRail.tsx`, `src/ui/utils/messageRail.ts` |
| Markdown rendering | `src/ui/components/Viewer.tsx`, `BlockRenderer.tsx`, `blocks/` |
| Theme tokens | `src/ui/theme.css`, `src/ui/themes/`; applied by `ThemeProvider` |
| Fluid Functionalism components (vendored, MIT) | `src/ui/fluid/` |
| Component gallery (dev-only) | `src/annotate/gallery/`, served at `/gallery.html` |

`TODOs.md` at the root is the user's untracked working list: keep it untracked and leave it out of commits.

## Seeing a UI change

- The `hypermark` command runs `src/cli/index.ts` from this checkout, but serves the built `dist/*/index.html`, read once when the process starts. After a UI change: `bun run build`, then the user starts a **new** hypermark session; a tab from an older session shows the old build.
- `bun run dev:annotate` serves the annotate app with a mock API and the gallery on `http://localhost:3000`.
- Ask the user to check UI changes in the browser, and list what to try. Keep working code until they confirm the replacement matches it.

## Checks

- `bun run typecheck` and `bun run typecheck:editors` (use these, `npx tsc` resolves to the wrong package).
- `npx eslint src/ui src/annotate src/review --max-warnings 0`. The config covers only these folders and ignores `src/ui/fluid`; passing `src/server` errors.
- `bun test src/ui` for UI work; `bun test` for everything. Known failures on this machine: 3 in `src/shared/review-core.test.ts` and `validateImagePath` in `src/server/image.test.ts` (POSIX path assumption). Compare against `git stash` before blaming a change.
- `bun run build` when the UI changed.

## Conventions

- Commit messages: `area: what changed`, lowercase, self-contained, with no spec numbers or pointers to planning docs.
- Icons: Untitled UI (`@untitledui/icons`).
- Fluid components: `src/ui/fluid` stays as upstream wrote it; clean a component up when it replaces one of ours. Its surface tokens are renamed `fl-surface-N` / `fl-shadow-N` to avoid our `--surface-N`.
- Theme colors exist only under the `theme-*` class `ThemeProvider` puts on `<html>`; a page rendered without it comes out white with black text. Dark is the default (`:root:not(.light)`).
- `Annotation.createdA` in `src/ui/types.ts` is the real field name.

## `/hypermark-last` and friends

The skills run `hypermark annotate-last` before the model reads the prompt. The command blocks until the user sends or closes the browser session, so an empty or backgrounded output means the user is still annotating: wait for completion before reading it as dismissed.
