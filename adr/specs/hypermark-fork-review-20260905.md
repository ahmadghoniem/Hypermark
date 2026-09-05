# Hypermark rev5 — decision review

Date: 2026-09-05

Reviewed checkout: `d749c55c027ad033c76684b8445afd485fa9a4d3`

Companion: [proposed implementation specification](hypermark-fork-spec-20260905.md)

**Execution handoff:** the [six root-level specs](../../spec/01-foundation-and-scope.md) now own implementation task boundaries and the latest attachment placement requirement. This review remains historical rationale, not a second work queue.

> **Superseding clarification (2026-09-05):** This review remains historical factual discovery, but its former recommendations yield to the clarified product direction: native Claude `/btw` remains approved with its no-tool limitation accepted (D1), without a custom or placeholder Claude side rail; background review agents and Code Tours are approved for removal while Agent Terminal remains (D3); margin notes, below-line blocks, and a duplicate right-hand comment composer are rejected; gutter popovers are the in-diff comment surface, with hover/click/keyboard access and an explicit Edit action for the full attachment-capable composer (D8); split/unified remain selectable while red/green change fills persist, with no Soft-fill/Gutter-only setting; Phosphor is selected for Hypermark app controls while Pierre retains its own internal diff/tree glyphs. The single-user popup omits author/avatar/“You”, timestamp, and ordinal-counter chrome without deleting provenance or overlapping comments. Theme polish, storage, PR/worktree, and migration questions remain open. See the companion spec and [design-decisions follow-up](hypermark-design-decisions-20260905.md) for current authority. Synthetic layout concepts under `adr/prototypes/hypermark-design` are not a renderer or AI integration.

## Verdict

The product direction is strong: a local, focused review tool with fewer controls and a coherent diff surface. The brief is not yet safe as an execution order. It combines settled product choices, older code-discovery notes, speculative fixes, and several data migrations under the heading of deletion.

Optimize for fewer maintained capabilities and fewer regressions, not deleted lines. Deleting an unused app can remove thousands of lines without reducing the shipped hook bundle at all. Conversely, an apparently small renderer or draft-format change can affect every review.

The accompanying spec preserves the explicit decisions. Recommendations that would expand or alter them are labeled for approval rather than silently treated as instructions.

## Corrections that materially change implementation

### 1. Use native `/btw` (approved)

Claude Code already implements `/btw`. Its documented behavior is exactly the desired history isolation, but it **has no tool access**: it answers from conversation context, not by reading new files or inspecting the browser's selection. An ordinary skill cannot promise the native command's isolation simply by asking the model not to pollute context.

**Approved direction:** keep the command name and use the native command. Its no-tool limitation is accepted for on-the-fly questions that normally do not need file reads or UI inspection. Ship only the three requested Hypermark launcher skills, plus the retained CLI-reference skill if still useful. Do not add an automatic selection upload or another question command to v1. Cursor Side Chats are inspiration only: they are durable, tool-enabled separate agent conversations and do not establish that native `/btw` can be rendered as a custom browser chat.

This changes the proposed implementation, not the user's choice of `/btw` as the workflow.

### 2. Rebase the brief on the actual checkout, not its line counts

The checked-out root manifest says **0.27.12**, not 0.27.8; `AGENTS.md` is **1,025 lines**, not 797. Record the exact commit as the baseline and rediscover call sites before each slice.

Both `apps/skills/claude` and `apps/skills/core` exist. The Windows installer explicitly installs the three Claude launchers from `claude` and the generic CLI-reference skill from `core`. Do not replace the Claude launchers with the prose-only `core` variants; that would change automatic command execution.

The root typecheck starts by running the Pi vendor script. The root build still includes OpenCode. These commands must be repaired with the app deletions, not left until the final rename.

### 3. Gutter-popover annotations must support virtualization

The current all-files review uses Pierre's virtualized `CodeView` and recycles DOM elements. Its source explicitly warns that one-shot decorations can disappear or leak onto a different file after recycling. A plain scroll wrapper does not establish that a renderer is nonvirtualized.

