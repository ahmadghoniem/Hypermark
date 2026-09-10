# 01 — Start here: scope, baseline, and application pruning

Status: **Planned; product implementation has not started.** Updated 2026-09-05.

This directory is the six-spec implementation handoff for Hypermark. Read this file before any other spec. It consolidates the earlier [fork specification](../adr/specs/hypermark-fork-spec-20260905.md), [review](../adr/specs/hypermark-fork-review-20260905.md), and [design decisions](../adr/specs/hypermark-design-decisions-20260905.md). Those documents remain rationale/history; these six files own task boundaries and the latest requirements. Repository safety instructions and subsequent explicit user decisions still take precedence. Reorganizing the plan does not approve its open decisions.

## Six work packages

| Spec | Responsibility | Dependency |
| --- | --- | --- |
| **01 — this file** | Baseline, shared guardrails, remove unwanted apps, repair build/typecheck graph | First |
| [02 — Feature removal and Claude](02-feature-removal-and-claude.md) | Remove unwanted runtime/UI capabilities while retaining Claude, data recovery, and local review | 01 |
| [03 — Theme, icons, fonts](03-theme-icons-and-fonts.md) | Pinned renderer baseline, theme synchronization, palettes, Classic favicon, Phosphor, font-policy gate | 02 |
| [04 — File tree](04-file-tree.md) | Pierre tree adapter, fixed configuration, navigation/search without staging or status decoration | 03's renderer/theme contract |
| [05 — Comments and attachments](05-comments-and-attachments.md) | Real upload repair, legacy images, editable gutter popover, bottom image-only thumbnails | 02's serializer boundary; 03's renderer baseline |
| [06 — Branding and release](06-branding-and-release.md) | Rename last, Windows packaging, approved storage policy, final integration verification | All implementation work above |

Recommended assignment sequence: **01 → 02 → 03 → 04 → 05 → 06**. This is task organization, not a new product decision. 04 and 05 do not require each other's implementation, but their App/renderer changes should be integrated serially unless isolated branches and merge ownership are agreed. Unapproved polish must not be mislabeled complete just to unblock another spec: record which prerequisite contracts actually passed.

Coverage of the old 0–14 phases: 0–1 → 01; 2–5 and 12 → 02; 6–8 and 13 → 03; 11 → 04; 9–10 → 05; 14 → 06. The six files consolidate phases; they do not drop them.

## Product boundary — applies to every spec

Hypermark is a single-user, Windows-targeted, Claude Code-only fork of Plannotator. Retained application roots are `apps/hook`, `apps/review`, and required parts of `apps/skills`. Keep inexpensive portable internals and Linux development/CI support; this is not a rewrite of all runtime code to Windows APIs.

**Keep working throughout:**

- Plan hook approve/deny, supported approval notes, structured output and exit codes; document/folder/HTML annotation; annotate-last; single-file and all-files code review; internal source editing and conflict recovery.
- Annotation add/edit/delete, undo/redo, Quick Labels, comment attachments, image-only comments, Global Comment, Copy Plan, Agent Instructions, Download Annotations, and useful search/navigation.
- Save Plans, version history/diffs, drafts, archive browsing, feedback archive, and existing independent settings/opt-outs while D2 remains open. These mechanisms are not interchangeable.
- Explicit Agent Terminal, restricted to Claude, with its PTY/runtime/permissions/cleanup. Native `/btw` is not Ask AI and not a custom Hypermark skill.
- Review setup and diff/base selectors, reading staged changes, correct current Git worktree, Semantic Changes and Call Flow, WebMCP, external annotation ingestion/provenance, and safety/sanitization guards unless separately removed by an explicit decision.
- Both MIT and Apache-2.0 licenses, original `backnotprop` attribution, and third-party notices.

**Settled removals/changes:** the 14 apps below; Guided Review, Code Tours, background review agents; multi-repository Workspaces and its teaser; sharing/import/export modal/app print/notes integrations; Ask AI in both editors; AI settings, Vim, identity field; stage/unstage and tree git-status decoration; global Images action/new top-level attachment writes after safe conversion; unwanted palettes, Totman, direct Lucide. Specs 02–05 detail the coupled removals.

