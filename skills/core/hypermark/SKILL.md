---
name: hypermark
description: "Reference for using the Hypermark CLI: annotating files and annotating the last assistant message. Invoke when asked to use Hypermark for anything not covered by a more specific hypermark-* skill."
---

# Hypermark CLI Reference

Hypermark is a local, browser-based review layer for agent workflows: it opens documents and your messages in an annotation UI, the human marks them up, and the structured feedback comes back to you on stdout. It runs as the `hypermark` command and every surface is launched explicitly from the CLI. A session runs on a random localhost port and blocks until the reviewer sends feedback, finishes with All good, or closes the session.

This skill is the knowledge layer. The `hypermark-annotate` and `hypermark-last` skills are thin launchers for the two most common actions; use this reference when you need to pick the right command or flags yourself.

## Choose the command

| The user wants | Run |
| --- | --- |
| Annotate a markdown, text, or config file | `hypermark annotate <file>` |
| Annotate your latest assistant message | `hypermark last` |
| Reopen or list live sessions | `hypermark sessions` |

## Session model

Every annotate command starts a local web server, opens the browser, and blocks until the human decides. That can take minutes. Launch it with a long (or no) command timeout, or in the background, then read stdout when the process exits. Do not kill the process to "finish" a review; a session that ends without a decision reads as no feedback.

The stdout contract is the whole interface: empty output on Close session, otherwise the feedback text. All good with nothing annotated sends `User reviewed the file and has no feedback.` (`the message` / `the messages` for `annotate-last`). Address returned feedback in the same conversation.

`hypermark <command> --help` prints usage without launching anything.

## hypermark annotate

```bash
hypermark annotate <target>
```

Opens one document in the annotation UI and returns the human's annotations on stdout.

Targets:

- Markdown and text files: `.md`, `.mdx`, `.txt`.
- Plain-text config and data files, rendered as text: `.yaml`, `.yml`, `.json`, `.jsonc`, `.json5`, `.toml`, `.ini`, `.cfg`, `.conf`, `.properties`, `.csv`, `.tsv`, `.log`, `.xml`, `.env.example`. `.env` itself is deliberately refused (it commonly holds secrets). Source-code files are not annotate targets. HTML files and URLs are refused.

Single files are capped at 2MB. Files are read from disk at stable project paths; keep the reviewed source where it lives.

Argument tolerance: extra words are fine (`hypermark annotate look at notes.md please` opens `notes.md`), but two resolvable targets is an error naming both, and an unrecognized dashed token disables the tolerance so flag typos fail loudly. When nothing resolves in a plain multi-word invocation, the CLI prints an agent-addressed handoff on stdout and exits 0: read it, work out the concrete target, and re-run with that exact path.

Startup failures (missing or oversized file) exit 1. A finished session exits 0 whatever the decision; parse the output instead.

## hypermark annotate-last

```bash
hypermark annotate-last [--stdin]
hypermark last
```

Opens the latest rendered assistant message from the current agent session in the annotation UI (`last` is an alias). The session log is discovered per host automatically; `--stdin` reads the content from stdin instead.

Do not print a commentary or status message immediately before running it: the command targets the latest rendered assistant message, so a preamble becomes the thing being annotated.

## hypermark sessions

```bash
hypermark sessions [--open [N]] [--clean] [--kill [N|all]]
```

Lists active Hypermark server sessions. `--open` reopens session N (default 1) in the browser, useful when a tab was closed mid-review. `--clean` drops stale entries. `--kill` ends session N (default 1), or every session with `all`, when its Claude Code process closed without the watcher noticing.

## Environment variables that change behavior

| Variable | Use |
| --- | --- |
| `HYPERMARK_PORT` | Fix the port instead of a random one. |
| `HYPERMARK_DATA_DIR` | Move the data directory (default `~/.hypermark`): history, drafts, config. |

## Do not

- Do not parse or scrape the browser UI's HTML; the CLI's stdout is the whole contract.
- Do not guess flags. Run `hypermark <command> --help` when unsure; unknown dashed tokens make annotate fail on purpose.
- Do not point `hypermark annotate` at source-code files or `.env` files; both are refused.
