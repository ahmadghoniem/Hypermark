# Working on `@hypermark/ui`

Hypermark's shared document UI, used by the editor and review apps. See `README.md` for the folder layout.

Rules when editing here:

- Do not reimplement the document UI from scratch. A prior from-scratch rewrite broke the app and was reverted.
- `@hypermark/core` is browser-safe and zero-dep: no `node:` imports (CI enforces it). `@hypermark/shared` stays private; `shared` re-exports `core` via shims.
- Do not delete working code until a human confirms parity in the browser.
