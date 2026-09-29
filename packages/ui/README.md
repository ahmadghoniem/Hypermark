# @hypermark/ui

Hypermark's shared document UI: markdown rendering, themes, the annotation editor, settings, comments, and layout. It is used by `packages/editor`, `packages/review-editor`, `apps/hook` and `apps/review`. It is a private workspace package and is not published.

`@hypermark/core` sits underneath it: a small, browser-safe, zero-dependency package of pure utilities and types. Keep it free of `node:` imports.

## Folders

- `components/` React components (viewer, annotation panel, popovers, `html-viewer/`, `plan-diff/`, `sidebar/`, `ui/`, `icons/`).
- `config/` the settings store (`configStore`), setting definitions, and `useConfig`. Settings persist in cookies and sync to the server's `/api/config`.
- `hooks/` shared hooks, including the annotation draft hooks that talk to `/api/draft`.
- `utils/` helpers: cookie storage, image upload (`/api/upload`), math renderer slot, annotation serialization.
- `lib/`, `shortcuts/`, `themes/`, `theme.css`, `types.ts` supporting code and styling.

## Notes

- Math: `utils/math-eager` registers KaTeX synchronously so math is typeset on the first commit. Without it, `loadMathRenderer()` loads KaTeX lazily.
- Tests run with `bun test` from the repo root.
