# Draft restore

Unsent annotations survive a reload or a crashed tab: the session saves them as a draft
and offers them back.

## Sub-features

- Each change saves a debounced draft through `POST /api/draft`.
- A reload loads it (`GET /api/draft`), puts the cards back and re-applies the
  highlights.
- Removing the last annotation deletes the draft; sending deletes it too.

## How to get to it (user POV)

On `/`, add a comment, then reload the tab. No account.

## Driving it with e2e

No test yet. Locators: as in comments.md, then `browser.reload()` and the card's comment
text and the highlight. Live walk: `open_session`, add a comment, `observe`, reload,
`observe`.

## Proof

On screen after the reload: the same cards and highlights as before it. Store: one file
in `$HM_E2E_DATA_DIR/drafts/` while annotations exist, none after the last is deleted.

## Charters

```
drafts-reload|web|skeptic|Starting at /, add comments on a list item and a paragraph plus a global comment, reload, and check every card and highlight came back unchanged
drafts-churn|web|fuzzer|Starting at /, add and delete comments quickly, reload between edits, and edit a comment just before reloading; report any annotation that comes back after deletion or is lost
```

## Gotchas

- `/api/draft` answers 404 with no draft saved; the first load of a session is not an
  error.
- The draft is keyed on the file's content, so editing the fixture starts with no draft.
