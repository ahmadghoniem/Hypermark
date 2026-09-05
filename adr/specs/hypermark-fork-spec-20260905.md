# Hypermark — proposed implementation specification

Date: 2026-09-05

Status: **Draft with clarification update; not authorization to start implementation**

Baseline: `d749c55c027ad033c76684b8445afd485fa9a4d3`, root version `0.27.12`

Repository: `ahmadghoniem/Hypermark`

Review: [decisions and corrections to rev5](hypermark-fork-review-20260905.md)

**Implementation handoff:** use the [six root-level specs](../../spec/01-foundation-and-scope.md). They consolidate this phase plan and include the latest bottom-of-composer, image-only attachment requirement. This document remains design rationale/history; no open decision is approved merely by splitting the plan.

The clarification decisions and remaining visual/data choices are tracked in the [design-decisions follow-up](hypermark-design-decisions-20260905.md). Its interactive synthetic layout concepts live separately under `adr/prototypes/hypermark-design`; they are not a product renderer or AI integration.

## 1. Objective and decision authority

Hypermark is a single-user, Windows-first, Claude Code review tool derived from Plannotator. It keeps document annotation, review of code changes, plan decisions, recovery, and the explicitly invoked Agent Terminal. It removes unwanted hosted products, integrations, and controls; Pierre remains responsible for its diff/tree internals, while Hypermark-owned controls use Phosphor.

Success means a smaller maintained feature set, reliable retained workflows, and better visual/interaction behavior. Deleted LOC and installed dependency size are measurements, not acceptance criteria by themselves.

Terms:

- **Required**: an explicit product choice from the brief, or a correctness constraint necessary to preserve a retained workflow.
- **Proposed**: a recommendation that needs approval before implementing that change.
- **Deferred**: not part of this release; do not infer permission to remove or redesign it.

The local checkout and installed dependency types supersede historical file line numbers and size estimates. Public API documentation is reference material, not authority to change product scope.

### 1.1 Approval register

| ID | Proposed decision | Default while unapproved |
| --- | --- | --- |
| D1 | **Approved:** use native Claude Code `/btw`; do not ship a custom skill under that name. Its no-tool limitation is accepted for on-the-fly questions. | Do not install a conflicting `/btw` skill or claim it is a custom browser chat. |
| D2 | Keep Save Plans, PFM and Improvement hooks, drafts, version history, and feedback archive with their independent controls. | Preserve existing behavior. |
| D3 | **Approved:** remove background review-agent execution and Code Tours as well as Guided Review; keep the Agent Terminal, restricted to Claude Code. | Trace Agent Terminal ownership before deleting agent-job infrastructure. |
| D4 | No Hypermark-operated service and no automatic sharing/font-CDN calls. Inventory other external capabilities separately. | Preserve unmentioned capabilities; do not claim fully offline operation. |
| D5 | **Open:** choose storage ownership separately from the brand/command rename. Existing installs may continue using the old data directory. | No automatic importer, directory move, symlink, or destructive migration. |
| D6 | Delete the POSIX end-user installer after repairing Windows installation and removing its build/test references. | Retain it until the coupled installation slice is approved. Keeping Linux development/CI scripts is independent. |
| D7 | Light/dark theme polish and final palette approval are deferred; do not claim all seven current palettes are approved. A generic theme-engine rewrite remains deferred. | Preserve recovery for corrupted preferences and unavailable fonts; do not delete temporary compatibility layers before explicit visual sign-off. |
| D8 | **Approved:** code comments live in a gutter popover, not margin notes or a right-hand duplicate composer. The same popover has an explicit Edit action that becomes the full attachment-capable composer. Unified/split remain selectable; addition/deletion fills remain visible in both. | Do not add a soft-fill/gutter-only preference or any comment-position counters/bylines to the single-user popup. |

Decide these before the affected phase starts. The recommendations in this document are not substitutes for approval.

## 2. Product boundary

### 2.1 Required retained workflows

1. Claude Code plan review through the existing hook: approve, approve with supported notes, or request changes; preserve machine-readable outputs and exit semantics.
2. `/hypermark-annotate` for the currently supported document/folder/HTML surfaces, subject to the explicit network decisions below.
3. `/hypermark-last` for annotating the relevant Claude response.
4. `/hypermark-review` for code review, with the existing single-file and all-files surfaces.
5. Annotation creation, editing, deletion, undo/redo, Quick Labels, attachments on comments, optional sidebar navigation/listing, Copy Plan, Agent Instructions, and Download Annotations. Code-comment editing occurs in its gutter popover, not in a duplicated right rail.
6. Archive browsing, decision snapshots, version history/diffs, draft restoration, submitted-feedback archive, and retained source-edit recovery/conflict handling.
7. The explicitly invoked embedded Agent Terminal. Removing Ask AI must not remove its PTY transport, process cleanup, permissions, or Windows runtime installation.
8. The existing review-view setup, diff/base selectors, and useful search. Removing staging does not make reading staged changes invalid.
9. Existing external annotation ingestion and provenance where retained workflows consume it. An AI-looking author/source tag is not evidence that an annotation is disposable.

