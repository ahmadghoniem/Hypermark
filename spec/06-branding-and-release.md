# 06 — Rename last, package for Windows, verify the whole fork

Status: **Planned; not implemented.** Read [01](01-foundation-and-scope.md)'s shared rules and approval register first. Implement the rename **after** 02–05, so a structural rename does not obscure behavioral regressions. Do not publish or deploy anything as part of this assignment.

## Outcome and non-goals

Deliver a coherently named, locally installable Hypermark for the user's Windows/Claude Code workflow, with current built HTML, preserved licenses, explicit data ownership, and evidence for retained behavior.

No blind string replacement, new migration subsystem, automatic imports/moves/symlinks/junctions, deletion of a previous Plannotator installation, full Windows-only internal rewrite, extra integrations, public package release, or production deployment. A release build is not authorization to upload it.

## Required reads / starting paths

- Root `package.json`, `bun.lock`, `bin/plannotator.js`, `.claude-plugin/marketplace.json`, `.factory-plugin/marketplace.json` if still present, `openpackage.yml`, `README.md`, `AGENTS.md`, `LICENSE-MIT`, `LICENSE-APACHE`.
- `apps/hook/.claude-plugin/plugin.json`, `apps/hook/hooks/hooks.json`, `apps/hook/server/index.ts`, `apps/hook/server/cli.ts`, `apps/hook/package.json`, `apps/review/package.json`, retained `packages/*/package.json` and package exports/aliases.
- `apps/skills/claude/`, `apps/skills/core/`, `scripts/install.ps1`, `scripts/install.cmd`, `scripts/install.sh`, `scripts/install.test.ts`, `scripts/check-release-version.mjs`, `.github/workflows/`.
- `packages/shared/data-dir.ts`, `packages/shared/config.ts`, `packages/shared/draft.ts`, `packages/shared/storage.ts`, `packages/shared/feedback-archive.ts`, `packages/server/uninstall.ts`, Claude/PTY runtime install and session-registry call sites.

These are pre-rename starting paths, not a request to recreate files legitimately removed by 01/02. Verify live counterparts and actual published package/type metadata before changing references.

## Branding and licensing contract

- Visible app, executable, retained command names and plugin identity become **Hypermark / `hypermark`**. The three Claude launchers become `/hypermark-annotate`, `/hypermark-last`, `/hypermark-review`; keep native `/btw` untouched.
- Coordinate bin entry, file paths, workspace/package references, Vite/TS/build aliases, executable allowlists, hook/plugin/marketplace manifests, launcher templates, installer copies, release artifact names, version checks, URLs, docs and tests. Do not leave a launcher calling an absent old binary or install two active review hooks.
- Repository/homepage/issue metadata points to `ahmadghoniem/Hypermark`. Fork authorship metadata may change; preserve original `backnotprop` copyright notices and both existing license files. Do not infer a legal author name from a Windows account path; use the user's agreed fork attribution.
- Keep third-party attribution, including Phosphor and Pierre notices. No claim of owning upstream code. Audit real distributed licenses, not recalled package-size/license estimates.
- Make retained packages private unless publication is separately authorized; remove/disable upstream and removed-service publishing/deployment paths. Local package identity changes must update all retained consumers, not cause accidental publishing under upstream names.
- Maintain an explicit old-name allowlist: copyrights/credits, historical docs/data, compatibility keys/readers, protocol identifiers that must remain stable, and fixtures. A residual `plannotator` match is not automatically a bug. Avoid rewriting historical user prose, archives, serialized records or unrelated cookies.
- Update `AGENTS.md` to describe the smaller product accurately while preserving useful architecture/safety/testing instructions. Rewrite rather than blindly deleting rules whose original subsystem name changed.

## Open storage decision (D5) — a hard boundary

Brand/command rename and storage ownership are separate. Existing settings, drafts, history and feedback are normally under `%USERPROFILE%\.plannotator`; this spec does **not** choose a fresh `.hypermark` default or move anything automatically. Preserve current resolver behavior until the user chooses otherwise. If both tools continue writing the old root, document shared writes honestly.

Before changing any data/env/cookie behavior, obtain and record the policy:

| Open question | Safe behavior before approval |
| --- | --- |
| Continue in place or use a fresh root? | Keep current resolution and original files untouched. |
| Add `HYPERMARK_*` variables and legacy aliases? | Keep existing env/config contract; new prefixes are proposed, not approved by renaming the app. |
| Empty versus unset values, both override names present? | Do not guess. Define per-setting precedence and tests before introducing aliases; some current empty-but-set values deliberately suppress config. |
| Import previous state? | No automatic importer. An explicit future import is a separate assignment with copy/no-clobber/resumability/rollback and unchanged source. |

Do not merge two roots, alias them with a symlink/junction, import credentials/locks/PTYS/session registries/runtime binaries, clear unrelated localhost cookies, or move the only copy of data. Preserve historical readers without rewriting their records. Uninstall ownership must not expand silently because a product label changed.

## Windows installation contract (D6)

Target Windows users; keep portable development/CI helpers. The intended end-user scope removes `scripts/install.sh` only in the agreed coupled cutover after its Windows replacement path is verified. Removing that installer is not permission to delete every `.sh` script or port all internals to Windows-only code.

Windows installers must no longer detect/configure/install deleted agents, copy missing app roots, or claim their commands are available. Keep the executing **Claude** launchers, plan hook, applicable PFM/Improvement hooks under D2, correct current UI binary/assets, and Claude terminal runtime installation.

Preserve download integrity/attestation behavior, safe path quoting, cleanup ownership and unrelated Claude configuration. Support paths with spaces and Unicode. Do not uninstall an existing Plannotator copy or rewrite its whole settings file. Install only the intended hook once; legacy aliases must not launch duplicate review sessions. Native `/btw` is not installed by Hypermark.