`renderAnnotation` places a comment at an anchor after a line; it is not an inline-range decoration API. The current projection anchors at `lineEnd`. Existing `CodeAnnotation` already includes optional character offsets, so do not invent a second persisted range model unnecessarily.

**Current direction:** replace only the in-diff block presentation with lifecycle-aware gutter markers and popovers in both single-file and all-files views. Do not keep permanent below-line cards, margin notes, or a right-hand duplicated editor. Optional sidebar navigation/listing can remain, but must not be presented as the canonical comment editor. Hover previews must also open by click and keyboard; overlap must reveal every comment through distinguishable snippets/context rather than position counters. An explicit Edit button transforms the same popup into the full composer; Save follows the ordinary persisted annotation pipeline, Cancel restores saved state, and incidental dismissal preserves the draft. Keep red deletion and green addition fills in both split and unified views throughout comment interaction; do not create a soft-fill/gutter-only setting.

### 4. Removing Guided Review still requires preserving shared primitives

The retained review editor imports its diff types/parser and two markdown renderers through `@plannotator/guide-viewer`.

The parser and types are already shims over `@plannotator/core/diff-files`: point retained consumers there directly. Move the still-used markdown renderers to an appropriate retained package, preserving their sanitization and tests. Then remove the guide-only package. A package-name deletion sweep alone would break ordinary review.

### 5. Treat theme synchronization and palette adoption as one design

The computed-style reads, deferred `requestAnimationFrame`, serialized shadow CSS, and global 150 ms color transitions are real evidence. They justify the investigation, but not a claim that a particular patch is visually proven.

There are more than four contracts: palette metadata, per-theme CSS files imported by `theme.css`, light/dark preference resolution, syntax themes, shadow styling, terminal colors, and loading readiness. CSS-variable inheritance alone does not synchronize a separately loaded syntax theme.

**Recommendation:** one resolved theme state, one bridge for all retained diff surfaces, and no intermediate mixed-theme frame. Let Pierre own diff surfaces and mix percentages. Preserve structural CSS for split sizing, selection, edit mode, and fonts; do not remove all `unsafeCSS` indiscriminately.

Use Shiki/Pierre workbench colors where appropriate, then define complete semantic tokens for each palette/mode retained after visual approval. These are real palette definitions, not permanent generic semantic fallbacks. A generic theme engine is not necessary. A temporary old-palette/runtime compatibility path may remain during visual review, but an explicit sign-off checklist must cover each retained palette/mode, syntax, terminal, tree, annotations, contrast, first paint, and rapid switching before it is removed. Resilience for corrupted preferences and unavailable/missing fonts remains after sign-off. No seven-palette visual approval is implied.

Ayu Dark and One Dark Pro are currently dark-only. Tokyo Night has a light app palette but no light syntax mapping in the current table. Preserve and document those distinctions rather than assuming seven identical light/dark pairs.

### 6. Images stay; composer attachment behavior needs a diagnosis and redesign

The two attachment stores do explain why toolbar images do not appear in the comment composer. They do **not** prove why the composer's own attach flow reportedly fails.

The default upload transport currently parses JSON without checking `res.ok` or validating `path`. The attachment UI silently skips a missing path and clears its editor in `finally`. That creates a credible silent-failure path, but an actual reproduction is still required before naming the user's root cause.

Old drafts contain both tuple-format `g` attachments and modern `globalAttachments`. Saving legacy serializers but discarding those arrays would still lose images.

**Current direction:** keep images/attachments. Convert old global images into a recoverable, image-only global comment belonging to the same document, exactly once; keep names, order, and paths. In the gutter-popup composer, every selected image is a compact AI-chat-style tile with remove control and a filename exposed on hover/focus; normal ready images do not carry a bulky filename/status banner. Loading and failure are visible, and failure offers retry/removal. Test upload failure/retry, Save/Cancel, dismissal/reopen draft preservation, and persistence through the ordinary annotation pipeline; global-state consolidation remains a proposed internal remedy after reproduction and must not lose any image.