### 2.2 Required removals

- Apps: `pi-extension`, `opencode-plugin`, `vscode-extension`, `guides-show`, `amp-plugin`, `marketing`, `waitlist-service`, `paste-service`, `droid-plugin`, `portal`, `codex`, `copilot`, `gemini`, `kiro-cli`.
- Guided Review, background review-agent execution, and Code Tours: generation/execution, guide/tour-specific UI, routes, commands, exports/sharing, storage-writing paths, publishing/deployment artifacts, and guide-only packages after relocating retained primitives.
- Multi-repository workspace review and its onboarding teaser. This does **not** mean ordinary Git worktrees.
- Share links, Import Review, the entire Export modal, application Print/Save as PDF controls, and Obsidian/Bear/Octarine integrations.
- Vim controls and engine, the editable identity field, Ask AI chat in **both** document and code review, AI settings/provider UI, and `packages/ai` after all kept consumers are disentangled.
- Stage/unstage commands and controls; per-file git-status decorations in the file tree.
- The global Images toolbar button and writable top-level `globalAttachments` state, after backward-compatible migration.
- All built-in palettes except the six retained palettes plus the new Pierre palette; Totman favicon; direct Lucide use after the chosen replacement icon system is migrated.
- Margin-note comment presentation; any right-hand code-comment editor/composer that duplicates the gutter popup; Soft-fill/Gutter-only visual preferences and controls; popup author/avatar/“You” bylines, relative timestamps, and per-comment ordinal counters.

The final retained application roots are `apps/hook`, `apps/review`, and the required portions of `apps/skills`. Shared code may move to retained packages; it must not be rewritten unnecessarily merely to match this layout.

### 2.3 Deferred scope, not implied deletions

- GitHub/GitLab PR review and posting, normal Git worktree selection, and non-Git VCS providers remain open questions, not removal approvals. “Claude Code only” describes the host, not the VCS. Removing multi-repository workspace review does not remove ordinary worktrees, which remain a local checkout mechanism for review flows.
- Semantic Changes and Call Flow remain because the brief keeps Analysis. Their optional downloads must be documented under the network policy.
- Removing editor integrations requires tracing runtime launchers and settings as well as deleting extension apps; preserve internal source editing.
- Do not remove WebMCP, external annotation APIs, safety guards, HTML sanitization, or source-save conflict detection as an incidental dead-code cleanup.
- Do not publish the fork under upstream package names. Package publication is not required for this single-user release.
- Do not make the implementation Windows-only internally. Keep inexpensive portable helpers and a usable development/test environment.

### 2.4 Network contract

Required: no Hypermark-hosted backend, share upload, or font-CDN request is necessary for normal local review. Local fixtures must open and render with outbound access disabled after dependencies/runtime prerequisites are installed.

Before claiming stronger offline or local-only guarantees, explicitly decide URL annotation/Jina, Git-host operations, dependency/runtime downloads, remote/tailnet publication, and embedded Claude's own network access. Local document/HTML content can itself reference external resources; removing the share service does not make those resources offline.

Never silently replace a removed hosted URL with a different third-party service. Keep localhost security, Origin checks, path validation, and explicit process permissions intact.

## 3. Baseline, architecture, and deletion safety

Before the first implementation slice:

1. Record the exact baseline commit, Bun/Node versions, build entry points, lockfile, existing worktree changes, and supported Windows browser/Claude versions. Do not edit the installed marketplace checkout without a recoverable source baseline.
2. Run baseline `bun test`, maintained typechecks, and the review→hook build; record actual failures without suppressing them.
3. Capture synthetic browser fixtures for plan decisions, markdown/HTML annotations, code review, themes, and image upload. Record bundle bytes, cold start, and representative large-diff/tree behavior on the same environment used after changes.
4. Inventory data formats and stable keys: drafts/tombstones, annotation IDs, image references, version identities, archive records, settings/cookies, hooks, runtime/session registries, and approval-result schemas.
5. Establish a retained-entry-point dependency graph including dynamic imports, package exports, CSS `@source`/imports, worker entry points, build-time reads, installers, CI, generated assets, and tests.

