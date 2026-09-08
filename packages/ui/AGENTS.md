# Working on `@hypermark/ui`

This is the **published, reusable document UI** (`@hypermark/ui` + `@hypermark/core`). The commercial Workspaces app installs it and plugs in its own backend; Plannotator uses the defaults. See **`README.md`** in this directory for the architecture (packages, seams, `configureHypermarkUI`, publishing).

**The rules when editing here:**

- **Do not reimplement the document UI from scratch.** A prior from-scratch rewrite broke the app and was reverted.
- To support a host's different backend, **add an optional seam** (a module-level `setX`/`resetX` default, or an optional prop) whose default reproduces today's behavior. Plannotator passes nothing and stays **byte-for-byte unchanged**.
- `@hypermark/core` is browser-safe and zero-dep — **no `node:` imports** (CI enforces it). `@hypermark/shared`/`@hypermark/ai` stay private; `shared` re-exports `core` via shims.
- **Never delete working Plannotator code until a human confirms parity in the browser.**
