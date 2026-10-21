---
name: hypermark-review
description: Open Hypermark's browser-based code review UI for the current worktree, then act on the feedback that comes back.
disable-model-invocation: true
---

# Hypermark Review

Use this skill when the user wants to review current code changes in Hypermark instead of reading a diff inline.

Run:

```bash
hypermark review
```

It blocks until the user finishes in the browser. If it returns feedback or annotations, address them in this conversation; if it returns an approval, say the review passed and continue.