For each feature deletion, remove its UI producers, routes, command dispatch, settings keys/defaults, dependencies, scripts, documentation, generated artifacts, and tests **only insofar as they belong exclusively to that feature**. A disabled button is not feature deletion; a deleted endpoint with a live caller is not completion.

Specific retained dependencies:

- Redirect review diff-parser/type imports from `guide-viewer` to their existing owner, `@plannotator/core/diff-files`.
- Preserve/move the still-used guide-package markdown renderers and their sanitization behavior before deleting that package.
- Move legacy tuple annotation/image decoding to a neutral serialization module before deleting sharing. Preserve object-format drafts, direct edits, stable IDs, and generation/tombstone behavior.
- Keep `runGit` and read-side status/diff computation. Delete only stage/unstage wrappers and mutation paths unless broader VCS scope is separately approved.
- Distinguish `/api/ai` chat, `/api/agents` jobs, and Agent Terminal PTY ownership. Do not delete a provider package while a retained execution path still imports it.
- Repair root build/typecheck scripts when their removed apps disappear; make the final build run review before hook automatically.

After Pi is removed, there is no fork requirement to maintain its duplicate server. Verify retained behavior through the Bun server rather than resurrecting Pi.

## 4. Menus, settings, and command behavior

### 4.1 Menus

The document options menu keeps Theme, Settings, Agent Instructions, Download Annotations, and the version section. Remove Export, Share, Import Review, app Print/PDF, and note-app actions from desktop and compact layouts. Review keeps Set up review view and Agent Instructions; remove workspace promotion and removed-feature actions.

Removing app print support includes its shortcut registry entry, key interception, print CSS/layer generation, and help copy. It does **not** mean blocking the browser's own Print command.

Keep reusable annotation formatting, clipboard, and feedback-template helpers. Download Annotations remains a standalone local download, not a share/export-modal dependency.

### 4.2 Settings

Keep General, Theme, Git, Display, Analysis, Saving, Labels, Shortcuts, Files, Comments, and Hooks insofar as their features remain. Remove AI, Vim, and notes-app controls. Remove orphaned settings and capabilities, not just their visible tabs.

Removing the identity field must preserve valid author metadata for new and restored annotations. Do not rewrite historical authors or delete identity tests that still protect retained behavior.

Favicon: Classic is the only offered style and the default; no one-item picker is needed. Resolve legacy `totman` values to Classic in both cookie and server-config paths, before the first visible favicon. Retain backward-readable settings without mutating the old installation's files during import.

### 4.3 Claude commands

Keep the Claude-specific launcher templates under one documented source of truth. Preserve their `allowed-tools`, explicit human invocation, argument handling, and automatic command execution. Do not replace them with the prose-only generic skill variants.

At final rename, commands become `/hypermark-annotate`, `/hypermark-last`, and `/hypermark-review`. Update command names, executable allowlists, installer copies, hook/plugin manifests, documentation, and tests together.

Under approved D1, `/btw` is the **native Claude Code command**, not a fourth Hypermark skill. Its no-tool limitation is accepted: it is intended for on-the-fly questions that ordinarily do not need fresh file or UI inspection. It cannot automatically know the active browser document, selection, or fresh diff; do not promise those capabilities or implement hidden context transfer. Cursor Side Chats are visual/product inspiration only: Cursor describes them as durable, tool-enabled separate agent conversations, and this spec makes no claim that native Claude `/btw` can be rendered as a custom browser chat.

## 5. Persistence and compatibility

### 5.1 Independent mechanisms

Preserve and test separately:

| Mechanism | Purpose | Required invariant |
| --- | --- | --- |
| Save Plans | Approve/deny snapshots and annotation sidecars | Saving toggle/custom path affects these writes, not draft recovery. |
| Document version history | Previous/current review comparison | Reopening/version comparison continues to use the same document identity. |
| Drafts | Crash/close recovery, including edits | Existing approximately 500 ms debounce, close flushing, and generation-gated deletion remain race-safe. |
| Submitted-feedback archive | Durable record of completed decisions | Keep current write ordering, provenance, and independent privacy controls; failure retains recovery data. |

Approvals, feedback, dismissals, and strict-gate startup/publication failures remain distinct. Preserve result-file no-clobber behavior and existing stdout/exit-code contracts. A failed submit must not look like success or erase recoverable work.

### 5.2 Legacy global images

New attachments belong only to annotations, including image-only global comments.

On reading old drafts or other retained persisted documents:

1. Decode both legacy `a`/`g` tuples and current full-object arrays.
2. Convert each document's top-level attachments into one image-only global comment for that document; preserve attachment names, order, and references.
3. Make conversion deterministic/idempotent so retries and repeated restores do not duplicate comments. Do not repurpose or renumber existing annotation IDs.
4. Keep legacy readers until migration fixtures prove compatibility; new writes use the new representation.
5. Missing image bytes produce an explicit recoverable unavailable state, never silent comment removal.

### 5.3 Rename and storage ownership — open under D5

Rename user-visible branding and commands first. Storage ownership is intentionally independent: an existing installation may keep using its existing Plannotator data directory while the product name changes. No full migration engine is required for this release.

- Prefer new `HYPERMARK_*` configuration names. Keep documented legacy aliases for retained settings. Define and test presence/empty-value precedence per setting rather than blindly replacing prefixes.
- A nonempty `HYPERMARK_DATA_DIR` may be introduced with documented precedence over a nonempty legacy override, but do not silently merge directories when both contain data.
- Do not create an automatic importer, symlink/junction, directory move, or purge. The user’s eventual storage choice—continue in place, select a new root, or explicitly import—is open.
- Keep readers compatible with retained historical formats without rewriting old records, prose, archives, credentials, live process registries, locks, PTY tokens, caches, or runtime binaries.
- Do not clear unrelated localhost cookies or import a whole font inventory. A future explicit import must be validated, resumable/no-clobber, and leave its source unchanged; it is not authorized by this rename.

## 6. Themes and Pierre integration

### 6.1 Palette contract

The target palette inventory is six retained built-in IDs plus the new Pierre default (not a claim that the unmodified checkout already contains only these seven):

`pierre`, `plannotator`, `catppuccin`, `ayu-dark`, `github`, `tokyo-night`, `one-dark-pro`.

Each palette/mode pair retained after the deferred visual review must have a complete, explicit semantic token definition for the surfaces it supports: app chrome, tree, diff bridge, syntax mapping, terminal, focus, selection, status, and annotation states. These definitions are the palette design, not semantic fallbacks. Preserve valid retained choices. Removed or corrupted persisted palette values recover to Pierre **per light/dark half**, without resetting unrelated preferences; that recovery is resilience, not a substitute palette.

Preserve supported-mode metadata. Do not invent an unsupported Ayu Dark or One Dark Pro light palette. A light-mode request for an unsupported pair recovers to Pierre Light; document the recovery. Complete Tokyo Night light tokens and syntax mapping before calling its light mode supported. Light/dark visual polish is deferred; this list is not approval of seven palettes or every listed mode.

Audit registry metadata, syntax mappings, theme files/imports, theme-pair migration, terminal presets, and all previews. Remove theme-specific font declarations. Do not claim the shipped Shiki theme/language bundle shrank merely because the palette menu shrank.

### 6.2 Ownership and synchronization

1. Resolve mode, palette, syntax theme, chrome tokens, tree styles, and terminal tokens from one coherent state. Reuse one bridge for single-file, all-files, hunk previews, and code-fence surfaces that remain.
2. Use `@pierre/theming` on an already Shiki-normalized theme. Prefer supplied workbench surface/ANSI colors, then explicitly define every remaining semantic value for the selected palette. Do not ship a permanent generic error/success/warning/focus/selection/terminal fallback rule in place of palette definitions.
3. Let Pierre own its diff background/foreground, addition/deletion colors, and default mix percentages. Do not blanket-map `--diffs-bg`/`--diffs-fg` to app chrome. Make the stock appearance the default; any retained intensity option must not silently override it through an old preference.
4. Retain necessary structural shadow CSS, font rules, splitter sizing, editing/selection behavior, and accessibility. Isolate version-sensitive selectors in one reviewed adapter.
5. Remove the asynchronous computed-style→rAF→React-state color-mirroring path. Verify inherited variables against the pinned renderer before relying on them; otherwise use precomputed values or a synchronous serialized bridge committed before paint. A necessary computed-style read is not itself a failure—the release gate is coherent visible state, not zero style queries. Keep non-color layout measurements where necessary.
6. Prepare missing theme assets before changing the visible theme. Commit chrome and renderer state together; rapid switches must not allow an old asynchronous result to win. Cold loading must not expose a partially switched frame.
7. Remove the universal color-transition rule. Keep intentional component hover/focus transitions and honor reduced-motion preferences without animating different theme surfaces at different times.

Acceptance: no observable mixed old/new theme frame in the tested interactions; no stale syntax or annotation colors; no flash of an invalid first-render theme. Inspect recordings and browser-rendered colors, not only React state.