Approved comment direction: gutter preview → pinned popup → explicit **Edit** → full composer in the same popup. No margin notes, permanent below-line comment block, right-hand duplicate editor, author/“You”/time chrome, or comment ordinal counters. Unified/split remain selectable and red/green diff fills remain visible. Images appear **below text, inside the composer, above its actions**, as actual thumbnails with remove controls, not filename/size cards. Phosphor owns Hypermark controls; Pierre keeps its diff/tree internals.

## Approval register — stop only the affected change

| Decision | Current authority / safe behavior |
| --- | --- |
| D1: native `/btw` | Approved. Accept no-tool behavior. Do not build a custom chat, shadow the command, or claim implicit browser/session context. |
| D2: saving and hooks | Final keep/remove choice remains open. Preserve Save Plans, PFM/Improvement hooks, drafts/history/feedback archive and their independent controls; do not use uncertainty as permission to delete recovery. |
| D3: agent jobs and tours | Removal approved; Claude Agent Terminal explicitly retained. Trace ownership before deleting any shared job/provider utility. |
| D4: external capabilities | No Hypermark-operated backend, share upload, or automatic font-CDN calls for normal local review. URL/Jina, Git hosting, runtime downloads, remote/tailnet, and Claude network policy remain separately open. No blanket offline claim. |
| D5: storage and environment names | Open: old root versus fresh `.hypermark`, imports, and `HYPERMARK_*`/legacy alias rules. Preserve current storage/config behavior until chosen. No automatic move, merge, symlink/junction, purge, or importer. |
| D6: Windows installer cutover | Desired scope is deleting `scripts/install.sh`, not a deeper Windows-only rewrite. Carry out the coupled installer slice only after its sequencing/cutover is agreed and Windows install/cleanup works. Keep it until then; no orphan references. |
| D7: visual finish | Palette inventory/Pierre direction is specified; light/dark polish and final palette sign-off remain deferred. Inventory temporary compatibility paths; explicitly remind/ask before deleting them at sign-off. No generic theme-engine rewrite. |
| D8: gutter editing | Approved, including bottom image-only thumbnails. No need to reopen margin-note, right-editor, fill-toggle, or icon-family choices. |
| PR/MR, worktree picker, non-Git VCS | Retention/removal remains open. Preserve them; Claude-only does not mean Git-only. Ordinary worktree correctness is mandatory regardless of picker policy. |
| Installed-font UX/defaults | Enumeration, manual family entry, and bundled-default policy remain open. Keep a usable local font path; no startup enumeration or mandatory fixed port. Spec 03 contains the decision gate. |

If an open decision is unavoidable, state its exact affected step and pause it. Continue independently safe work only; do not pick a preference for the user or silently call the spec complete.

## Shared execution and verification rules

- An assignment is one spec, not permission to implement the entire fork. Re-read its live imports, call sites, manifests, lockfile, and nearby tests. Historical line numbers/package-size estimates are not executable truth.
- Keep a recoverable baseline and existing user changes. Do not operate on the user's installed marketplace copy as the only source checkout. Never touch real `~/.plannotator`, `.hypermark`, Claude settings, or real feedback during tests.
- For a deletion, trace UI producers, server routes, CLI dispatch, settings/defaults/cookies, dependencies/exports, dynamic imports, workers, CSS imports/`@source`, generated assets, builds, installers, CI, docs, and tests. Delete exclusive feature code, not shared retained behavior.
- **Run `bun test` after every numbered implementation step**, not merely once per spec. Also run focused regression tests and maintained typechecks; do not disable rules, weaken assertions, or drop retained coverage to turn failures green. Record known baseline failures separately from new ones, with exact commands/results. A failed retained behavior blocks its handoff.
- After frontend changes, run `bun run --cwd apps/review build` **before** `bun run build:hook`. The final root build must encode that order. Repair typecheck coverage for retained editors rather than merely omitting failing projects.
- Preserve tests for mixed features by adapting the removed portion only. An exclusively deleted feature's test can leave with it; justify that ownership in the handoff. Restore env/global mutations per test because Bun shares a process; isolate data-directory writes in temporary fixtures.
- UI changes need synthetic before/after browser evidence and an interaction recording where relevant. Inspect pixels, focus, console/network errors, and behavior; tests/builds alone do not prove renderer correctness. Never distribute private code, images, or tenant data as fixtures/evidence.
- Before modifying Pierre renderer/worker/shadow boundaries, load the repository's `pierre-guard` skill when available. Verify pinned types/public APIs; preserve structural selectors and editing contracts. Do not paste the prototype DOM as a production renderer replacement.
- No automatic publishing, deployment, package release, data migration, or unrelated architecture refactor. Large changes can use small reviewable commits/PRs within one spec; six specs does not require six huge PRs.

