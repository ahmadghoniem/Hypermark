# Fable brief — Hypermark

Branch `ui-decluttering-pass`. Hypermark is a single-user, Windows-first,
Claude Code-only fork of Plannotator.

## Your job

Audit the code and write **specs**. Other agents write the code. Two outcomes
count equally: a leaner product, with features the maintainer does not use
removed, and a better interface, refined with `interface-review`.

`spec/` is empty. Every spec you write starts fresh there.

### Context

`FABLE-REMOVALS.md` is the record of what this branch has already removed and
changed, plus the foundation the old specs laid down. Read it first, then check
the code against it. Where the two disagree, the code wins.

There is no other reference. `AGENTS.md` is empty on purpose.

### Skills — vendored in `.claude/skills/`

| Skill | Use it for |
|---|---|
| `writing-for-agents` | Every spec. Read it before writing the first one. |
| `interface-review` | The UI pass (§C). |
| `better-*` (7) | Narrower passes when `interface-review` points at typography, colour, layout, accessibility, UI or copy. |
| `grilling` | Pressure-test each spec before it ships. A spec that survives grilling is done. |

### Rules

1. **Leave the test suite unrun.** Read tests and classify them; never execute
   them.
2. **Count every removal** in files, lines or bytes. The maintainer decides from
   the number.
3. **Flag guesses.** Where you are inferring a requirement, say so in the spec
   as an open question.
4. **Windows first.** Performance on Windows and process lifecycle there are
   first-class concerns, not portability afterthoughts. §E is the evidence.

## How your specs get executed

An **orchestrator** agent (Opus) reads your specs and dispatches each one to an
**executor** (Gemini 3.8 Flash or Sonnet). Three to five executors run in
parallel, each in its own git worktree, and their branches merge back into
`ui-decluttering-pass`.

Write every spec for that pipeline:

- **Self-contained.** An executor with no memory of this brief finishes the work
  from the spec alone.
- **Owned files.** Name the files each spec changes. Two specs that touch the
  same file cannot run in parallel; group them into one wave or sequence them.
- **Waves.** Publish an execution plan: which specs run together, which wait,
  and the merge order.
- **Checkable finish.** End each spec on a completion criterion the orchestrator
  can check: a grep that must return nothing, both typecheck lanes
  (`bun run typecheck` and `bun run typecheck:editors`), a behaviour to observe.

The orchestrator verifies each spec as it lands, and that helps. The
verification that counts is yours: after the waves merge, you review the landed
code against the specs you wrote.

Spend your effort on judgement. Mechanical leftovers — props, imports, CSS,
exports and tests that still point at something removed — go into one
**sweep** spec that an executor runs with the repo's `knip.json` and grep.

---

## A. Test pruning

Sort every test file into three buckets and spec the deletions:

- tests for behaviour that no longer exists → delete
- tests that assert the implementation back to itself → delete
- tests that are the only coverage of something real → keep, and say what they
  cover and why nothing else does

## B. Duplication

`packages/editor`, `packages/review-editor` and `packages/ui` grew the same
helpers separately. Name each duplicate pair and pick the survivor.

Then audit consistency across the plan and review apps: naming, prop shapes and
file layout. They should read as one product.

## C. UI refinement

Run `interface-review` across both apps. The maintainer has already raised the
items below; each is an observation to audit and spec, not a finished design.

**Messages panel** — `packages/ui/components/sidebar/MessagesBrowser.tsx`, in
the left side panel.

- Remove the "Recent messages — newest first" heading.
- The star icon beside the current message and its number reserves space even
  when absent. Remove it.
- A gutter of dead space on the left of each message truncates the text far
  earlier than it needs to. Remove it.

**Decision menu** — `packages/ui/components/DecisionControl.tsx:538`, the
dropdown whose items carry subtitles such as "Write a note and send it as
feedback" (`packages/ui/utils/decisionSpec.ts`).

- Narrow it; there is dead space on the right.
- List every label and subtitle across its states. Recommend shorter wording
  wherever the text is verbose, so it fits the narrower menu. The primary label
  `All good` stays as it is.