Uploads also use temporary storage today. A durable comment reference is not a durable image file. Do not promise that images survive temporary-directory cleanup unless asset retention becomes an explicit additional feature.

### 7. There are more than two persistence mechanisms

Keep the brief's distinction between decision snapshots and draft recovery, but add automatic document version history and the submitted-feedback archive. The current Bun plan server already calls `saveAnnotations` and `saveFinalSnapshot`; those writes are not exclusive to Pi.

**Recommendation:** preserve all existing retained-workflow persistence and its separate controls in v1. Test approve/deny in the Bun path and test failed submission/write recovery. Do not call Saving the only record of reviews, or imply it controls draft recovery.

### 8. Phosphor is selected for app controls; package-size and license claims still need verification

Registry metadata checked on 2026-09-05:

| Package | Current version | Relevant observation |
| --- | --- | --- |
| `@pierre/diffs` | `1.4.1` | Published that day; depends on `@pierre/theming` `1.0.1`. A patch version is not evidence of low integration risk. |
| `@pierre/trees` | `1.0.0-beta.6` | Pins `@pierre/theming` `1.0.0` and a beta Preact dependency. |
| `@pierre/theming` | `1.0.1` | Compatible peer ranges do not eliminate the separate exact `1.0.0` dependency from Trees. |
| `@pierre/theme` | `2.0.0` | Shared theme-object dependency. |
| `@hugeicons/react` | `1.1.10` | Approximately 36 KB unpacked renderer, MIT metadata. |
| `@hugeicons/core-free-icons` | `4.3.0` | Approximately 79.8 MB unpacked icon data, MIT metadata—not the brief's CC0 claim. |

