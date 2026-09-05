# Hypermark — design choices and clarifications

Date: 2026-09-05
Status: design exploration; no product implementation authorized or performed.
Companion: [updated implementation spec](hypermark-fork-spec-20260905.md).
Visuals: [interactive synthetic comparison](../prototypes/hypermark-design/README.md).

Implementation handoff: [six root-level specs, starting with 01](../../spec/01-foundation-and-scope.md). These decisions are carried into that work queue; no product implementation is authorized by this documentation update.

## Native `/btw` without a conversation rail

The user meant native Claude Code `/btw` from the beginning. Its no-tool limitation is accepted. There is no custom `/btw` skill to build and no reason to replace the native workflow with Ask AI.

Native `/btw` is rendered by Claude Code's own terminal UI. The decision remains native `/btw`, with its no-tool limitation accepted. Hypermark does not build a custom browser conversation, embed a placeholder Claude sidebar, or scrape terminal prose into a second transcript. The former “keep the conversation beside the code” direction is rejected.

**Context matters even without tools:** a freshly started Claude terminal is not necessarily the conversation that produced the plan. The native command should run in the intended Claude conversation. Existing terminal transport advertising a cwd is not proof of inherited session history. Verify session ownership, hook-wait input behavior, and host support before proposing any changed terminal placement. The existing Agent Terminal remains its own explicitly invoked feature; extending it to code review needs separate approval and feasibility evidence.

## Comment presentation: selected gutter popup

**Approved outcome:** ordinary code comments use a gutter marker and in-diff popover. Reject permanent below-line cards, margin notes, and any right-hand duplicated comment editor/composer. Hover previews remain; click and keyboard activation pin a persistent focusable popup. Optional sidebar navigation/listing can remain separate, but it is not the canonical editor.

The popup presents a read-only comment with explicit actions. **Edit** changes that same popup into the full textarea-and-attachments composer; double-click may be added as a convenience but is not mandatory or the sole edit path. Save uses the ordinary persisted annotation pipeline. Cancel restores the last saved comment. Incidental dismissal, pointer leave, and reanchoring preserve an edit draft and its attachments for reopening.

One reviewer means the popup shows no “You”, avatar/author byline, just-now timestamp, “comment N of Y”, or other per-comment ordinal counter. This is presentation-only: historical/source metadata remains stored, and overlapping comments remain available through an ordered popup list with a distinguishable snippet or anchor context for each item.

Unified and split diff layouts remain user-selectable. Red deletion and green addition fills remain visible while a comment is hovered, pinned, edited, or selected. There is no Soft-fill/Gutter-only preference or control. These remain product requirements rather than proof that the synthetic fixture's DOM can integrate with Pierre's renderer or virtualization.

## Images and attachments

Attachments remain a first-class feature. The actual complaint is that the selected image does not appear in the composer. Reproduce that path before claiming its root cause; global versus local state is only one candidate.

The gutter popup's Edit composer presents each selected image as a compact AI-chat-composer-style tile with a remove control. Expose the filename on hover/focus rather than consuming normal composer space with a filename/status banner. Uploading and failed states remain visible; failure preserves text and image selection and offers retry/removal. Image-only comments, saved comments, exports, and restored drafts retain their attachments. No global-state cleanup or toolbar redesign may retire image support.

**Final attachment placement clarification:** the thumbnail strip sits at the bottom **inside the composer**, after the text area and before the action row. Use the image itself with a small overlaid remove button, as in the first/third supplied references and the existing prototype; do not copy the second reference's filename/size card. Its placement, not its card styling, is the reference. See [spec 05](../../spec/05-comments-and-attachments.md) for the executable contract.

The prototype demonstrates selection, preview, filename, removal, and retained draft text locally. It has **no upload backend** and does not prove the product bug is fixed. Product tests must cover upload response validation and error/retry states.

## Palette fallbacks: cleanup at approval, with visual polish deferred

Use explicit, complete semantic colors for each palette/mode that survives the deferred visual review. A chosen error color or terminal ANSI color is part of the actual theme, not a fallback system. Pierre cannot infer every application semantic from its syntax palette alone. The current seven-palette inventory is not final visual approval, and light/dark polish is deferred.

