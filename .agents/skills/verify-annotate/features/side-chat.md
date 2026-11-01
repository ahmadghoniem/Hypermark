# Side chat

A question about the selected text, answered by the Claude Code session that wrote it,
in a card beside the document; it adds no annotation.

## Sub-features

- `/sidechat <question>` in the comment composer turns Add comment into Ask a side
  question; Alt+Enter also asks.
- The Side question dialog streams the answer under the question; Stop keeps the text so
  far and brings back Send.
- A follow-up typed in the card shows below the first answer; Escape closes the card.

## How to get to it (user POV)

On `/`, select text, type `/sidechat why …` in the composer, press Ask a side question.
In a real session the answer comes from the Claude Code session behind
`annotate-last`; in the e2e config it is the stub.

## Driving it with e2e

`tests/e2e/side-chat.e2e.ts` pins it. Locators: `screen.getByRole('textbox',
'Comment')`, `screen.getByRole('button', 'Ask a side question')`,
`screen.getByRole('dialog', 'Side question')`, and inside it `getByText(<question>)`,
`getByText('Because a full day covers the daily traffic peak.')` (the stub answer),
`getByRole('button', 'Send')`. Live walk: `open_session`, drag across a sentence, type
the `/sidechat` question, tap `Ask a side question`, `observe` until the answer shows.

## Proof

On screen: the dialog shows the question, then the full stub answer, then Send enabled
again; the panel gains no card. Store: none with the stub.

## Charters

```
sidechat-flow|web|skeptic|Starting at /, select a sentence and ask a /sidechat question, then a follow-up, then stop one mid-answer; check that each question keeps its own answer and that no annotation card appears
sidechat-input|web|fuzzer|Starting at /, ask /sidechat with no question, with 2000 characters, with markdown and with only spaces; report what is sent, refused or lost
```

## Gotchas

- The stub answers every question with the same sentence; a repeated answer is not a bug.
- Without the stub, an `annotate` session has no Claude Code session to resume, so the
  card shows the not-connected line; that is expected outside `annotate-last`.
