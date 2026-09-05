# 02 — Remove unwanted features; preserve the Claude review loop

Status: **Planned; not implemented.** Requires [01](01-foundation-and-scope.md)'s retained app/build graph and baseline. Shared approval and verification rules in 01 apply, including `bun test` after **each** numbered implementation step.

## Outcome and boundaries

Remove the unwanted product capabilities end to end, not just their buttons. Keep normal plan/document/code review, recovery, source editing, search/Quick Labels, external annotations, Analysis, and the explicitly invoked Claude Agent Terminal.

This spec does not redesign the tree, composer, or themes; migrate top-level images (05); perform branding/storage changes (06); remove PR/MR review, ordinary worktrees or non-Git providers; or choose font/network policies. Keep legacy global-image read/write behavior until 05 can convert it safely, but remove the unrelated sharing transport here.

## Required reads / entry points

| Concern | Start here, then follow imports/callers |
| --- | --- |
| Editor shells and decisions | `packages/editor/App.tsx`, `packages/editor/components/AppHeader.tsx`, `packages/editor/annotateDecision.ts`, `packages/review-editor/App.tsx`, `packages/review-editor/reviewDecision.ts`, `packages/review-editor/components/ReviewHeaderMenu.tsx` |
| Retained server/CLI | `packages/server/index.ts`, `packages/server/annotate.ts`, `packages/server/review.ts`, `apps/hook/server/index.ts`, `apps/hook/server/cli.ts` |
| Guide dependencies | `packages/guide-viewer/`, `packages/core/diff-files.ts`, `packages/server/guide/`, retained imports of `@plannotator/guide-viewer` |
| AI versus PTY | `packages/ai/`, `packages/ui/hooks/useAIChat.ts`, `packages/ui/hooks/useAgentJobs.ts`, `packages/shared/agent-terminal.ts`, `packages/editor/components/AnnotateAgentTerminalPanel.tsx`, `packages/editor/agentTerminalIntegration.ts` |
| Sharing versus draft decoding | `packages/ui/utils/sharing.ts`, `packages/ui/hooks/useSharing.ts`, `packages/ui/hooks/useAnnotationDraft.ts`, `packages/ui/hooks/useCodeAnnotationDraft.ts`, `packages/shared/draft.ts` |
| Settings/shortcuts | `packages/ui/config/settings.ts`, `packages/ui/config/configStore.ts`, `packages/ui/components/Settings.tsx`, `packages/ui/shortcuts/`, both editor `shortcuts.ts` files |
| Saving/ingestion | `packages/shared/storage.ts`, `packages/shared/feedback-archive.ts`, `packages/shared/improvement-hooks.ts`, `packages/ui/utils/planSave.ts`, `packages/ui/hooks/useExternalAnnotations.ts` |
| Claude launch/install | `apps/skills/claude/`, `apps/skills/core/`, `apps/hook/hooks/hooks.json`, `scripts/install.ps1`, `scripts/install.cmd` |

Use filename discovery if a file moved in 01. Do not recreate deleted files merely to satisfy these historical starting paths.

## Feature/consumer contracts

- Remove Guided Review generation/history UI, guide/tour commands/endpoints, exports/sharing, new guide storage writes, background review agents, Code Tours, and their exclusive packages/assets/deployments. **Do not purge existing guide/history files from the user's data directory.**
- Retained parser/types currently reach `guide-viewer` via shims; redirect them to their existing owner `@plannotator/core/diff-files`. Move the two retained markdown renderers and sanitization tests into an appropriate retained package before deleting guide-only code. Do not recreate a second parser or weaken HTML sanitization.
- Remove multi-repository **Workspaces** flows, combined-child-repo mode and teaser. Ordinary **Git worktrees** are not Workspaces; PR-local worktree and current-cwd correctness remain. D4/PR/VCS gates do not authorize their deletion.
- `/api/ai` chat, `/api/agents` background jobs, and Agent Terminal PTY are separate systems. Remove both document and review Ask AI, provider/config/settings/chat UI, and `packages/ai` only after retained execution dependencies have been disentangled. Retain PTY token/Origin protections, permissions, shutdown, process cleanup, cwd, and Windows runtime installation. Do not add a review-side terminal or custom conversation rail.
- Remove Share links, Import Review, the whole Export modal, note-app integrations (Obsidian/Bear/Octarine), and application Print/PDF. Preserve standalone **Download Annotations**, annotation feedback formatting, clipboard, and template helpers. Unregister app print shortcuts/listeners/styles/layers/help; do not intercept or disable the browser's own Print command.
- Delete Vim modes/engine/shortcuts/settings and editable identity controls, not normal selection/keyboard/history behavior or existing author/source metadata. A one-user UI is not a reason to drop external annotations, replies, or historical provenance.
- Remove stage/unstage controls, mutation routes and wrappers, not `runGit`, read-side status/diff computation, staged-diff viewing, review setup, or diff/base selectors. Spec 04 removes residual tree status presentation.

## Settings/menu shape after cleanup

Document options keep Theme, Settings, Agent Instructions, Download Annotations, and version/history controls. Review keeps Set up review view, Agent Instructions, and unrelated retained functionality. Apply removals to desktop **and** compact/touch layouts.

Keep General, Theme, Git, Display, Analysis, Saving, Labels, Shortcuts, Files, Comments, and Hooks insofar as their features remain; remove AI, Vim, and notes-app controls and their dead config/default/capability producers. Spec 03 owns palette/favicon/font/icon controls. Spec 05 owns the global Images button and per-comment attachment UI.