Temporary compatibility layers for the old palette/runtime path may remain while the final visual direction is being approved. Before deleting them, present a sign-off checklist covering each retained palette/mode, syntax, terminal, tree, annotations, contrast, first paint, and rapid theme switches. Do not automatically remove resilience for corrupted preferences or unavailable/missing fonts after that sign-off.

### 6.3 Dependency changes

Target `@pierre/diffs` `1.4.1`, `@pierre/trees` `1.0.0-beta.6`, and compatible theme/theming versions. Verify exact published tarballs/types, integrity, licenses, and peer dependencies before installing; update retained manifests and the lockfile consistently.

The inspected releases use theming `1.0.1` for Diffs and `1.0.0` for Trees. Test that combination and measure duplication. Do not force an override without evidence that it is compatible. Treat the same-day Diffs release and beta Trees integration as risks requiring targeted tests, not as reasons to assume failure or safety.

Upgrade Diffs in a separate, self-verifying change before changing its presentation. Preserve worker initialization, edit-session recovery, split/unified rendering, scroll anchoring, and add-only/delete-only behavior.

Under D7, validate one dark and one light derived palette before expanding the shared bridge. A generalized runtime theme framework is deferred; seven explicit descriptors plus shared derivation are sufficient.

## 7. Comment attachments

Remove the standalone Images action from markdown and HTML toolbar layouts; keep Global Comment and Copy Plan. Use the existing composer attachment affordance as the only new-attachment entry point.

Required behavior:

- File picker, supported paste, and drop reach the gutter-popover composer/Image Annotator flow. Each selected attachment appears as a compact AI-chat-composer-style image tile with a remove control; its filename is available on hover/focus. The normal ready state has no bulky filename/status banner. Loading and upload-error states remain visibly distinct, and errors include recovery actions.
- Place the image-only thumbnail strip at the bottom **inside** the composer, below the editable text and above the attachment/Cancel/Save action row. Show the actual images with small overlaid remove buttons, not cards containing filenames or file sizes. The second reference establishes placement only; the first and third establish appearance. Preserve the current prototype's concise thumbnail treatment.
- Image-only comments are valid. Images submit with the same annotation and export through the existing feedback format.
- Upload success requires a successful HTTP status and a valid nonempty reference. Malformed/error responses must reject visibly rather than silently skip attachment creation.
- A failed upload leaves the pending image/edit and comment recoverable, provides retry/removal, and cannot be reported as attached. Submission is not allowed to silently omit an in-flight attachment.
- Cancel restores the saved annotation state. Incidental popup dismissal or pointer leave must preserve the in-progress edit and its attachments as a draft; reopen, undo/redo, navigation, and draft restore preserve the intended ownership without cross-document leakage.
- Reuse upload/image-source transports; do not introduce share services or embed large data URLs in drafts.
- Reference durability does not guarantee file durability: existing temp uploads may expire. Preserve missing-reference UI and document this limitation. Durable asset storage/garbage collection is a separately approved feature, not an implied rename task.

Reproduce the reported in-composer failure before fixing it. The disconnected global store is a confirmed design problem, not proof of every upload failure's cause.

## 8. In-diff annotations: gutter popup and persistent change fills

Remove permanent below-line comment blocks and margin notes for ordinary line/range comments. Use a gutter marker and its in-diff popover as the code-comment surface. Optional sidebar navigation/listing may remain separate, but is not the canonical editor and must not duplicate a right-hand composer. File/general comments remain in suitable non-range surfaces; suggestions retain their full payload and editing capability through the popover.

### 8.1 Projection

- Use existing annotation IDs, file/snapshot context, `side`, line range, and optional character offsets. Do not change persisted anchor semantics to fit DOM coordinates.
- Apply a zero-layout-height gutter marker to each **visible** covered range. For line-only comments, provide an equivalent marker for empty lines. Respect old/new side in split and unified views. The user may select unified or split, but no Soft-fill/Gutter-only option or preference exists.
- Keep red deletion fills and green addition fills visible in unified and split views while comments are hovered, opened, pinned, edited, or selected. Comment interaction must not clear, flatten, or replace those change colors.
- Multiline ranges cover each relevant line rather than just `lineEnd`. Hidden/collapsed context does not become an incorrect visible anchor; sidebar navigation reveals/expands the correct location when available.
- For overlap, compute segments carrying every covering annotation ID. Render one stable marker and open an ordered list of all associated comments. Each list item needs a distinguishable quoted snippet or equivalent anchor context, never a current-position “comment N of Y” counter. Never drop an annotation because another one covers it.
- Keep syntax text byte-identical and preserve token navigation, search highlights, text selection, copying, and edit-mode ownership.
- Support both `FileDiff` and virtualized `CodeView`. Decorations must reapply/clear with render, reuse, and unmount lifecycles; no stale markers or cached screen coordinates may transfer to recycled rows.

