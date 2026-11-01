# Document view

The markdown file the session opened, rendered for reading and annotating.

## Sub-features

- Headings, paragraphs, lists, inline code chips, links, tables, code blocks (Shiki),
  math, Mermaid and callouts, rendered by `Viewer` and `BlockRenderer`.
- The header with the file's badges and the send control.
- The annotations panel on the right (empty: an Add global comment `+`).

## How to get to it (user POV)

`hypermark annotate <file>` opens `/` in the browser. No account.

## Driving it with e2e

`tests/e2e/smoke.e2e.ts` pins it on the fixture (`tests/e2e/fixtures/annotate.md`):
`screen.getByRole('heading', 'Rollout plan')`, `screen.getByText('upload_limits_enabled')`
(an inline code chip), `screen.getByText('Watch the error rate for one full day')` (a list
item). Live walk: `open_session`, `observe`. Other block types need their own fixture:
`tests/test-fixtures/` holds markdown samples for each.

## Proof

On screen: the heading, the chip and the list item visible; no console errors and no
failed requests other than `/api/draft`'s 404. Store: none, viewing writes nothing.

## Charters

```
document-render|web|skeptic|Starting at /, read the whole document and compare every heading, list, code chip and paragraph against the markdown in tests/e2e/fixtures/annotate.md; report anything missing, doubled or out of order
document-resize|web|fuzzer|Starting at /, resize the window from 420 px wide to 1600 px and scroll top to bottom at each width; report clipped text, overlapping panels or controls that go off screen
```

## Gotchas

- `/api/draft` answers 404 when no draft is saved; that is not a failed request.
- A page that looks like an older version is a stale `dist/annotate`: `bun run build:annotate`.
- Relative links and `[[wiki-links]]` render as plain text by design; nothing opens a
  second document.