**Review dock tabs.** The tab strip survives only because collapse-all lives in
it. Move collapse-all next to the split/unified toggle in the review header,
then remove the tab strip.

**Scrollbars.** Hide the scrollbar stepper arrows at the top and bottom of
scrollbars in the review app.

**Input method default.** Pinpoint opens as the default every time. Default to
Select. The default lives in `packages/ui/utils/inputMethod.ts`.

**Global comment composer.**

- The top strip still renders on a global comment.
- The scrollbar belongs to the textarea, not the whole card.
- The resize grip resizes only vertically.

**Editing an annotation in the plan-review sidebar.** The edit button reopens
the annotation for editing, and its textarea is larger than the annotation's
normal display. Editing should look like the review app's annotations. The two
apps should read as different states of one product, not two products.

**Files tab.** Remove the Files tab from the left panel in annotate and
annotate-last, end to end. It is `showFilesTab` in
`packages/ui/components/sidebar/SidebarContainer.tsx`.

**Review comment markers** — `packages/review-editor/components/GutterAnnotations.tsx`.
The 14px gutter marker is easy to scroll past, and the hover preview is slow to
appear.

## D. Removal recommendations

The maintainer found the analysis and pull-request features only by stumbling on
them, and removed both. Having seen everything in `FABLE-REMOVALS.md`, recommend
what else they would likely cut or trim. Argue each with a count.

Open questions already known, each still live in the code:

- `packages/ui/hooks/useViewportEnvironment.ts`, 350 lines of observed-viewport
  machinery. Does it still earn its place on a desktop-only product?
- The VS Code diff path: `packages/ui/components/plan-diff/PlanDiffViewer.tsx`
  and `VSCodeIcon.tsx`.
- The per-row staged dot in the review tree is informational. Does it earn the
  prop threading through `App.tsx`, `FileTree.tsx` and `SectionsPanel.tsx`?
- The `note-with-approval` decision, in `packages/editor/annotateDecision.ts:35`
  and `packages/review-editor/reviewDecision.ts:56`. Two comments describe it as
  a deliberate safety net.
- The permission-mode fallback arm at `packages/server/index.ts:441-442` is
  reachable only from a caller that omits `permissionMode`. Does any live
  caller still omit it?
- Two comments in `packages/editor/App.tsx` (around lines 1880 and 2922) still
  describe OpenCode, an agent this fork does not support.
- Shortcut bindings with no handler. `goalSetup.shortcuts.ts` is one; count them
  all before proposing a check that catches them.
- The root `package.json` depends on `@anthropic-ai/claude-agent-sdk`, which no
  code imports. It is named as a sentinel in
  `scripts/release-security/release-evidence.mjs:30`.

## E. Session lifecycle and draft safety

### E1. Drafts survive a closed tab

Closing the tab with an open composer loses whatever was typed. Reopening a
session with saved annotations shows a "Draft Recovered" dialog asking whether
to restore them (`packages/editor/App.tsx:4278`,
`packages/review-editor/App.tsx:2342`).

The maintainer wants:

- The open composer persisted through the **existing draft endpoint**, the one
  saved drafts already use.
- Annotations **restored automatically** on reopen, with no dialog.
- The browser's own leave-site prompt left out: it asks, and saves nothing.
- The annotate **abandonment lease always on**. Today it is gated to direct
  structured invocations by `supportsAnnotateClientLease`
  (`apps/hook/server/annotate-output.ts:36`,
  `options.gate && options.json && !options.hook`).

### E2. Orphaned servers on Windows

Servers outlive the sessions that started them. Six
`bun run apps/hook/server/index.ts` processes were found alive at once, the
oldest twelve hours past its session.

Two shapes have been proposed and neither is chosen:

1. A **stale-session reaper** that exits a server whose session is gone.
2. A **`hypermark sessions --kill`** command that lists live servers and ends
   them on demand.

Spec both. Argue which is right, with a count of what each costs, and say what
happens to a server whose browser tab is still open. Then look for other ways
Hypermark leaves processes, ports or files behind on Windows.