Lucide is explicitly out. **[Phosphor](https://github.com/phosphor-icons/react)** is selected for Hypermark-owned controls; choose and apply one consistent default weight/style, use named imports, measure the actual retained bundle, inspect distributed licenses, and keep required notices. Pierre’s own `@pierre/icons` stay within Pierre Diffs/Trees internals. Do not replace those internals solely for import uniformity, and do not use Pierre Icons or Hugeicons for Hypermark app chrome. Do not force dependency resolutions solely to obtain a cosmetically deduplicated lockfile.

### 9. Local fonts are useful, but not a zero-friction replacement

The permission is origin-scoped; random localhost ports can mean different enumeration-permission origins even though the app's cookies survive port changes. This is distinct from using a named installed family in CSS: a remembered family can still work without re-enumerating fonts. Enumeration must be click-triggered, cached in memory, deduplicated by family, and never uploaded; optional manual family input/remembered choices avoid a fixed-port requirement.

**Recommendation:** bundled Inter and Geist Mono remain reliable defaults and offline fallbacks. Offer “Use installed fonts” rather than prompting on startup. Persist only the chosen family. Remove Google/CDN loading without losing a usable picker when permission is denied. `FontData` has no standardized monospace flag, so a code picker cannot accurately promise “all installed monospace fonts” from its metadata alone.

## Decisions worth making before implementation

| Decision | Recommendation | Why / consequence |
| --- | --- | --- |
| Save Plans, hooks, drafts, history, feedback archive | Keep | They support the review loop and recovery; removal has little UX benefit. Preserve existing opt-outs. |
| Background review agents and Code Tours | **Approved: remove** along with Guided Review | They are independent of Ask AI and otherwise leave another multi-provider execution system in a Claude-only tool. The explicit Agent Terminal remains. |
| PR/MR hosting integrations, normal Git worktrees, and non-Git VCS providers | **Open: defer** any removal until explicitly chosen | Claude-only does not mean local-Git-only. Removing multi-repository workspaces does not authorize removing ordinary Git worktrees or PR reviews. |
| Network scope | Define “no hosted service” as no Hypermark-operated service; make optional external capabilities explicit | URL annotation, Git hosting, runtime installs, remote sessions, and Claude itself have distinct network behavior. Do not promise total offline operation. |
| Theme-engine rewrite | Use explicit complete palette tokens and a small bridge; defer a general runtime framework and light/dark polish | Temporary compatibility is permitted only through visual sign-off; do not imply seven palettes are approved; corrupted preferences/missing fonts retain recovery behavior. |
| Rename/data ownership | **Open:** rename brand/commands first; existing installs may retain the old data directory | No automatic importer, symlink, or destructive migration; a full migration engine is not required now. |
| Installed fonts | Opt-in enumeration plus bundled/system recovery and optional manual family input | Enumeration permissions may recur on a new port; using a remembered named family does not require enumeration. |
| In-diff annotation interaction | **Approved:** gutter marker + hover preview + click/focus popup + explicit Edit | No margin notes/right duplicate editor; full composer stays in the popup, including compact attachment tiles; split/unified remain selectable and red/green fills persist. |

## Changes to the work order

Keep small, self-verifying changes, but add a baseline/migration inventory **before deletion**. Run the dead-export sweep after each vertical slice and once more at the end; a single early sweep misses code orphaned by later changes.

Separate the Pierre dependency upgrade from the theme and annotation redesign so failures are attributable. Treat theme switching and palette ownership as one acceptance milestone, not unrelated patches. Prototype the selected no-below-block anchor decoration, virtualization, and tree-selection adapters before deleting the old presentation.

Keep `bun test` after every numbered implementation phase as requested. Add maintained typechecks, the ordered review→hook build, browser behavior checks, and a real Windows/Claude integration gate. Unit tests alone cannot verify shadow-root rendering, native font permission, PTY operation, installed slash commands, or that a reviewer actually received the current built HTML.

No implementation phase or full test run was performed during this review.

## References

- Local evidence: `package.json`; `AGENTS.md`; `scripts/install.ps1`; `packages/server/index.ts`; `packages/shared/data-dir.ts`; `packages/shared/feedback-archive.ts`; `packages/ui/hooks/useAnnotationDraft.ts`; `packages/ui/utils/upload.ts`; `packages/ui/components/AttachmentsButton.tsx`; `packages/ui/utils/themeRegistry.ts`; `packages/ui/utils/syntaxTheme.ts`; `packages/review-editor/components/AllFilesCodeView.tsx`; `packages/review-editor/hooks/usePierreTheme.ts`; `packages/review-editor/types.ts`; `packages/guide-viewer/{types,diffParser}.ts`.
- [Claude Code side questions](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw) and [skills](https://code.claude.com/docs/en/skills).
- [Cursor Side Chats and Conversation Search](https://cursor.com/changelog/side-chat) (inspiration only; Cursor’s durable tool-enabled agent model is not a capability claim for native Claude `/btw`).
- [Pierre theming contract](https://github.com/pierrecomputer/pierre/blob/main/packages/theming/README.md) and [Trees API](https://github.com/pierrecomputer/pierre/blob/main/packages/trees/README.md). Main-branch documentation must be checked against pinned package types before implementation.
- [Pierre Icons](https://github.com/pierrecomputer/icons) and [Pierre Diffs package](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs).
- [Local Font Access permissions and errors](https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts) and [FontData fields](https://developer.mozilla.org/en-US/docs/Web/API/FontData).
- [Phosphor React](https://www.npmjs.com/package/@phosphor-icons/react) and [Hugeicons integration guidance](https://hugeicons.com/docs/integrations/react/best-practices).
- Registry metadata: [Diffs](https://registry.npmjs.org/@pierre%2Fdiffs), [Trees](https://registry.npmjs.org/@pierre%2Ftrees), [Theming](https://registry.npmjs.org/@pierre%2Ftheming), [Theme](https://registry.npmjs.org/@pierre%2Ftheme), [Pierre Icons](https://www.npmjs.com/package/@pierre/icons), [Hugeicons renderer](https://registry.npmjs.org/@hugeicons%2Freact), [Hugeicons free icons](https://registry.npmjs.org/@hugeicons%2Fcore-free-icons).
