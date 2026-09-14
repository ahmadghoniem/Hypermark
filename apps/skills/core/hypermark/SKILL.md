---
name: hypermark
description: "Reference for using the Hypermark CLI: plan review, code review, annotating files, URLs, folders, and running local apps, annotating the last assistant message, and browsing archived plan decisions. Invoke when asked to use Hypermark for anything not covered by a more specific hypermark-* skill."
---

# Hypermark CLI Reference

Hypermark is a local, browser-based review layer for agent workflows: it opens plans, diffs, and documents in an annotation UI, the human marks them up, and the structured feedback comes back to you on stdout. It installs as a single `hypermark` binary plus per-host hooks, so plan review fires automatically when you exit plan mode; every other surface is launched explicitly from the CLI. A session runs on a random localhost port and blocks until the reviewer submits feedback, approves, or closes the tab.

This skill is the knowledge layer. The `hypermark-review`, `hypermark-annotate`, and `hypermark-last` skills are thin launchers for the three most common actions; use this reference when you need to pick the right command or flags yourself.

## Choose the command

| The user wants | Run |
| --- | --- |
| Review a plan you produced | Nothing. Plan review opens automatically on plan exit via hooks. Never run bare `hypermark` yourself. |
| Review and explicitly approve a plan/spec saved as a file | `hypermark annotate <file> --gate --json` |
| Review current code changes | `hypermark review` |
| Review a GitHub PR or GitLab MR | `hypermark review <PR_URL>` |
| Annotate a markdown, text, config, or HTML file | `hypermark annotate <file>` |
| Annotate your latest assistant message | `hypermark last` |
| Reopen or list live sessions | `hypermark sessions` |

## Session model

Every review or annotate command starts a local web server, opens the browser, and blocks until the human decides. That can take minutes. Launch it with a long (or no) command timeout, or in the background, then read stdout when the process exits. Do not kill the process to "finish" a review; a session that ends without a decision reads as no feedback.

The stdout contract is the whole interface:

- Plaintext (default): empty output on close, `The user approved.` on approve, otherwise the feedback text. Address returned feedback in the same conversation.
- `--json`: one JSON record, `{"decision":"approved"|"dismissed"|"annotated","feedback":"..."}`. An approval may still carry notes in `feedback`; treat those as guidance, not a change request.
- `--hook`: hook-native output for real PostToolUse/Stop hook contexts only. Approve/close emits nothing (hook passes); annotations emit `{"decision":"block","reason":"..."}`. `--hook` implies the gate UI. Never use it for a normal interactive invocation.

`hypermark <command> --help` prints usage without launching anything. Bare `hypermark` is the hook entry point and expects hook JSON on stdin.

## hypermark review

```bash
hypermark review [--git]
```

Reviews local VCS changes. Feedback and annotations come back on stdout when the reviewer submits; an approval comes back as an LGTM-style message.

- VCS is Git. `--git` forces plain Git (skipping auto-detection). Running from a non-VCS parent folder that contains nested repos produces a combined workspace diff.
- The default diff is "everything a PR would show now": merge-base of the trunk vs the working tree plus untracked files. The reviewer can switch diff types in the UI; you do not control that from the CLI.

## hypermark annotate

```bash
hypermark annotate <target> [--markdown] [--render-html] [--gate] [--json] [--hook]
```

Opens one document in the annotation UI and returns the human's annotations on stdout.

Plain `annotate` is feedback-only: it shows **Close** but no **Approve** button. When the user asks to review, approve, accept, or gate a generated plan/spec/document saved as a file, always add `--gate --json`. Do not tell the user they can approve a plain `annotate` session. If the plan is being handed off through the host agent's native plan flow, do not launch `annotate`; let the plan-exit hook open the approval UI automatically.

Targets:

- Markdown and text files: `.md`, `.mdx`, `.txt`.
- Plain-text config and data files, rendered as text: `.yaml`, `.yml`, `.json`, `.jsonc`, `.json5`, `.toml`, `.ini`, `.cfg`, `.conf`, `.properties`, `.csv`, `.tsv`, `.log`, `.xml`, `.env.example`. `.env` itself is deliberately refused (it commonly holds secrets, and annotate history copies file contents). Source-code files belong to `hypermark review`, not annotate.
- HTML files (`.html`, `.htm`): rendered as the raw page by default; `--markdown` converts to markdown instead. `--render-html` is accepted for compatibility; raw rendering is already the default.

Single files are capped at 2MB. Files are read from disk at stable project paths; keep the reviewed source where it lives.

Argument tolerance: extra words are fine (`hypermark annotate look at notes.md please` opens `notes.md`), but two resolvable targets is an error naming both, and an unrecognized dashed token disables the tolerance so flag typos fail loudly. When nothing resolves in a plain multi-word invocation, the CLI prints an agent-addressed handoff on stdout and exits 0: read it, work out the concrete target, and re-run with that exact path.

### Strict gates and exit codes

For a machine-checkable approval gate, add `--gate --json` plus one or both strict flags:

```bash
hypermark annotate report.md --gate --json --require-approval --result-file /tmp/decision.json
```

- `--require-approval`: exit code reports the human outcome.
- `--result-file <path>`: the stdout decision JSON is also published atomically to `<path>`. The parent directory must exist and the file must not; results resolve from the invocation cwd.

Exit codes under a strict flag (grep convention):

| Exit | Meaning |
| --- | --- |
| 0 | Approved. The only success. |
| 1 | The reviewer did not approve (annotated or dismissed); the decision record was still published. |
| 2 | The gate itself failed: bad flag combination, startup failure (missing file, unreachable URL, oversized file), or the result file could not be published. Never treat as a reviewer outcome. |
| 128+n | Killed by signal n. |

Without strict flags, startup failures exit 1 and the exit code carries no decision; parse the output instead. Both strict flags require `--gate --json` and reject `--hook`.

## hypermark annotate-last

```bash
hypermark annotate-last [--stdin] [--gate] [--json] [--hook]
hypermark last
```

Opens the latest rendered assistant message from the current agent session in the annotation UI (`last` is an alias). The session log is discovered per host automatically; `--stdin` reads the content from stdin instead.

Do not print a commentary or status message immediately before running it: the command targets the latest rendered assistant message, so a preamble becomes the thing being annotated.

## hypermark sessions

```bash
hypermark sessions [--open [N]] [--clean]
```

Lists active Hypermark server sessions. `--open` reopens session N (default 1) in the browser, useful when a tab was closed mid-review. `--clean` drops stale entries.

## Other subcommands

```bash
hypermark uninstall [--purge] [--yes] [--dry-run]
```

- `uninstall` removes Hypermark-installed components (`--purge` also deletes local data; `--yes` is required without a TTY; `--dry-run` previews).

## Environment variables that change behavior

| Variable | Use |
| --- | --- |
| `HYPERMARK_PORT` | Fix the port instead of a random one. |
| `HYPERMARK_ORIGIN` | Override agent-origin detection. This fork installs only `claude-code`; the other ids are still recognized so older saved records keep a readable origin tag. |
| `HYPERMARK_DATA_DIR` | Move the data directory (default `~/.hypermark`): plans, history, drafts, config. |
## Do not

- Do not parse or scrape the browser UI's HTML; the CLI's stdout is the whole contract.
- Do not use `--hook` outside a real hook context; use `--json` when you need structured output.
- Do not run bare `hypermark` interactively; it is the hook entry point.
- Do not guess flags. Run `hypermark <command> --help` when unsure; unknown dashed tokens make annotate fail on purpose.
- Do not point `hypermark annotate` at source-code files or `.env` files; code goes through `hypermark review`, and `.env` is refused.
- Do not start a strict gate (`--require-approval`) unless a human is actually there to review; the session blocks until they act.
