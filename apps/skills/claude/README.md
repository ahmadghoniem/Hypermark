# Claude launcher skills

This directory is the **source of truth for the executing Claude Code
launchers**. The same three skill names also exist under
[`../core`](../core), but the two bodies are not interchangeable and neither
one may be swapped for the other.

| Directory | What it is | Who installs it |
| --- | --- | --- |
| `apps/skills/claude/*` | Executing templates: Claude Code runs the CLI itself, before the model reads the prompt | `~/.claude/skills` |
| `apps/skills/core/*` | Prose the model follows using its own shell | `~/.agents/skills` (shared-agent scope) |
| `apps/skills/core/hypermark` | CLI reference / knowledge skill; no injection form, so it is single-sourced into **both** scopes | both |

## What every launcher here must carry

Each of `hypermark-annotate`, `hypermark-last`, and `hypermark-review`
carries four things. Dropping any one of them changes the product:

1. **`disable-model-invocation: true`** — the command is user-invoked only.
   The model never decides to open a review session on its own.
2. **`allowed-tools: Bash(hypermark:*)`** — the injected run is pre-allowed,
   so `/hypermark-*` does not raise a permission prompt (the behavior the
   original slash commands had).
3. **Argument forwarding** — `$ARGUMENTS` passes whatever the user typed after
   the command straight through to the CLI.
4. **The bash substitution that runs before the model sees the prompt** —
   a line of the form ``!`hypermark <subcommand> $ARGUMENTS` ``. Claude Code
   executes it and substitutes its output into the prompt, so the model is
   handed the human's decision rather than being asked to go get it. Everything
   after `## Your task` interprets that output.

`apps/skills/claude/launcher-contract.test.ts` asserts all four, asserts that
the `core/` variants deliberately have neither the allowlist nor the injection,
and exercises the installers' real copy code against a path containing spaces
and non-ASCII characters. That test file sits at this directory's root rather
than inside a skill folder, so the installers (which copy named skill
directories) never ship it.

Command names are `/hypermark-*`, renamed together in spec 06 step 2;
renaming them piecemeal is a bug, not a step. The `launcher-contract.test.ts`
guard now runs the other way and fails if any launcher reintroduces an old
`hypermark-` command name.

## Native `/btw` is not one of these

`/btw` is a **native Claude Code command**. Hypermark ships no `/btw` skill,
launcher, alias, or replacement, and does not change how it is transported.

What it does: it asks a side question inside the current Claude Code
conversation without that exchange polluting the main conversation's history.

Its accepted limitation (decision D1 in
[`spec/01-foundation-and-scope.md`](../../../spec/01-foundation-and-scope.md)):
**it has no tool access.** It answers from the conversation context it already
has. It does not read new files, inspect a browser selection, or reach into a
Hypermark review session. That is fine for on-the-fly questions and is the
reason no custom skill can reproduce it — an ordinary skill cannot promise the
native command's history isolation by asking the model to behave.

Consequences for anyone working on this directory:

- Do not add a fourth skill named `btw`, or any alias that shadows it.
- Do not build a custom browser chat, a conversation rail, or an automatic
  selection upload as a stand-in for it.
- Do not promise that `/btw` inherits browser state, the reviewer's selection,
  or a specific earlier conversation. A newly spawned Claude PTY that happens
  to carry a cwd is not evidence of inherited conversation history. `/btw`
  belongs to whichever Claude conversation the user runs it in, so it has to be
  run in the intended one.

Not verified here: `/btw`'s live behavior inside an interactive Claude Code
session (including how it interacts with a blocking plan-review hook) has not
been exercised from this repository. Nothing in Hypermark installs, wraps, or
configures it, so there is no Hypermark-side transport to check — but the
end-to-end observation is still owed by whoever runs the interactive gate.