## Numbered implementation steps

1. **Freeze the release candidate contracts.** Read completion records from 01–05. Record actual SHA/pins, removed-entry-point graph, protocol/data compatibility keys, unresolved approval/platform gates, synthetic fixtures, and baseline/current metrics. Resolve D5 only if a storage change is requested and D6 before its cutover. Do not mark unapproved theme/font/storage behavior or untested Windows integration as accepted. Ordinary non-storage branding can proceed with existing storage unchanged.
2. **Rename owned identifiers and launcher paths coherently.** Update the branding surfaces above together, keeping license/compatibility allowlists intact and packages non-publishable. Prove the renamed three Claude skills retain automatic execution, human-only invocation, allowlists and argument forwarding; review plan hook decisions and executable resolution. No broad data rewrite or native `/btw` alias. Keep actual typechecks for retained app entry points.
3. **Complete the agreed Windows installer/uninstaller cutover.** Remove deleted-agent writes and stale artifacts, retain Claude PTY runtime installation, preserve unrelated settings. Remove `scripts/install.sh` and exclusive references/tests only when the cutover is approved and working; retain Linux dev/CI helpers. Verify fresh install, repeat install, coexistence with old Plannotator, restart and safe uninstall in isolated test roots. If optional D5 env/root changes are approved, implement only their explicit precedence and compatibility fixtures here; otherwise leave them unchanged.
4. **Build and test the actual distributable.** Run maintained typechecks, `bun test`, ordered review→hook build, then the current retained binary/package build. Root build must already encode review before hook. Open both review and plan/annotate UI from the newly built artifact, not stale `dist` HTML or the design prototype. Verify CLI/metadata/artifact versions agree, execute from a spaced/Unicode Windows path, and prove the renamed hook/commands/terminal start and clean up. Remove accidental release/deploy/publish actions, not integrity verification.
5. **Run the acceptance matrix and close documentation.** Compare measurements and browser evidence with baseline, inspect for removed live consumers and broken imports/links/help, and update setup/install/development/scope documentation plus 01–06 completion records. Record temporary theme compatibility paths still awaiting explicit removal confirmation. Leave release status blocked for any missing required platform/behavior evidence. Provide a local artifact/handoff, not an unsolicited publication.

Run `bun test` after **each** numbered step, including metadata/installer steps, plus the relevant focused checks. For UI changes, build review before hook and gather real browser before/after evidence. Do not weaken tests for retained behavior; explain exclusively removed test ownership.

## Release acceptance matrix

| Area | Required evidence |
| --- | --- |
| Claude decisions | Real plan approve, deny, supported notes; executing annotate/last/review skills with arguments; strict annotate gate outcomes/result files; one hook, correct stdout and exit codes. |
| Recovery | Save Plans toggle/custom path versus drafts/history/archive independence; close/reopen/restart, failed write/submit, direct edits and conflicts, legacy tuples/objects/top-level images, no duplicate migrations. |
| Document surfaces | Markdown, text, HTML, folder/linked docs, internal editing, image-only/global comments, feedback export/download, safe remote/live behavior left within approved scope. |
| Code review | Single-file/all-files, unified/split, old/new sides, add/delete-only files, collapsed/large/virtualized diffs, overlapping comments, token navigation/search, no stale markers after recycling. |
| Composer | Explicit in-popup Edit, bottom image-only thumbnails, picker/paste/drop where supported, multiple/remove/retry, malformed upload response, image-only submit, Save/Cancel, dismissal/reopen and missing temp-file behavior; no filename/size cards. |
| Tree | Fixed configuration, search hide-non-matches, expansion, file selection/reveal, keyboard, paths/case/Unicode, rename mapping and worktree correctness; no stage/status/drag/rename controls. |
| Theme/icons/fonts | Supported palette/mode contract, coherent cold/rapid/system switches across fences/tree/diffs/terminal/annotations, visible red/green fills, Classic favicon, Phosphor ownership; explicit visual sign-off before compatibility deletion. Approved font UX tested on real Windows Chrome/Edge, including permission denial/new origins/unavailable families. |
| Accessibility | Keyboard-only comments/editing/removal, focus visibility/return, Escape, non-hover access, readable semantic/loading/error states; no loss of comments in overlaps. |
| Network | Normal local fixtures with outbound blocked after prerequisites; no share/font-CDN calls. Optional external capabilities explicitly documented, not described as offline. |
| Install/data | Fresh/repeat/coexisting installs, Unicode/spaced paths, current embedded HTML and PTY runtime, safe cleanup/uninstall; old-only/both data roots/explicit overrides; no source mutation, hidden merge/symlink/purge. |
| Size/performance | Emitted bundle bytes, cold start and representative large diff/tree behavior measured in the same environment as baseline; palette-menu or LOC reduction is not proof of smaller shipped code. |

Linux sandbox checks cannot attest to Windows installation, actual Claude session ownership, PTY operation, or native font permissions. Name any missing environment and evidence; never substitute a mock or successful recording for the gate.

## Exit / handoff

- [ ] Renamed local artifact, manifests, hooks, launchers, docs and versions agree; current review HTML is bundled.
- [ ] All retained workflow and compatibility checks pass with actual Windows/Claude evidence; open decisions are resolved or explicitly left unchanged and documented.
- [ ] Data, licenses and upstream attribution remain intact; no unsolicited publish/deploy/import/uninstall occurred.
- [ ] Per-step test/build evidence, final screenshots/recordings, metrics, old-name allowlist and any outstanding gates are attached to the completion record.
