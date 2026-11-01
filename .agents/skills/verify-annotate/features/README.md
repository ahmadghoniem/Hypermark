# Feature map

One file per user-facing feature of the annotate app, from the reviewer's point of view.
Each names the test that pins it, the locators that matter, the proof, and its bug-bash
charters. Every feature is on `/` of a `hypermark annotate <file>` session. Not mapped
yet: the message rail and message switching of `hypermark annotate-last` (needs a
fixture session log through `CLAUDE_CONFIG_DIR`), Tab widening during a drag, quick
labels, image attachments, settings and themes.

| Feature | Route | Test | Status |
| --- | --- | --- | --- |
| [Document view](document.md) | `/` | `tests/e2e/smoke.e2e.ts` | tested |
| [Comments](comments.md) | `/` | `tests/e2e/comment.e2e.ts`, `tests/e2e/agent/comment.e2e.ts` | tested (selection comment only) |
| [Side chat](side-chat.md) | `/` | `tests/e2e/side-chat.e2e.ts` | tested |
| [Finishing the session](decision.md) | `/` | none | untested |
| [Draft restore](drafts.md) | `/` | none | untested |
