# Comments

Highlighting text and commenting on it, plus global comments, shown as cards in the
annotations panel.

## Sub-features

- Select text with the mouse: the comment composer opens under the selection and the
  text is wrapped in `<mark class="annotation-highlight">`.
- Add comment (or Ctrl+Enter) saves a card in the panel; Escape or an outside click
  closes an empty composer and keeps a non-empty one.
- Add global comment (`+` in the panel) opens the composer for a comment on the whole
  document.
- A card's Edit annotation and Delete annotation buttons; clicking a card selects it and
  scrolls its highlight into view; clicking a highlight opens its edit composer.

## How to get to it (user POV)

On `/`, drag across text in the document, or press the panel's `+`. No account.

## Driving it with e2e

`tests/e2e/comment.e2e.ts` pins the selection comment; `tests/e2e/agent/comment.e2e.ts`
is the same flow with `agent.act('Add the comment.')`. Locators: `selectText(browser,
screen, 'Watch the error rate for one full day')`, `screen.getByRole('textbox',
'Comment')`, `screen.getByRole('button', 'Add comment')`, `screen.getByRole('button',
'Add global comment')`, `screen.getByRole('button', 'Edit annotation')`,
`screen.getByRole('button', 'Delete annotation')`. Live walk: `open_session`, drag across
the list item, `observe`, type into the `Comment` node, tap `Add comment`, `observe`.

## Proof

On screen: the card shows the comment text, and the selected text is highlighted (a
`mark.annotation-highlight` whose text equals the dragged text). Store: a debounced
draft lands in `$HM_E2E_DATA_DIR/drafts/` holding the annotation.

## Charters

```
comments-flow|web|skeptic|Starting at /, highlight three different sentences and add a comment to each, then edit one and delete one; check that every card's quote and comment matches its highlight
comments-select|web|fuzzer|Starting at /, try selections that cross an inline code chip, span two list items, cover only whitespace, or come from double and triple clicks; report any highlight that does not match the selected text or any empty annotation
```

## Gotchas

- A non-empty composer refuses a new selection on purpose: the draft keeps its text and
  focus until it is saved or cleared.
- A selection across two list items makes one annotation with no mark in the bullet.
- The decision models never type: the comment text is filled by a locator.
