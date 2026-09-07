# Spec 06 step 1 — frozen release-candidate contracts

**Date:** 2026-09-08
**Baseline SHA:** `bd465ee8` (`spec 05 step 6: images belong to comments, and only to comments`)
**Branch:** `hypermark/implementation`

This is the record spec 06 step 1 asks for: what specs 01–05 actually left
behind, which decisions are now settled, and which gates stay open. Everything
below was read out of the repository at the SHA above, not recalled.

## 1. Decisions settled by the user (2026-09-08)

| Question | Decision | Consequence for spec 06 |
| --- | --- | --- |
| **D5 — storage root** | **Start fresh at `~/.hypermark`. No import, no migration, no merge.** | The resolver's default becomes `.hypermark`. An existing `~/.plannotator` is left untouched and is *not* read: this is a new product's data root, not a continuation. Nothing is copied, moved, symlinked, or deleted. |
| **D6 — platform scope** | **Stay OS-agnostic.** | `scripts/install.sh` is **retained**, along with every other portable helper. The Windows-only cutover is explicitly declined: it was projected to save little and would cost the Linux/macOS install path. Installers still stop writing configuration for the agents specs 01–02 removed. |
| **`localFontPickerPolicy`** (open since spec 03) | **Keep the picker exactly as it ships today.** | No `queryLocalFonts()` enumeration, no trimmed list. This closes the question by decision rather than leaving it as a release gate. |

Two consequences of D5 worth stating plainly, because they are the parts a
reader will ask about later:

- A user who had Plannotator keeps their old plans, drafts, history, feedback
  and config exactly where they are. Hypermark simply does not look there. If
  they want that data, an explicit import is a separate assignment (copy,
  no-clobber, resumable, rollback, source unchanged) — not this one.
- Environment overrides are renamed to `HYPERMARK_*` with the `PLANNOTATOR_*`
  names accepted as aliases, because a fresh root reached through an old
  product's variable name is a foot-gun. Precedence is explicit and tested:
  `HYPERMARK_*` wins when set; a set-but-empty value keeps its current
  suppressing meaning rather than falling through to the alias.

## 2. Removed entry points (specs 01–02)

Fourteen application roots were removed in `5bfc1120`, leaving `apps/hook`,
`apps/review` and `apps/skills`. The capabilities removed end-to-end, not just
at the button: Guided Review, Code Tours, Workspaces, Vim mode (`acc11067`),
sharing transport and its serializers, Ask AI and background agent jobs
(`0f0cf9ea`, `f0774aa3`, `e2368eee`), the orphaned `ai-context` module
(`6b079178`), and the review editor's Ask AI surface.

Retained deliberately, and **not** to be re-deleted: git worktrees (standard
Git, not the removed Workspaces feature), the *read* side of staging
(`stagedFiles`, `'staged'`/`'unstaged'` diff options), `aiChatFormat.ts`
(`formatRelativeTime` has live consumers), and `useAgents.ts` / `agentSwitch.ts`
(the OpenCode switcher, distinct from removed agent jobs).

## 3. Compatibility keys and readers that must survive the rename

These are the old-name allowlist. A `plannotator` match in any of them is
correct, not a missed rename:

- **Licenses and attribution.** `LICENSE-MIT`, `LICENSE-APACHE`, and every
  `backnotprop` copyright line. Fork authorship may change; upstream copyright
  may not.
- **Upstream artifact ids.** `backnotprop.plannotator-webview` in
  `packages/server/uninstall.ts` names the *upstream* VS Code extension being
  uninstalled. Renaming it would make the uninstaller miss the thing it exists
  to remove.
- **Legacy decoders.** `packages/ui/utils/annotationSerialization.ts` (tuple
  `a`/`g` shareable annotations) and `packages/ui/utils/attachmentNormalization.ts`
  (legacy top-level images → one image-only `GLOBAL_COMMENT`), plus the legacy
  draft body in `packages/ui/hooks/useAnnotationDraft.ts`. These read data
  written before the fork; their key names are wire format.
- **Historical documents and fixtures.** Everything under `adr/`, `tests/`
  fixtures, and archived prose. Historical records are not rewritten.

## 4. Dependency pins at the freeze

`@pierre/diffs` 1.4.1, `@pierre/trees` 1.0.0-beta.6, `@phosphor-icons/react`
2.1.10, React 19.2.x, TypeScript ~5.8.2. `bunfig.toml` carries a 7-day
`minimumReleaseAge` with a named exclude list; the Pierre and editor packages
are on it.

## 5. Measured baseline

Taken at `bd465ee8` on the development machine (Windows 11, Bun 1.3.14):

| Measurement | Value |
| --- | --- |
| `bun run typecheck` (five projects) | 0 errors |
| `tsc -p packages/editor/tsconfig.json` | 39 errors (pre-existing baseline) |
| `tsc -p packages/review-editor/tsconfig.json` | 51 errors (pre-existing baseline) |
| `DOM_TESTS=1 bun test --isolate packages/ui packages/editor packages/review-editor` | 2100 pass / 1 skip / 0 fail, 238 files |
| `apps/review` build | `dist/index.html` 17,540.81 kB (gzip 5,606.48 kB), exit 0 |
| `build:hook` | `dist/index.html` 21,610.78 kB (gzip 6,760.97 kB), exit 0 |

An unscoped `bun test` is **not** a gate: it reaches `packages/server` and
`apps/`, where roughly 220 integration tests fail identically on a clean
checkout. Thirteen of those were re-verified this session by stashing all local
changes; they are environment failures (favicon PNG, obsidian vault, tilde
expansion, semantic-diff availability, file-browser watchers, a Bun virtual
sidecar path), not regressions.

## 6. Gates still open at the freeze

- **Completion records for 01–03 were never written.** This document is the
  first. The measurements above are a *current* baseline, not the pre-pruning
  one spec 01 step 1 asked for — that opportunity has passed, and no honest
  reconstruction of it exists.
- **Real Windows/Claude evidence.** Actual plan approve/deny through the hook,
  the executing annotate/last/review skills, and Claude terminal launch/stop/
  reopen were waived by the user as an evidence requirement. They remain
  *unverified*, and spec 06's acceptance matrix will say so rather than imply a
  pass.
- **Browser evidence.** Screenshots and manual browser passes are waived on the
  same standing instruction. Spec 05's gutter and composer work is proven by
  2100 tests and two clean builds, not by a human having looked at it.
