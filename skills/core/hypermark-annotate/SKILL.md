---
name: hypermark-annotate
description: Open Hypermark's annotation UI for a markdown file, plain-text config file (.yaml, .json, .toml, .ini, .csv, .log, …) and then respond to the returned annotations.
disable-model-invocation: true
---

# Hypermark Annotate

Use this skill when the user wants to annotate a document in Hypermark instead of reviewing it inline in chat.

Run for ordinary annotation/feedback:

```bash
hypermark annotate <file>
```

Run when the user asks to review, approve, accept, or gate a generated spec/document:

```bash
hypermark annotate <file> --gate --json
```

Plain `annotate` has no **Approve** button; it only supports feedback or closing the session. Never promise an approval action unless `--gate` is present. `--json` only changes the output format and does not enable approval by itself.

Behavior:

1. Launch the command with Bash.
2. Wait for the browser review to finish.
3. If annotations are returned, respond to them (see below).
4. If the session closes without feedback, say so briefly and continue.
5. In a `--gate --json` session, an approval may still carry notes — a `"decision": "approved"` result with a
   `"feedback"` field. Read those notes and carry them into subsequent work, but
   do not revise the document over them: they are guidance, not a change request.
6. If the command reports that the arguments could not be resolved to a file,
   work out which target the user means and re-run the command
   yourself with that concrete path.

The feedback has one section per annotation, with the line numbers it applies to. Each section either quotes the passage it is about (`Feedback on: "…"`) or says it is general feedback, and the user's comment follows on a `>` line. "Remove this" means the user wants that passage gone. Attached images are listed by path; read them.

Treat each comment on its own terms: answer questions, carry out requests in the file, and give your view when the user asks for it. Change only what the comments ask for. If two comments conflict, or a request is unclear, point it out and ask rather than guessing.