`renderAnnotation` alone is not a range-anchor mechanism. Verify the pinned renderer's public APIs first; if supported APIs are insufficient, use a small isolated, tested adapter rather than spreading shadow-DOM mutations across components.

### 8.2 Interaction

- Pointer hover previews a comment; click or keyboard activation opens a persistent, focusable gutter popover.
- Keep it open while moving from trigger into the popover. Escape dismisses and returns focus sensibly. Edit/Delete remain explicit actions, not hover side effects. Selecting **Edit** turns that same popup into the full textarea-and-attachments composer; double-click may be an additional shortcut but is never the sole edit path.
- Save uses the ordinary persisted annotation pipeline. Cancel restores the last saved comment; incidental dismissal, pointer leave, or reanchor preserves the edit draft and attachments for reopening.
- The single-user popup displays neither “You”, an avatar/author byline, a just-now timestamp, nor ordinal counters. This presentation change must not erase historical author/source metadata or hide/drop overlapping comments.
- Keyboard users can reach the same comments through focused gutter triggers and any retained sidebar navigation; do not create a tab stop for every decorated code fragment.
- A comment popover takes precedence over token hover on its own trigger. Modified-click navigation and normal drag selection remain available.
- Dismiss/reanchor safely on scroll recycling, diff replacement, theme/font/layout changes, and source edits. No retained detached-element references.

Verify multiple comments on one line, nested/overlapping ranges, tabs/Unicode, wrapped lines, deletions, additions, collapsed hunks, large diffs, and repeated scroll-out/scroll-back. Include the decision gate for gutter-popup editing: Edit exposes the full composer; attach/remove/save persists its attachment through the ordinary pipeline; Cancel restores saved content; dismissal/reopen retains the unsaved draft; upload failure is visible and retryable. A hover-only implementation is not acceptable.

## 9. File-tree replacement

First separate existing panel chrome—selectors, review-view toggle, search controls, and navigation—from the custom tree rows. Replace only the tree rendering/model adapter.

Use `@pierre/trees` with these fixed choices:

```ts
{
  paths,
  initialExpansion: 'open',
  flattenEmptyDirectories: true,
  search: true,
  fileTreeSearchMode: 'hide-non-matches',
  icons: 'complete',
}
```

Omit density (default), drag-and-drop, renaming, and git-status configuration. Do not expose preference switchers for these choices. Keep search available.

Required adapter behavior:

- Use canonical path-based identity; preserve the repository's path/case semantics and rename old/new mapping. Normalize transport separators without lowercasing distinct Git paths.
- Flattened rows represent directories, not synthetic file paths to open. Resolve activation through public item/path information; avoid persisting internal `FLATTENED_PREFIX` IDs.
- Selecting a file opens the correct review item; selecting a sidebar annotation synchronizes/reveals the tree's file. Clearing search restores the full tree without losing valid selection.
- Preserve expansion and selection across ordinary renders; new review snapshots reconcile against actual paths. Initial expansion must not reopen user-collapsed folders on every render.
- Preserve retained annotation counts, reviewed state, and binary/generated-file navigation where applicable. If the public tree API cannot represent a required affordance, decide its replacement location before deleting the old rows.
- Theme through `themeToTreeStyles()` from the same resolved theme as the diff/chrome; no independent computed-style/rAF pipeline.
- Name filtering is distinct from diff-content search. Do not remove retained content search accidentally.

Before implementation, inspect the version-matched Trees skill/API reference and package types. Do not assume main-branch documentation matches the pinned beta. Validate keyboard navigation, long paths, empty results, flattened chains, and representative large trees.

## 10. Typography and icons

### 10.1 Fonts

- Define `--font-sans` and `--font-mono` once, outside color themes. Default to bundled Inter Variable and Geist Mono Variable plus system fallbacks.
- Add a UI-family setting beside the existing code-family setting. Preserve existing code size/family values and server-config precedence.
- “Use installed fonts” is an explicit click-triggered Local Font Access request in a secure, supported browser. Do not prompt on page load.
- Cache enumeration in memory, deduplicate/sort by family, and persist only chosen families. Do not transmit names or font bytes, and do not call `FontData.blob()` merely to populate a picker.
- Missing API, denial, policy restrictions, empty results, or an uninstalled chosen family leave bundled/system choices usable. No Google Fonts/CDN fallback request.
- Explain the distinction between enumerating installed fonts and using a named installed font in CSS. Local Font Access enumeration permission is origin-scoped and may recur on a new localhost port; a remembered named family can still be used without enumerating it. Offer optional manual family input/remembered choices. Do not require a fixed port or change the server's port/security model solely to suppress permission prompts.
- The code picker cannot infer monospace families from standardized `FontData` metadata. Provide a preview and a reliable monospace fallback; do not claim automatic classification.
- Escape font-family values safely; do not interpolate arbitrary text into stylesheet source. Apply fonts to all relevant shadow and non-shadow code surfaces and update virtualizer measurements when font metrics change.