Temporary legacy-palette or compatibility paths may protect the transition during development. They must be named and inventoried, not quietly become permanent architecture. **At final visual approval, explicitly remind the user to remove the temporary fallback paths and request confirmation; then delete them and rerun the supported-theme matrix.** Do not ship missing semantic colors merely to make a fallback search return zero. Invalid saved preferences and browser missing-glyph handling are different concerns.

## Icon decision

Lucide is out. **[Phosphor](https://github.com/phosphor-icons/react)** (`@phosphor-icons/react`, MIT) is selected for Hypermark-owned controls. Choose a consistent default weight, use direct named imports, preserve accessible labels/tooltips for icon-only buttons, and measure the actual selected-icon output.

Pierre Icons remain within Pierre's Diffs and Trees internals; do not globally replace those glyphs for import uniformity. Hugeicons and Pierre Icons are not candidates for Hypermark app chrome. The file tree's specialized filename/filetype glyph set remains a separate concern.

## PR review is not background AI review; a worktree is not Workspaces

**Local review** means reviewing the changes Claude made in a local checkout and returning feedback to Claude. It does not require a hosted PR.

**PR review** means opening a GitHub pull request or GitLab merge request, examining its changes/platform comments, and optionally posting a review back. It is a human code-review workflow, not an AI reviewer. The existing CLI accepts a PR/MR URL; the default `--local` path prepares a local checkout so full file context is available, whereas `--no-local` is diff-only. Retaining this is separate from retaining background review agents.

If the user only reviews local Claude changes and never opens/posts PR reviews in this tool, platform PR integration is a good candidate for a separately approved removal. Otherwise keep it. Neither choice follows automatically from “Claude Code only.”

**[A Git worktree](https://git-scm.com/docs/git-worktree)** is another folder checked out from the *same* repository, usually on another branch. For example, one folder can hold the current feature while a second holds a bug fix without stashing the first. Correctly reviewing the current worktree is important even if no worktree picker is shown. Recommendation: preserve this correctness; consider removing the picker only if unused.

**Workspaces**, already selected for removal, combines multiple repositories or exposes a separate product surface. Deleting that feature should not break ordinary Git worktree paths or the optional PR checkout pool by accident.

## Windows fonts and changing localhost ports

There are two different operations:

- **Use a font by family name:** CSS such as `font-family: "Cascadia Code", monospace` uses the font if it is installed and exposed by the browser. This does not require calling the Local Font Access API, and changing a localhost port does not itself make the font unavailable.
- **Enumerate every installed font for a picker:** `queryLocalFonts()` requires browser support, user interaction, and the `local-fonts` permission. [API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts). Browser origins include scheme, host, and port: `http://localhost:41001` and `http://localhost:41002` are different origins, so do not assume an enumeration grant carries across them. `127.0.0.1` versus `localhost` also changes the origin.

Recommendation: provide a short known-family list plus manual family-name entry; remember the selected name in shared settings and apply it immediately in future sessions. “Browse installed fonts” can be optional, explicit, and permission-gated. Do not enumerate again on every app launch. There is no need to force one port merely to render a saved Windows font.

Bundled fallback fonts are optional product scope, not a prerequisite for Windows fonts. A generic CSS `sans-serif`/`monospace` tail is cheap missing-font/glyph handling rather than a second typography system. Do not redistribute proprietary Windows font files just because they are installed on the user's machine. The Linux-hosted prototype cannot validate actual Windows font availability or permission behavior.

## Branding versus stored data, in plain terms

These are different changes:

1. Rename the visible app, launcher, commands, manifests, and package metadata to Hypermark.
2. Decide what happens to existing settings, drafts, saved plans, and history currently in `~/.plannotator` (normally `%USERPROFILE%\.plannotator` on Windows).

Doing the first does not require doing the second. A logo/name change need not move any files. My simpler recommendation is to keep the existing storage location initially if continuity matters, document that shared writes remain possible if both tools are used, and decide on a new `.hypermark` directory separately. A fresh independent directory is also reasonable if the user does not want the old state. Neither is selected yet.

“No blanket replacement” means rename identifiers deliberately rather than replacing every occurrence of “plannotator” inside saved user content, licenses, historical URLs, serialized contracts, or paths.

“No automatic symlink” means do not secretly make two directory names point at the same data: that hides shared writes and complicates cleanup. “No destructive move” means do not relocate or delete the only copy of existing drafts/history as a side effect of changing the product name. If migration is later wanted, copy explicitly, verify, and leave the source intact. No large migration subsystem is needed just to rebrand this single-user fork.
