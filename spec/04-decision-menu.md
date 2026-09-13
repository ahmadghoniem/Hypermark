# 04 — Decision menu: narrower, shorter copy

The header decision control's dropdown is 22rem wide with dead space on the
right, and its item subtitles are sentences. Narrow it and shorten every label
and subtitle. `All good` is frozen and stays.

## Owned files

- `packages/ui/utils/decisionSpec.ts`
- `packages/ui/utils/decisionSpec.test.ts`
- `packages/ui/components/DecisionControl.tsx` (line 538 only)
- `packages/ui/components/ActionMenu.tsx` (`ActionMenuItem`, lines 80–96)

## 1. Width

`DecisionControl.tsx:538`: `w-[22rem] max-w-[calc(100vw-2rem)]` → `w-64`
(16rem). That is the width `ActionMenu`'s own `panelWidth === 'wide'` uses, so
the two menus in the header match. The composer state that replaces the menu
(`popover === 'composer'`, the note field) shares the container; 16rem holds a
two-line note field and the `Ctrl ↵ send · Esc back` hint on one line at
`text-[11px]`. Verify in the browser that the hint does not wrap; if it does,
shorten it to `Ctrl ↵ send · Esc back` → `Ctrl ↵ · Esc` (the `note kept`
clause is already implied by "back").

`ActionMenuItem` (`ActionMenu.tsx:84`) is `px-3 py-2 text-xs` with a
`text-[10px]` subtitle. Keep the sizes; the narrower menu plus shorter copy is
enough. Do not add truncation — a subtitle that needs it is too long.

## 2. Copy — every label and subtitle

Every string `buildDecisionSpec` can emit, by state. Left column is current,
right is the recommended replacement. Frozen strings (the file's own comments
mark them `Frozen copy (maintainer-approved)`) are unchanged and listed for
completeness.

### Primary (the left segment)

| State | Current | New |
|---|---|---|
| empty, non-gate annotate | `All good` · title `Finish: records that you reviewed with no feedback` | `All good` (frozen) · title `Finish with no feedback` |
| empty, non-gate, feedback already delivered in terminal | title `Finish: sends the session record (feedback already shared in the terminal)` | title `Finish; feedback already sent from the terminal` |
| empty, gate or review | `Approve` · title `Approve: no changes requested` | `Approve` (frozen) · title `Approve, no changes` |
| feedback present | `Send Feedback` / short `Send` · title `Send your feedback to the agent` | `Send Feedback` (frozen) · title `Send feedback to the agent` |

### Menu items — empty state

| id | Current label | Current subtitle | New label | New subtitle |
|---|---|---|---|---|
| `note-with-approval` | `Approve with a note…` | `Approve and send a short note with it` | `Approve with a note…` | `A short note rides along` |
| `request-changes` (gate/review) | `Request changes…` (frozen) | `Write overall feedback, sent as a change request` | `Request changes…` | `Sent as a change request` |
| `request-changes` (non-gate) | `Send a note…` | `Write a note and send it as feedback` | `Send a note…` | `Sent as feedback` |
| `close-session` | `Close session` | `Leaves without sending anything` | `Close session` | `Sends nothing` |

### Menu items — feedback state

| id | Current label | Current subtitle | New label | New subtitle |
|---|---|---|---|---|
| `note-with-feedback` | `Send with a note…` | `Add an overall note on top of your N annotations` / `…on top of your feedback` | `Send with a note…` | `Add an overall note` |
| `approve-with-notes` | `Approve with notes` (frozen) | `Approve; your N annotations ride along as non-blocking guidance` / `Approve; your edits and attachments ride along as non-blocking guidance` | `Approve with notes` | `N annotations as guidance` / `Edits as guidance` |
| `close-session` (count > 0) | `Close, discard N annotations…` | `Leaves without sending; the agent is told you dismissed the session` | `Discard N and close…` | `Nothing is sent` |

### Composer (the popover after picking a `…` item)

| id | Current title / action | New title / action |
|---|---|---|
| `note-with-approval` | `Approve with a note` / `Approve and send note` | `Approve with a note` / `Approve` |
| `request-changes` | `Request changes` / `Send as feedback` | `Request changes` / `Send` |
| `request-changes` (non-gate) | `Send a note` / `Send as feedback` | `Send a note` / `Send` |
| `note-with-feedback` | `Send with a note` / `Send feedback with note` | `Send with a note` / `Send` |
| placeholder | `Add a note...` | `Add a note…` (typographic ellipsis, matching the labels) |

### Confirm (close with annotations)

| Current | New |
|---|---|
| title `Discard N annotations and close?` | unchanged |
| message `These annotations are not sent, and the agent is told you dismissed the session rather than approving it.` | `They are not sent. The agent is told you dismissed the session.` |
| confirm `Close anyway` (frozen) | unchanged |

Rule applied throughout: the label names the action; the subtitle says only
what the label does not — where it goes, or what rides along. Nothing restates
"the agent", "your", or the verb already in the label.

## 3. Tests

`decisionSpec.test.ts` pins labels at lines 31, 49, 67, 81, 103, 115, 129 (all
frozen — unchanged) and `toContain('Close,')` at 73 and 82. The new close label
is `Discard N and close…`, so change those two assertions to
`toContain('Discard')`. Line 249 (`not.toContain('0')`) still holds. Add no
new tests.

## Completion

- `rg -n "w-\[22rem\]" packages/ui/components/DecisionControl.tsx` → nothing.
- `rg -n "ride along|Leaves without|Write overall|Write a note" packages/ui/utils/decisionSpec.ts` → nothing.
- `rg -n "'All good'|'Approve'|'Send Feedback'|'Approve with notes'|'Request changes…'|'Close anyway'" packages/ui/utils/decisionSpec.ts` → all still present.
- Behaviour: `bun run dev:review`, open the caret next to `Approve` — the menu is 256px wide, no subtitle wraps.
- `bun run typecheck && bun run typecheck:editors` green.