### 10.2 Icons

Lucide is explicitly out. **[Phosphor](https://github.com/phosphor-icons/react)** is selected for Hypermark-owned app controls, via `@phosphor-icons/react` (MIT). Establish a consistent default weight/style and use direct named imports so the final selected-icon bundle can be measured. A thin app-level wrapper may standardize size, stroke, `currentColor`, and decorative accessibility. Preserve accessible labels/tooltips on icon-only controls.

Pierre Icons remain inside Pierre's Diffs and Trees component internals. Do not replace those internal glyphs merely to force one import family, and do not use Pierre Icons or Hugeicons for Hypermark app chrome. Remove remaining direct Lucide dependencies only after migrating retained Hypermark-owned consumers to Phosphor. Do not redraw an externally owned brand merely to make its icon look like the selected library; inspect actual package licenses and preserve notices.

## 11. Packaging, licensing, and rename

- Keep `LICENSE-MIT`, `LICENSE-APACHE`, original copyright attribution, and third-party notices intact. Fork authorship/repository metadata must not imply ownership of upstream work.
- Final user-facing identity is Hypermark; update bin, retained workspace scopes, plugin/marketplace manifests, executable paths, hook commands, release artifact names, URLs, readmes, and Windows installer/uninstaller behavior coherently.
- Do not mechanically replace every occurrence of `plannotator`: upstream credits, historical data, compatibility readers, external protocol keys, and migration fixtures may legitimately retain it. Maintain an explicit compatibility allowlist.
- Make retained packages private unless publication is separately authorized; stop upstream publishing/deployment workflows. Do not upload artifacts, publish packages, or change production services as part of this spec's implementation.
- Remove installer detection/writes for deleted agents from **Windows installers too**. Their references to Kiro/OpenCode/Gemini are not confined to `install.sh`.
- Keep Claude launcher execution and the terminal runtime install working with paths containing spaces and Unicode. Preserve install integrity checks and safe cleanup.
- Do not overwrite unrelated Claude configuration or delete an existing Plannotator installation automatically. Ensure only the intended review hook fires after installation; compatibility aliases must not cause duplicate sessions.
- Update repository instructions to describe the fork's retained products without weakening its testing/security rules. Remove obsolete published-host compatibility requirements only through the explicit fork scope, not by silently breaking retained consumers.

## 12. Implementation phases and release gates

Each row is a self-contained change or small stack segment. Run **`bun test` after every numbered phase**, including focused tests during development. Complete the phase's dependency closure before calling it done; do not weaken surviving tests to obtain green output.

| Phase | Scope | Additional exit gate |
| --- | --- | --- |
| 0 | Baseline, approval register, data/entry-point inventory, synthetic browser fixtures | Baseline test/typecheck/build results and known failures recorded; no user data touched. |
| 1 | Delete the 14 apps, repair scripts/CI/install references; POSIX installer under D6 | Retained install/build/typecheck work; Bun approve and deny produce their expected archives end-to-end. |
| 2 | Guided Review and multi-repo workspace removal; relocate retained shared primitives | Ordinary diff parsing, markdown rendering, local review, and ordinary worktree behavior still work. |
| 3 | Sharing/import/export-modal/print removal; extract neutral legacy decoding first | Download Annotations, object and tuple draft restoration still work; no dead share requests. |
| 4 | Vim, notes integrations, identity field, Ask AI, staging; approved background-agent/Code Tour removal under D3 | Terminal launches/cleans up; all remaining shortcut/help routes work; Git index is not mutated by review controls. |
| 5 | Retained-entry-point dead-code sweep and manifest cleanup | No unresolved dynamic/build/CSS references; retained tests still protect actual behavior. |
| 6 | Palette/mode inventory, migrations, Classic favicon, theme-independent font roots | Retained choices survive; removed choices recover deterministically; no blank initial theme/favicon. Final light/dark polish remains deferred. |
| 7 | Isolated Diffs 1.4.1 upgrade | Existing appearance/behavior baseline passes; editor, worker, selection, scroll and split contracts intact. |
| 8 | Shared theme bridge, Pierre diff/tree ownership, scoped transitions, D7 prototype | All retained surfaces switch coherently; final light/dark polish is not claimed without a separate visual decision. |
| 9 | Composer-only attachments, legacy global-image conversion, and compact gutter-popup attachment tiles | Success/failure/retry, image-only submit/export, saved/cancelled edits, draft reopening, and restored images verified on markdown and HTML. |
| 10 | Gutter-marker comment presentation and editable popovers with persistent addition/deletion fills | Both renderer paths, virtual recycling, overlap, keyboard use, Save/Cancel/draft attachment behavior, visible red/green fills, and no-layout-shift criteria pass. |
| 11 | Extract panel chrome and integrate Trees | Fixed configuration, search, selection, path mapping, keyboard behavior, and theme parity pass. |
| 12 | Claude launcher audit and native `/btw` documentation/verification under D1 | Supported Claude installation exposes correct launchers; no custom `/btw` shadowing. |
| 13 | Local font pickers and Phosphor app-control migration | Permission/error/offline recovery, shadow font metrics, icon accessibility, Pierre-internal isolation, and bundle measurements pass. |
| 14 | Hypermark rename, final D5 storage decision if separately approved, dead-code sweep, packaging/docs | Clean Windows install; no stale HTML; existing data is left untouched unless a later approved storage operation supplies recovery/rollback evidence. |

After frontend changes, run maintained typechecks and build in this order:

```sh
bun run --cwd apps/review build
bun run build:hook
```

The final root build script must encode this ordering. Remove deleted-app steps from typechecks while keeping or adding actual checks for retained editor/review entry points; a narrower command that simply avoids their errors is not a fix.

### 12.1 Minimum browser and integration matrix

| Area | Evidence required |
| --- | --- |
| Plan decisions | Real approve and deny from the Bun-served UI; expected output/exit status and archive files in a temporary data root; failed writes preserve recovery. |
| Annotate | Markdown, raw HTML, folder navigation, image-only comment, local edit conflict, draft restore, close/reopen, gate dismissal versus approval. |
| Code review | Single/all-files, split/unified, added/deleted/renamed/binary/generated files, staged changes still readable, no staging mutation, large diff recycling, and red/green change fills retained while a gutter comment is active. |
| Theme | Every palette/mode retained after deferred visual approval; first paint, rapid switches, system-mode changes, code fences, hunk previews, terminal, tree, and annotations. |
| Attachments | Picker/paste/drop where supported, compact gutter-popup tiles, filename on hover/focus, remove, retry, malformed response, Save/Cancel/dismiss/reopen drafts, missing temp file, and both legacy formats. |
| Accessibility | Keyboard-only gutter-comment inspection/editing, focus return, Escape, no-hover input, visible focus, distinguishable overlapping-comment snippets, and readable light/dark semantic states. |
| Fonts | Real Windows Chrome/Edge grant/deny, unavailable API fallback, a new localhost origin, removed family, font metrics/scroll stability. |
| Install/rename | Windows path with spaces/Unicode; correct built HTML, launcher/hook commands, PTY runtime, no unwanted agent writes, restart, uninstall without deleting retained user data. |
| Storage/rename | Fresh install, existing old data only, both roots present, explicit override, and no automatic merge, symlink, move, or source mutation. Test an explicit import only if it is separately approved. |
| Network | Ordinary local review with outbound access blocked; no share or font-CDN requests; approved external features documented separately. |

Browser tests may complement Bun tests; they do not replace them. Use synthetic fixtures and isolated `PLANNOTATOR_DATA_DIR`/`HYPERMARK_DATA_DIR` roots. Restore environment/global mutations per test. Preserve mixed tests; remove a test only after identifying the removed behavior it exclusively guarded. In particular, keep applicable export-shape, scheduling, callback, identity, draft, and integration tests regardless of their filenames.

Record before/after screenshots and short interaction recordings for material UI changes, with no private repository/user data in shared evidence. Inspect rendered results and console/network errors. A successful build or capture is not itself proof of behavior.

If the available environment cannot run Windows, real Claude Code, the PTY, or native font permissions, record that exact gap. Do not claim release acceptance until those gates have genuine evidence.

## 13. Definition of done

The release is complete only when approved scope is implemented; removed capabilities have no live UI/runtime/install paths; retained workflows and compatibility fixtures pass; final binaries contain current review HTML; Windows/Claude integration gates pass; licenses and original data remain intact; and the verification matrix and measured bundle/startup results are attached to the changes.

The fork need not contain zero occurrences of the old name, zero shared abstractions, or the fewest possible lines. It must have a clear maintained boundary and a safe recovery path.
