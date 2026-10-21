---
name: hypermark-last
description: Open Hypermark on the latest rendered assistant message and use the returned annotations to revise that message or continue.
disable-model-invocation: true
---

# Hypermark Last

Use this skill when the user wants to annotate the latest assistant response in Hypermark.

Do not send a commentary/status message before running the command. The command
targets the latest rendered assistant response, so a preamble can mistakenly become the
thing being annotated.

Run:

```bash
hypermark last
```

Behavior:

1. Launch the command with Bash.
2. Wait for the annotation session to finish.
3. If feedback is returned, respond to it in the follow-up response (see below).
4. If the session closes without feedback, mention that briefly and continue.
5. An approval may still carry notes — a `"decision": "approved"` result with a
   `"feedback"` field. Read those notes and carry them into subsequent work, but
   do not redo the message over them: they are guidance, not a change request.

The feedback has one section per annotation. Each section either quotes the passage of your message it is about (`Feedback on: "…"`) or says it is general feedback, and the user's comment follows on a `>` line. "Remove this" means the user wants that passage gone. Attached images are listed by path; read them.

Treat each comment on its own terms: answer questions, carry out requests, and give your view when the user asks for it. If two comments conflict, point it out and ask rather than guessing.
