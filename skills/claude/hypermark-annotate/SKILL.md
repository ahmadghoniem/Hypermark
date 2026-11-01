---
name: hypermark-annotate
description: Open Hypermark's annotation UI for a markdown, text, or config file and then respond to the returned annotations.
allowed-tools: Bash(hypermark:*)
disable-model-invocation: true
---

# Hypermark Annotate

## Markdown annotations

!`hypermark annotate $ARGUMENTS`

## Your task

The user read the file in Hypermark. The output above is their decision, in one of these forms:

1. `User reviewed the file and has no feedback.`: the user finished without commenting. Reply "No feedback." and start no work.
2. Empty: the user closed the session without feedback. Reply "Annotation session closed." and start no work.
3. Annotation feedback: respond to it as described below.
4. A note that the command was moved to the background: the user is still annotating, since the command only returns once they send or close the session. Wait for the completion notification, read the output file it names, and handle that output as above. The wait is not a dismissal.
5. A message that the arguments could not be resolved to a file: the user described what to annotate in their own words. Work out which file they mean, run `hypermark annotate <file>` yourself with that path (keeping any flags the message echoes), and handle its output as above.

The feedback has one section per annotation, with the line numbers it applies to. Each section either quotes the passage it is about (`Feedback on: "…"`) or says it is general feedback, and the user's comment follows on a `>` line. "Remove this" means the user wants that passage gone. Attached images are listed by path; read them, since the comment often refers to them.

Treat each comment on its own terms: answer questions, carry out requests in the file, and give your view when the user asks for it. Change only what the comments ask for. If two comments conflict, or a request is unclear, point it out and ask rather than guessing.
