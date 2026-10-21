---
name: hypermark-last
description: Open Hypermark on the latest rendered assistant message and use the returned annotations to revise that message or continue.
allowed-tools: Bash(hypermark:*)
disable-model-invocation: true
---

# Hypermark Last

## Message annotations

!`hypermark annotate-last $ARGUMENTS`

## Your task

The user read your last message in Hypermark. The output above is their decision, in one of these forms:

1. `The user approved.`, or JSON with `"decision": "approved"`: the user accepts the message. If the JSON also has a `"feedback"` field, those are notes to carry into later work; they don't ask you to revise the message. Reply "Approved." and start no work.
2. Empty, or JSON with `"decision": "dismissed"`: the user closed the session without feedback. Reply "Annotation session closed." and start no work.
3. Annotation feedback, as text or as JSON with `"decision": "annotated"` and a `"feedback"` field: respond to it as described below.
4. A note that the command was moved to the background: the user is still annotating, since the command only returns once they send or close the session. Wait for the completion notification, read the output file it names, and handle that output as above. The wait is not a dismissal.

The feedback has one section per annotation. Each section either quotes the passage of your message it is about (`Feedback on: "…"`) or says it is general feedback, and the user's comment follows on a `>` line. "Remove this" means the user wants that passage gone. Attached images are listed by path; read them, since the comment often refers to them.

Treat each comment on its own terms: answer questions, carry out requests, and give your view when the user asks for it. The quoted passage tells you which part of your message the comment is about. If two comments conflict, or a comment conflicts with something the user said earlier, point it out and ask rather than guessing. Leave out the parts of the message nobody commented on instead of repeating them.
