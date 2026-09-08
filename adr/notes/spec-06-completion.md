# Spec 06 completion record — branding, installers, release

Baseline SHA `bd465ee8`. Thirteen commits, `83195687` through `64d339c6`, on
`hypermark/implementation`. Contracts frozen in
[spec-06-release-contracts.md](spec-06-release-contracts.md); read that first,
this record only says what happened against it.

**Release status: blocked.** Not for anything broken — the gates below pass —
but because two of the acceptance matrix's required evidence classes were never
gathered. See "Gates left open" at the end. Nothing has been published,
deployed, uploaded or tagged.

## What shipped

| Step | Commits | Outcome |
| --- | --- | --- |
| 1. Freeze contracts | `83195687` | Baseline SHA, decisions D5/D6, old-name allowlist, dependency pins, measured baseline. |
| 2. Rename owned identifiers | `7a816b65` … `33b0d24f` (7) | Workspace scope, code identifiers, launchers, the bare and capitalised brand word, environment variables and data root, then the internal identifiers. |
| 3. Installer/uninstaller cutover | `5b26b84c` | Removed-agent writes gone from all three installers; uninstall ownership narrowed to what this product installs. |
| 4. Build the distributable | `782888b4` | Ordered review→hook build, version agreement, CLI smoke; outward-facing links repointed at the fork. |
| 5. Acceptance and documentation | `e1ba09d3`, `6015dc4c`, `64d339c6` | AGENTS.md, README and test docs rewritten; publishing paths removed. |

## Decisions taken during implementation

**D5 — fresh root, no import.** `~/.hypermark`. The old directory is never
read, copied, moved, merged, symlinked or deleted; it is not even probed.
Implemented in `packages/shared/data-dir.ts` and mirrored in all three
installers. Consequences recorded honestly in AGENTS.md: the feedback index
format is still a cross-tool contract, but this repo and `plannotator-tui` no
longer write to the same directory, so their indexes do not interleave.

**D6 — OS-agnostic.** `scripts/install.sh` is retained. The spec allowed
removing it in a coupled cutover; the user chose not to.

**Environment aliases.** `PLANNOTATOR_*` still works. One shim
(`packages/shared/env-aliases-apply.ts`) copies each legacy value onto its
`HYPERMARK_*` name once at process start, so the precedence rule lives in a
single tested place rather than being restated at ~200 readers. The current
name wins whenever it is **set**, empty included — `HYPERMARK_DATA_DIR=` must
not silently obey a stale `PLANNOTATOR_DATA_DIR`. Eleven tests in
`env-aliases.test.ts` pin that, including the set-but-empty case.

**Full internal rename (user decision, mid-implementation).** Step 2 had left
1,847 internal identifiers. Asked whether to rename the browser settings keys
only, everything, or nothing; the answer was everything. The settings keys were
the user-visible half: Hypermark and Plannotator share the localhost origin, so
before this a Hypermark install would have read and overwritten the other
product's theme, diff and identity settings.

**Uninstall ownership narrowed.** The uninstaller was removing Codex skills and
hooks, a Kiro agent, Gemini policies and commands, OpenCode configs and caches,
an Amp plugin, and was uninstalling Copilot, Droid, Pi and VS Code extensions.
Hypermark installs none of those. Removing them is uninstalling the other
product, which D5 forbids and which the spec's "uninstall ownership must not
expand silently" rule already ruled out.

**Workspaces promo removed.** The review setup dialog carried a page
advertising a hosted product upstream is building, ending in a waitlist link.
The rename had already rewritten its alt text to "Hypermark Workspaces", turning
an ad for someone else's product into a false claim about this one.

## Bugs found and fixed along the way

These were live defects, not rename churn:

- **The update check queried upstream.** `useUpdateCheck.ts` read
  `backnotprop/plannotator`'s latest release, so a Hypermark install would have
  compared its version against upstream's and offered upstream's release as its
  own update.
- **The uninstaller could not find its own skill.** `KNOWLEDGE_SKILLS` named
  `"plannotator"` while the installer writes `"hypermark"`, so the knowledge
  skill survived every uninstall.
- **The uninstaller could not find its own hook.** `isManagedHook` matched the
  bare command `"plannotator"` while `hooks.json` writes `"hypermark"`, so
  uninstall left its own Claude hook in `settings.json`.
- **Six long-standing `data-dir` test failures.** The resolver subprocess was
  handed `HOME` but not `USERPROFILE`, and Windows resolves `homedir()` from
  `USERPROFILE`, so every case fell through to the real home directory.
- **A live publishing credential.** `release.yml`'s `npm-publish` job opened
  the `npm-publish` environment and requested `id-token: write` against
  registry.npmjs.org; its publish step was already gone, so all it could do was
  hold the credential. Four packages also carried no `private` flag.

## Names deliberately not renamed

Beyond the frozen allowlist, five classes were shielded from the sweep because
each refers to something this fork does not own:

- the `@plannotator/` npm scope — `webtui`, `atomic-editor`, `markdown-editor`
  and `web-highlighter` are real published dependencies, and renaming them 404s
  `bun install` (this actually happened once, in step 2a);
