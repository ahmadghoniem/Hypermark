# Claude launcher skills

This directory is the **source of truth for the executing Claude Code
launchers**. The same three skill names also exist under
[`../core`](../core), but the two bodies are not interchangeable and neither
one may be swapped for the other.

| Directory | What it is | Who installs it |
| --- | --- | --- |
| `skills/claude/*` | Executing templates: Claude Code runs the CLI itself, before the model reads the prompt | `~/.claude/skills` |
| `skills/core/*` | Prose the model follows using its own shell | `~/.agents/skills` (shared-agent scope) |
| `skills/core/hypermark` | CLI reference / knowledge skill; no injection form, so it is single-sourced into **both** scopes | both |

## What every launcher here must carry

Each of `hypermark-annotate` and `hypermark-last` carries four things. Dropping any one of them changes the product:

1. **`disable-model-invocation: true`** — the command is user-invoked only.
   The model never decides to open an annotate session on its own.
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

The `core/` variants have neither the allowlist nor the injection. Nothing
checks these properties automatically, so check every launcher when you touch
one. Command names are `/hypermark-*` and are renamed together.

## The side chat is not a skill

The annotate-last browser session has its own side chat: `/sidechat` in the
comment composer asks a question about the message without leaving the
browser (`src/server/side-chat.ts`). It resumes the user's Claude Code session
in print mode with `--no-session-persistence`, so the answer sees the whole
conversation and nothing is written back to it; a hook lets only read-only
tool calls run. It needs no launcher here. Claude Code's native `/btw` is
separate, and Hypermark doesn't wrap or shadow it: don't add a skill named
`btw`.