## This spec's starting points

Read [package.json](../package.json), [bun.lock](../bun.lock), [AGENTS.md](../AGENTS.md), [UI package contract](../packages/ui/README.md), `apps/hook/package.json`, `apps/review/package.json`, `.github/workflows/`, `scripts/install.ps1`, `scripts/install.cmd`, `scripts/install.sh`, and each app's imports/build configuration before deleting it.

Recorded planning baseline: commit `d749c55c027ad033c76684b8445afd485fa9a4d3`, root version `0.27.12`, root Diffs pin `1.3.2`. Rediscover the actual tip and pins at execution time.

## Numbered implementation steps — 01 only

1. **Capture the baseline and scope map.** Record Git tip/status, Bun/Node, installed dependencies, Windows/browser/Claude versions available for verification, workspace/build/export graph, and data-format/key inventory. Install from the existing lockfile as needed. Run baseline `bun test`, `bun run typecheck`, and ordered review→hook build. Record pre-existing errors without suppressing them. Capture synthetic plan approve/deny, markdown/HTML, code-review, theme, and image-selection fixtures; measure emitted bundle bytes/cold start and representative large diff/tree behavior.
2. **Prove retained recovery before pruning.** Exercise Bun plan approve and deny, supported notes, annotate feedback/dismissal/gate results, and review feedback against isolated data. Distinguish Save Plans snapshots, document history, draft recovery, and feedback archive. Confirm failure retains drafts and stdout/result/exit contracts remain intact. Keep PFM/Improvement behavior until D2 changes. Document any real Windows/Claude gap rather than substituting the prototype.
3. **Remove unwanted application roots as one graph-aware slice.** Remove `apps/pi-extension`, `apps/opencode-plugin`, `apps/vscode-extension`, `apps/guides-show`, `apps/amp-plugin`, `apps/marketing`, `apps/waitlist-service`, `apps/paste-service`, `apps/droid-plugin`, `apps/portal`, `apps/codex`, `apps/copilot`, `apps/gemini`, and `apps/kiro-cli`. Remove their exclusive assets, scripts, workspace/dependency and build/typecheck/test references together. Preserve any retained shared consumer before its producer disappears. Do not delete `packages/guide-viewer` or shared serializers here; spec 02 relocates their kept consumers first. Disable removed-service deployment paths rather than running them.
4. **Repair the retained build and install graph.** Root `build` currently includes OpenCode; `typecheck` starts with the Pi vendor script. Replace removed-app steps while retaining actual type coverage for editor/review/core/shared/server/UI entry points. Make review→hook ordering automatic. Remove Windows-installer writes/detection/copy paths for deleted agents without doing the final rename or prematurely removing `install.sh`. Preserve Claude launcher templates and terminal runtime installation. Clean unused dependencies only after tracing all retained entry points; update the lockfile normally. Re-run checks and serve the real built review/plan UI to exclude stale bundled HTML.

Before Pi is actually removed, follow the repository's dual-server requirement for any shared endpoint changes. After that removal, verify retained Bun behavior; do not resurrect or maintain a removed Pi mirror.

## Exit and handoff

- [ ] Baseline SHA, commands, failures, measurements, and data/entry-point inventory recorded.
- [ ] Fourteen app roots and exclusive live references removed; retained roots/build/typechecks/Claude installation still work.
- [ ] Retained decision, recovery, and image-reference formats have regression fixtures; no real user data changed.
- [ ] Each numbered step's `bun test` result and additional evidence recorded; unknown platform gates explicitly blocked.

Each spec should finish with a short execution record: **completed step IDs, commit(s), files/contracts changed, exact checks and results, evidence links, open gates, and the next safe step**. Leave status Planned/Blocked/In progress honestly until its acceptance criteria pass.

Reusable assignment: “Read `spec/01-foundation-and-scope.md`, then implement only `spec/NN-….md`. Verify prerequisites and open decisions; run `bun test` after each numbered implementation step. Preserve retained behavior and user data. Report evidence and blocked steps; do not expand scope.”