Keep Semantic Changes and Call Flow. Audit/document their optional downloads instead of incorrectly treating them as the removed review-agent system. Preserve localhost/Host/Origin/path checks, HTML sanitization, WebMCP human-decision boundaries, external API validation, source-save conflicts, strict annotate gates, and safe file limits.

## Data compatibility and failure behavior

- `fromShareable` / `parseShareableImages` are currently used by draft restore despite living in `sharing.ts`. Establish a neutral read-only serialization boundary before removing sharing transport. Moving them to a small retained serialization module is the proposed implementation seam; verify exports/callers first, preserve their behavior, and do not invent a new schema just to rename the module.
- Read legacy tuple `a`/`g` plus modern full-object arrays and `globalAttachments`. Until 05, do not discard top-level images; hand their decoder/reference contract to 05. Keep IDs, direct edits, reply relationships, empty drafts, generation/tombstone handling, debounce and close flushing intact.
- Save Plans snapshots/sidecars, document version history, draft recovery, and feedback archive are independent. Keep existing opt-outs, identities, ordering and recovery; preserve drafts when feedback/archive/save publication fails. D2 is not permission to collapse them into one setting.
- Preserve API and agent-facing decision shapes: approval versus feedback/dismissal, strict gate exit 0/1/2 meanings, result-file no-clobber publication, and stdout framing. No failed post or write may appear as approval/success.
- Removal of external services must not silently redirect to another service. Test ordinary local fixtures with outbound access blocked after installing prerequisites; record unapproved network-capability policy separately.

## Claude command contract

Keep the executing Claude-specific templates under `apps/skills/claude` as the launcher source of truth. Preserve `disable-model-invocation`, `allowed-tools`, argument forwarding, and the bash-substitution command that runs before the model sees the prompt. Generic prose-only `apps/skills/core` variants are not interchangeable. Keep the CLI-reference skill if still used; installer copies and freshness tests must agree with its owner.

Keep the current command names until spec 06 renames them together to `/hypermark-annotate`, `/hypermark-last`, `/hypermark-review`. `/btw` remains **native Claude Code**, not a fourth launcher/skill, custom chat, or automatic selection upload. Its no-tool limitation is accepted. A newly spawned Claude PTY with a cwd is not proof of inherited conversation history; do not promise browser/selection context or resume behavior without evidence. Verify native `/btw` in the intended existing Claude conversation, including hook-wait behavior, without changing its transport.

## Numbered implementation steps

1. **Relocate shared primitives, then remove guide/workspace products.** Inventory retained guide-package consumers; preserve parser/types and sanitized markdown in their retained owners. Remove approved Guide/Tour/Workspaces producers and exclusive runtime/CLI/assets/settings paths without deleting historical user data or normal worktrees. Rebuild ordinary single-file/all-files review and test markdown rendering/navigation, cwd isolation and external annotations.
2. **Separate recovery from sharing, then remove sharing/import/export/print/notes.** Preserve tuple/object/image decoders and draft lifecycle fixtures first. Remove UI and transport in both editor modes/layouts, plus styles/shortcuts/config/help. Verify annotation download/copy and decision feedback still format correctly, legacy drafts still restore, and no removed service is called. Do not remove the old global-image arrays yet.
3. **Remove Ask AI/background execution; retain the Claude terminal.** Trace PTY and job ownership before deleting providers and `packages/ai`. Restrict the retained terminal's chooser/launch configuration to Claude without breaking permissions, runtime install, session/cwd identity or cleanup. Remove ghost provider calls, SSE reconnects and settings defaults. Verify actual Windows Claude terminal launch/stop/reopen, or mark that platform gate blocked; a browser fixture is not PTY proof.
4. **Remove Vim, editable identity and staging; prune menus/settings.** Keep normal keyboard selection, source edit/undo ownership, read-side Git, Analysis and Quick Labels. Verify no in-app stage/unstage path mutates the index; compare index state before/after review interactions. Test retained decisions and safety boundaries in both editors. Update actual surviving settings/shortcut docs rather than leaving empty tabs, stale menu items or default-seeding cookies.
5. **Verify Claude launchers and sweep retained entry points.** Prove the executing templates, allowlists and argument behavior still install/run with spaced/Unicode paths; document native `/btw` without custom aliases. Trace dynamic imports, workers, CSS, routes, capabilities, registries, package exports, generated/build reads, install scripts and tests for orphan references. Remove dependencies only once no retained caller needs them. Run the full shared verification policy and local no-outbound fixture test.

## Exit / handoff

- [ ] Removed capabilities have no live producers/routes/commands/config/reconnects/deploy paths, not merely hidden buttons.
- [ ] Approve/deny/notes/gates, recovery mechanisms, native launchers, external annotations, source editing and local review still work.
- [ ] Actual terminal integration evidence exists or is explicitly blocked; `/btw` is not shadowed or overpromised.
- [ ] Decoder owner, legacy image fixtures and preserved mutation/draft contracts documented for 05.
- [ ] Each step has `bun test`, typecheck/build and relevant browser/Windows evidence; unrelated baseline failures and open gates are named.
- [ ] No product branding, real data migration/purge, publication, or unapproved PR/worktree/VCS removal occurred.

Append the execution record described in 01 before handing over to 03.