- `plannotator.ai` domains and the upstream X handle;
- `backnotprop.plannotator-webview` and `backnotprop/plannotator`;
- `plannotator-tui` — another tool's `client` value in a shared wire format;
- prose that exists to name the old root, in `data-dir.ts`, the alias modules,
  the three installers and the coexistence test fixtures.

Three near-misses the shield did not catch, found by running the suites rather
than by reading the diff, and worth recording as a method note:

1. `@plannotator/markdown-editor/themes/plannotator.css` is a path *inside* an
   external package, whose exports map offers no other name.
2. `plannotator-paste.plannotator.workers.dev` in `crypto.test.ts` is a live
   endpoint upstream operates; the renamed host does not exist (404).
3. `no-outbound-share.test.ts` is a security guard whose forbidden patterns
   **are** the upstream hosts. Renaming them would have silently disarmed the
   check that upstream's removed share transport has not crept back.

A fourth was self-inflicted: `launcher-contract.test.ts` asserts that a launcher
body never contains the old command name, and the sweep turned that into
`not.toContain("hypermark-")` against a file named `hypermark-annotate`.

## Measurements

Windows 11, Bun 1.3.14, same machine as the baseline.

| Measurement | Baseline (`bd465ee8`) | Now |
| --- | --- | --- |
| `bun run typecheck` (five projects) | 0 errors | 0 errors |
| `tsc -p packages/editor` | 39 errors | 39 errors |
| `tsc -p packages/review-editor` | 51 errors | 51 errors |
| `DOM_TESTS=1 bun test --isolate packages/{ui,editor,review-editor}` | 2100 pass / 1 skip / 0 fail | 2100 pass / 1 skip / 0 fail |
| `bun test packages/{shared,core,server}` | 41 fail | **39 fail** |
| `bun test apps scripts tests` | 8 fail | 8 fail |
| `apps/review` build | 17,540.81 kB | **17,400.53 kB** |
| `build:hook` | 21,610.78 kB | 21,610.45 kB |

The two package failures that disappeared were baseline failures fixed by the
rename, not tests deleted: the Obsidian integration's default tag and the
scoped-path fixture in `parseAnnotateArgs` had both been renamed in source
without their tests. The 139 kB drop in the review bundle is the Workspaces
screenshot and its promo page.

Failure counts were established by `git stash push -u`, re-running, and
`git stash pop` — not assumed. The remaining 39 and 8 are the pre-existing
environment failures the contracts document describes (favicon PNG, obsidian
vault, tilde expansion, semantic-diff availability, file-browser watchers, a
Bun virtual sidecar path, and the six PowerShell attestation-scanner cases).

`bun run check:release-version` agrees at **v0.27.12** across the CLI, the
plugin manifest and the release metadata. The renamed binary was smoked from a
path containing a space: `--help`, `--version` and `sessions` all behave.

## Removed test ownership

Fourteen tests were deleted, each because its only subject was an integration
spec 02 removed — six in `uninstall.test.ts` (OpenCode JSONC config, malformed
OpenCode config, the Gemini hook, the relocated Codex hook, malformed Gemini
settings, escaped spellings in Gemini/Kiro config) and eight in
`install.test.ts` (OpenCode/Gemini command install, Kiro auto-install, four
Codex hook cases, the Pi extension updater, and the per-agent skip opt-outs).

Nothing retained lost coverage. The strict-JSON-formatting, unwritable-settings
and host-failure cases were **re-pointed at Claude's `settings.json`**, not
dropped, and `uninstall.test.ts` gained a coexistence test that sets up a
machine which also ran Plannotator — its data root, skills, commands,
Codex/Kiro/Gemini/OpenCode/Amp files and caches — and asserts every one of them
still reads `"not ours"` afterwards.

## Gates left open

**Real Windows/Claude session evidence — NOT VERIFIED.** No plan was approved
or denied through the actual hook in a live Claude Code session; no annotate or
review skill was executed with arguments; the PTY terminal was not exercised.
The CLI was smoked (`--help`, `--version`, `sessions`) and the hook and launcher
contracts are covered by source-level tests, but that is not the same thing.
The acceptance matrix requires the real session, and it is missing.

**Browser evidence — NOT VERIFIED.** No before/after screenshots, no manual
browser pass, no visual sign-off on the theme/icons/fonts row. Waived by
standing instruction for this work; recorded here as absent rather than passed,
because the matrix asks for it.

Both are recorded as **unverified**, not as passes. Everything else in the
matrix that can be checked without a live session or a browser has been.

**Known documentation gap.** `packages/ui/HANDOFF.md` still describes handing
this UI to the commercial Workspaces app and references `/api/ai/*` endpoints
that no longer exist. It is a historical handoff document rather than live
guidance, so it was left alone; a future pass should either date-stamp it as
historical or rewrite it.

## Not done, deliberately

No publish, no deploy, no tag, no upload. The local artifact is
`apps/hook/dist/index.html`, built from the current source in the required
review→hook order. Integrity verification (`gh attestation verify`, the SLSA
provenance opt-in, checksum checks) is untouched — only the credentialed
publish path was removed.
