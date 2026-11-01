# Finishing the session

The send control in the header that ends the session and tells Claude Code the outcome.

## Sub-features

- All good (no annotations): sends `User reviewed the file and has no feedback.`
- Send Feedback (with annotations, a count badge): sends the feedback text, titled
  "File Feedback".
- The X before it: a secondary Close session (nothing to lose), or a red `Discard N and
  close`, which asks to confirm first; both send nothing.
- After any of them the page shows the completion screen and the CLI exits 0.

## How to get to it (user POV)

The control at the header's right on `/`. No account.

## Driving it with e2e

No test yet. Locators: `screen.getByRole('button', 'All good')`,
`screen.getByRole('button', 'Send Feedback')`, `screen.getByRole('button', 'Close
session')` or `screen.getByRole('button', 'Discard 1 and close')` and the confirm dialog. Live walk: `open_session`, add a comment (see comments.md), tap `Send Feedback`,
`observe` the completion screen, then read `.e2e/logs/app.log`.

## Proof

On screen: the completion screen. Store: the feedback text (or nothing, for Close
session) at the end of `.e2e/logs/app.log`; a record in
`$HM_E2E_DATA_DIR/feedback/<project>/index.jsonl` with `decision` `feedback`; the draft in
`$HM_E2E_DATA_DIR/drafts/` deleted.

## Charters

```
decision-send|web|skeptic|Starting at /, add two comments and a global comment, then press Send Feedback; check the count on the button against the panel and the completion screen against what was sent
decision-close|web|fuzzer|Starting at /, add a comment, press the red X, cancel the discard confirm, press it again and Escape, then confirm it; report any path that sends feedback or closes without confirming
```

## Gotchas

- Every decision ends the session: the CLI exits and later steps in the same run find no
  server. A test that sends runs in its own `e2e run`, or last.
- The CLI also ends the session when no tab stays connected for 30 s (the client lease).
