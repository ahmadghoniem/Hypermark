# Fable brief — Hypermark spec pass

Branch `ui-decluttering-pass`, 18 commits ahead of `main`. 689 TS/TSX files,
~122K lines of source, ~40.5K lines across 169 test files.

## Your job

Write **specs, not code.** Every spec you produce is executed later by a cheaper
model, so each one has to stand on its own: a reader with no memory of this
conversation must be able to finish the work from the spec alone.

New specs go in `spec/` as `07-*.md` and up. `01`–`06` already exist and are
themselves a workstream (see A).

### Skills to use — all vendored in `.claude/skills/`, no plugin install needed

| Skill | Use it for |
|---|---|
| `writing-for-agents` | **Every spec you write.** This is the house style for documents another agent executes. Read it before writing the first one, not after. |
| `interface-review` | Workstream D. It is the tool for the UI pass — not a general code review. |
| `grilling` | Pressure-test each spec before you ship it. A spec that survives grilling is done; one that does not gets rewritten. |
| `better-*` (7 skills) | Narrower UI passes when `interface-review` points at typography, colour, layout, accessibility or copy specifically. |

### Rules

1. **The code is the source of truth.** Where a `spec/` file and the code
   disagree, the code wins and the spec is wrong. Old specs are a hint about
   original intent, nothing more.
2. **Do not run the test suite.** Read tests, classify them, propose deletions.
   Never execute them.
3. **Leanness is the goal.** This branch exists to delete things. When you are
   choosing between a spec that adds a mechanism and a spec that removes one,
   the removal needs a much lower bar.
4. **Attach a number to every removal you propose** — files, lines, bytes. The
   maintainer decides from the number.
5. Where you are guessing, say so in the spec. A spec that quietly invents a
   requirement costs more than one that flags an open question.

---

## A. The removals

`FABLE-REMOVALS.md` (repo root) is your starting point. It records every
feature deleted on this branch: what it was, which commit took it, what the old
specs still claim about it, and — the part that matters — every prop, type,
import, CSS class, test and dead branch that still references something gone.

Work from it. A removal that left a prop threaded through five components is a
simplification you can spec immediately: a prop that is now always `false`, a
union with one member left, a conditional with one live arm, a component that
now has one caller.

The six `spec/` files (~92 KB) are a record of what the plugin used to *claim*
to be. They are stale — they still describe the image annotator, review hover
cards, WebMCP and the paste-path input. **The codebase is the source of truth.**
Rewriting them as what the plugin *is* is the deliverable here.

WebMCP is already at zero references (commit `30b87090`); do not spec its
removal.

## B. Test pruning

40.5K lines of tests against 122K of source. Sort every test file into three
buckets and spec the deletions:

- tests for behaviour that no longer exists → delete
- tests that assert the implementation back to itself → delete
- tests that are the only coverage of something real → keep, and say in the
  spec what they cover and why nothing else does

## C. Duplication and dead code

`packages/editor`, `packages/review-editor` and `packages/ui` grew the same
helpers separately. Name each duplicate pair and pick the survivor.

## D. UI refinement (use `interface-review`)

Parked items, each with a pointer:

- **Review comment markers** — `packages/review-editor/components/GutterAnnotations.tsx`.
  The 14px gutter marker is easy to scroll past; the hover preview is slow to
  appear and may still be wired to an older path.
- **Mobile/touch leftovers** — `compactTouchLayout` props survive their
  removal in `packages/editor/components/AppHeader.tsx` (lines 41, 112, 155,
  157, 158, 172, 182, 183, 205, 226, 278, 291, 318, 352) and
  `packages/ui/components/PlanHeaderMenu.tsx` (lines 30, 47, 55, 60, 66, 67).
  Spec the full removal, both files and their callers.
- **Shortcuts panel** — check what it still gets wrong now that it reads the
  registry rather than a hand-kept list.
- **Decision labels** — `packages/ui/utils/decisionSpec.ts:217`. The primary
  label is frozen at `'All good'` by maintainer decision. Do not re-open it;
  audit the rest of the set against it.

## E. Removal recommendations

Argue each with a count; the maintainer decides. Mobile/touch (D above) is the
live one. Open-in-app is already gone (see `packages/ui/components/FileActionsButton.tsx`
for what replaced it).

## F. Consistency audit

Naming, prop shapes and file layout across the three apps.

---

## Settled decisions — do not re-open

- **Primary decision label** is `'All good'` (`packages/ui/utils/decisionSpec.ts:217`).
- **Comment composer shape** is the "Nested" variation: a 2px-inset outer
  container with the top strip on the outer tier and the body as its own card,
  **with the inset set to 0** — same two-tier structure, no visible offset.
- **Top strip** carries an anchor icon (not a quote glyph), the location, and
  `×` at the far right end. **No "1 of 3" counter** — multi-target counting is
  an HTML-pinpoint concept and does not apply to line quotes.
- **Expand icon** sits at the textarea's top-right, inside the container.
- **Arc grip** at the top-left corner resizes the composer in place, as a local
  alternative to the global expand.
- **Action row** holds only `Improve` (rephrases the comment the way
  improve-prompt does), `Ask` (opens the `/btw` side chat) and `Save` as the
  primary. The attachment trigger is NOT in this row.
- **Attachment control lives in the thumbnail shelf.** Empty: a plain image
  icon sitting where the shelf will be. Filled: a dashed-border tile with a `+`
  at the end of the thumbnail row. `Improve` and `Ask` keep full text labels —
  no `AI` dropdown; the composer's min-width covers both states instead.
- **Height never changes on attach.** The textarea is `flex: 1 1 auto` and
  absorbs the shelf's height, so the action row stays at the same screen Y.
  Growing downward would drop `Save` out from under the cursor and, near the
  viewport bottom, make the popover flip above the anchored line.
- **No bottom strip** and no separate image strip between the textarea and the
  actions — the shelf *is* the image row, and it only exists when filled.
- **Drop target is the whole popover**, not the dashed tile (Fitts's Law).
- **Attach semantics**: `<button type="button">` driving a hidden
  `<input type="file">` — not a `<label>`, not `role="button"`. Accessible name
  `Attach images` empty, `Add another image` filled. Deleting attachment *n*
  must push focus to the next item's remove button or focus drops to
  `document.body`.

---

## Not in this brief

**Session lifecycle and draft safety** — the orphaned annotate server and the
composer draft lost on Ctrl+W — is being handled directly with the maintainer.
Do not spec it.
