# Hypermark

A plan review UI for Claude Code that intercepts `ExitPlanMode` via hooks, letting users approve or request changes with annotated feedback. Also provides code review for git diffs and annotation of arbitrary markdown files.

> **The document UI (theme / markdown / editor / settings / comments / layout) lives in `@hypermark/ui` + `@hypermark/core`. Read `packages/ui/README.md` FIRST before changing it.** It explains how those two packages are put together and the host-override seams a consumer plugs its own backend into via `configureHypermarkUI()`. A prior from-scratch reimplementation of this UI broke the app and was reverted — do **not** rebuild it or recreate `packages/document-ui`. Add a seam to `@hypermark/ui` instead, keep the app unchanged, and never delete working code until a human confirms parity in the browser.

## Project Structure

Hypermark is a fork. Specs 01–06 under `spec/` removed every agent
integration except Claude Code, along with the marketing site, the paste and
share services, Guided Reviews and the guides.show viewer, and the VS Code
extension. What follows is what is actually here — if a document elsewhere in
the repo describes a subsystem you cannot find, it predates that pruning.

`AGENT_CONFIG` (`packages/core/agents.ts`) and `PromptRuntime`
(`packages/shared/config.ts`) now carry the single `claude-code` entry, and the
env-var detection chain in `apps/hook/server/index.ts` is gone — `HYPERMARK_ORIGIN`
is still honored, validated against `AGENT_CONFIG`. An unrecognized origin on an
archived record degrades to "Coding Agent" rather than throwing. The OpenCode
agent-switch feature (`/api/agents`, `useAgents`, `ApproveDropdown`,
`agentSwitch.ts`, and the `agentSwitch` decision field, which no consumer ever
read) went with it.

```
hypermark/
├── apps/
│   ├── hook/                     # Claude Code plugin (no commands/ — core skills installed to ~/.claude/skills act as slash commands)
│   │   ├── .claude-plugin/plugin.json
│   │   ├── hooks/hooks.json      # PermissionRequest + PreToolUse hook config
│   │   ├── server/index.ts       # Entry point (plan + review + annotate + archive subcommands)
│   │   ├── server/cli.ts         # Argument parsing, --help, --version
│   │   └── dist/                 # Built single-file apps (index.html, redline.html, review.html)
│   ├── review/                   # Standalone review app (Vite build; its dist/index.html is copied into apps/hook/dist)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   └── vite.config.ts
│   └── skills/                   # Agent skills (agentskills.io format)
│       ├── claude/               # Claude Code launchers — dynamic-context injection (!`hypermark … $ARGUMENTS`) + allowed-tools
│       ├── core/                 # CORE skills (single-sourced) — installed to ~/.claude/skills and ~/.agents/skills
│       │   ├── hypermark/            # Knowledge layer: model-invocable CLI reference (subcommands, flags, exit codes); keep in sync with apps/hook/server/cli.ts by hand
│       │   ├── hypermark-review/     # Lightweight: opens review UI
│       │   ├── hypermark-annotate/   # Lightweight: opens annotate UI
│       │   └── hypermark-last/       # Lightweight: annotates last message
│       └── extra/                # EXTRA skills — NOT default-installed; add via `npx skills add ahmadghoniem/Hypermark/apps/skills/extra --global`
│           ├── hypermark-compound/        # Research analysis agent (map-reduce over denied plans)
│           ├── hypermark-setup-goal/      # Goal package scaffolder for /goal workflows
│           └── hypermark-visual-explainer/ # Visual HTML generator (plans, diagrams, PR explainers) with Hypermark theming
├── packages/
│   ├── server/                   # Bun server — the only server implementation
│   │   ├── index.ts              # startHypermarkServer(), handleServerReady()
│   │   ├── review.ts             # startReviewServer(), handleReviewServerReady()
│   │   ├── annotate.ts           # startAnnotateServer(), handleAnnotateServerReady()
│   │   ├── uninstall.ts          # `hypermark uninstall` — removes only what this product installs
│   │   ├── server-port.ts        # HYPERMARK_PORT selection + loopback server startup
│   │   ├── live-proxy.ts         # annotate-app loopback proxy + injected bridge
│   │   ├── agent-terminal*.ts    # Annotate-mode PTY terminal and its managed Node/WebTUI runtime
│   │   ├── browser.ts            # openBrowser()
│   │   ├── integrations.ts       # Obsidian, Bear integrations
│   │   ├── ide.ts                # VS Code diff integration (openEditorDiff)
│   │   ├── git.ts / gitbutler.ts / jj.ts / p4.ts   # VCS backends
│   │   └── project.ts            # Project name detection for tags
│   ├── ui/                       # Shared React components + theme
│   │   ├── theme.css             # Single source of truth for color tokens + Tailwind bridge
│   │   ├── themes/               # Per-palette CSS, including hypermark.css (the default palette)
│   │   ├── components/           # Viewer, Toolbar, Settings, etc.
│   │   │   ├── icons/            # Shared SVG icon components (themeIcons, etc.)
│   │   │   ├── plan-diff/        # PlanDiffBadge, PlanDiffViewer, clean/raw diff views
│   │   │   └── sidebar/          # SidebarContainer, SidebarTabs, VersionBrowser, ArchiveBrowser
│   │   ├── config/               # Settings registry + configStore (server config > cookie > default)
│   │   ├── shortcuts/            # Keyboard shortcut registry (see Keyboard Shortcuts section below)
│   │   │   ├── core.ts           # Engine: parser, formatter, dispatcher, validator
│   │   │   ├── runtime.ts        # Engine: useShortcutScope, useDoubleTapShortcuts hooks
│   │   │   ├── index.ts          # Barrel — re-exports engine + scopes from both subfolders
│   │   │   ├── plan-review/      # Scopes for plan-editor surfaces (annotationMode, annotationPanel, annotationToolbar, commentPopover, documentView, goalSetup, htmlAnnotate, imageAnnotator, inputMethod, sidebar, viewer, vimSelection)
│   │   │   └── code-review/      # Scopes for review-editor surfaces (ai, allFilesDiff, annotationToolbar, fileTree, prComments, suggestionModal, tourDialog)
│   │   ├── utils/                # parser.ts, storage.ts, planSave.ts, planDiffEngine.ts, planAgentInstructions.ts
│   │   ├── hooks/                # useAnnotationHighlighter.ts, usePlanDiff.ts, useSidebar.ts, useLinkedDoc.ts, useAnnotationDraft.ts, useCodeAnnotationDraft.ts, useArchive.ts, useUpdateCheck.ts
│   │   └── types.ts
│   ├── core/                     # @hypermark/core — browser-safe, zero-dep universal slice (pure utils + types) shared by ui + shared; published so @hypermark/ui can be installed standalone. `shared` re-exports the moved modules via one-line shims.
│   ├── shared/                   # Node/git/server logic + cross-runtime types (re-exports browser-safe modules from @hypermark/core)
│   │   ├── data-dir.ts           # Resolves ~/.hypermark (see Environment Variables)
│   │   ├── storage.ts            # Plan saving, version history, archive listing (node:fs only)
│   │   ├── draft.ts              # Annotation draft persistence (node:fs only)
│   │   └── project.ts            # Pure string helpers (sanitizeTag, extractRepoName, extractDirName)
│   ├── editor/                   # Plan review app
│   │   └── App.tsx               # Main plan review app
│   └── review-editor/            # Code review UI
│       ├── App.tsx               # Main review app
│       ├── components/           # DiffViewer, FileTree, ReviewSidebar
│       ├── dock/                 # Dockview center panel infrastructure
│       ├── demoData.ts           # Demo diff for standalone mode
│       └── index.css             # Review-specific styles
├── scripts/install.sh|ps1|cmd    # Installers (all three retained; the product is OS-agnostic)
└── .claude-plugin/marketplace.json  # For marketplace install
```

Four packages under the `@plannotator/` npm scope are **external dependencies
published by upstream**, not workspace members: `webtui`, `atomic-editor`,
`markdown-editor` and `web-highlighter`. Renaming them 404s `bun install`.

## Server Runtimes

One server implementation: the Bun server in `packages/server/`, used by the
Claude Code plugin in `apps/hook/`, which imports directly from
`@hypermark/server`. Runtime-agnostic logic (store, validation, types) lives in
`packages/shared/`.

## Installation

**Via plugin marketplace:**

```
/plugin marketplace add ahmadghoniem/Hypermark
/plugin install hypermark@hypermark
```

**Local testing:**

```bash
claude --plugin-dir ./apps/hook
```

## Environment Variables

The `PLANNOTATOR_*` aliases this fork inherited are gone; only `HYPERMARK_*`
names are read.

| Variable | Description |
|----------|-------------|
| `HYPERMARK_PORT` | Fixed port, or an inclusive range (`9000-9010`). Default: an OS-chosen free port. |
| `HYPERMARK_BROWSER` | Custom browser to open plans in. macOS: app name or path. Linux/Windows: executable path. |
| `HYPERMARK_ORIGIN` | Explicit agent-origin override at the top of the detection chain. Only `claude-code` is installed by this fork; the other ids the detector still recognizes name agents whose integrations were removed and are kept so an existing record's origin tag stays readable. Invalid values silently fall through to env-based detection. Unset by default. |
| `HYPERMARK_JINA` | Set to `0` / `false` to disable Jina Reader for URL annotation, or `1` / `true` to enable. Default: enabled. Can also be set via `~/.hypermark/config.json` (`{ "jina": false }`) or per-invocation via `--no-jina`. |
| `HYPERMARK_ANNOTATE_HISTORY` | Set to `0` / `false` to disable ALL annotate-session writes to the data dir: per-file version history (no copies of annotated files are written; the annotate version diff is unavailable) AND the durable submitted-feedback records (#678) that single-local-file annotate sessions otherwise write to `history/{project}/{slug}/submissions/` before deleting the draft on submit. Disabling it keeps annotate sessions fully stateless but also gives up that submit crash-recovery record. URL and annotate-last sessions never write either kind of data regardless of this flag. Folder sessions write no submitted-feedback records, but they do participate in per-file version history: the first time a session serves a file through /api/doc it snapshots that file (lazily, memoized per resolved path for the life of the server), which is what powers the per-file version diff when a folder file is reopened later; setting this flag to 0 disables those folder snapshots too. Setting it to 0 additionally suppresses **feedback archive** records for every annotate surface (single file, folder, URL, live app, annotate-last), so "fully stateless annotate session" stays literally true regardless of `HYPERMARK_FEEDBACK_HISTORY`. Default: enabled. Can also be set via `~/.hypermark/config.json` (`{ "annotateHistory": false }`); the env var takes precedence. |
| `HYPERMARK_FEEDBACK_HISTORY` | Set to `0` / `false` to stop archiving submitted feedback under `~/.hypermark/feedback/` (or `HYPERMARK_DATA_DIR`). Default: enabled, which appends one record per submission at decision-settlement time on all three surfaces and in both runtimes: plan approve/deny, code review Send Feedback / Approve (LGTM) / Close, and every annotate submit / approve / close. A review posted straight to GitHub or GitLab with `POST /api/pr-action` is delivered to the platform and is not archived locally yet. **Note that this writes the user's own feedback text, the document and code excerpts it quotes, and per-annotation metadata to disk, and nothing prunes the directory** (same policy as `plans/`, `history/`, and `guides/`); delete `~/.hypermark/feedback/` or a project subdirectory to forget, or set this to 0 to never write. Code-review records carry diff IDENTITY only (vcsType, diffType, base, gitRef, snapshotId, cwd, PR metadata, changed-file count, patch byte count), never the patch bytes; plan records carry the decision text plus a reference to the `history/{project}/{slug}/NNN.md` version the decision was made on, never a second copy of the plan. Externally sourced annotations (linters, review agents) are included but keep their `source` / `author` tags, so `source == null` selects the reviewer's own comments; agent job outputs (guides, tours) are not archived. This knob governs only the new archive: the `planSave` decision snapshots in `plans/` and the #678 annotate submission records under `history/` are unaffected. Annotate surfaces honor `HYPERMARK_ANNOTATE_HISTORY` as well. Can also be set via `~/.hypermark/config.json` (`{ "feedbackHistory": false }`); the env var takes precedence. |
| `HYPERMARK_CURSOR_SANDBOX` | Set to `0` / `false` / `disabled` to stop passing `--sandbox enabled` when launching Cursor's `agent` CLI for review jobs — the flag pair is omitted entirely, deferring to the user's own Cursor Agent sandbox configuration. For systems where Cursor's sandbox cannot start (NixOS, AppArmor-restricted Linux). Default: enabled (`--sandbox enabled` is passed). Can also be set via `~/.hypermark/config.json` (`{ "cursorSandbox": false }`); the env var takes precedence. Note: opting out means the review job's write protection relies on `--mode ask` plus the user's own Cursor configuration. |
| `HYPERMARK_TODO_PROVIDER` | Set to `off` / `0` / `false` / `disabled` to stop mirroring the approved plan checklist into an editable todo provider during execution. Default: enabled, which syncs only when a provider is detected (currently pi-todos: detected when its todo directory exists — `<cwd>/.pi/todos` by default, or wherever `PI_TODO_PATH` redirects it when set). The repo-implied `<cwd>/.pi/todos` must realpath to a location inside the project or the provider reads as absent and never writes, so a symlink committed into a hostile repo cannot redirect todo writes out of it; an explicitly set `PI_TODO_PATH` is the user's own choice and is honored verbatim, including outside the project. The mirror is additive — the progress widget is unaffected either way — and sync is one-way, so provider-side edits never feed back into plan execution. Can also be set via `~/.hypermark/config.json` (`{ "todoProvider": "off" }`); the env var takes precedence. |
| `JINA_API_KEY` | Optional Jina Reader API key for higher rate limits (500 RPM vs 20 RPM unauthenticated). Free keys include 10M tokens. |
| `HYPERMARK_DATA_DIR` | Override the base data directory. Supports `~` expansion. Default: `~/.hypermark`. When unset, an existing `~/.hypermark` always wins (so an install never relocates itself); if it does not exist and `$XDG_DATA_HOME` is set to an absolute path, `$XDG_DATA_HOME/hypermark` is used; otherwise `~/.hypermark` (the XDG spec's implicit `~/.local/share` default is deliberately not applied). All data (plans, history, drafts, config, hooks, sessions, debug logs, IPC registry) is stored under this directory. **A fresh root (spec 06, decision D5):** `~/.plannotator` is never read, copied, moved, merged, symlinked or deleted, so an existing Plannotator install keeps its data exactly where it is. Bringing it across would be an explicit import, not a side effect of a rename. |
| `HYPERMARK_FILE_BROWSER_MAX_FILES` | File-discovery limit: regular files inspected by CLI markdown/folder resolution and startup code-file warming, supported files returned by the file browser, and directories scanned during multi-repo workspace discovery (symlinks may point outside the workspace, so the budget — not the root — bounds that walk). Must be a positive integer; invalid, zero, or negative values use the default of `5000`. |
| `HYPERMARK_GLIMPSE` | Set to `0` / `false` to disable the Glimpse native window even when `glimpseui` is installed. Default: enabled. Can also be set via `~/.hypermark/config.json` (`{ "glimpse": false }`). |
| `HYPERMARK_GLIMPSE_WIDTH` | Width in pixels for the Glimpse native window. Default: `1280`. |
| `HYPERMARK_GLIMPSE_HEIGHT` | Height in pixels for the Glimpse native window. Default: `900`. |
| `HYPERMARK_VERIFY_ATTESTATION` | **Read by the install scripts only**, not by the runtime binary. Set to `1` / `true` to have `scripts/install.sh` / `install.ps1` / `install.cmd` run `gh attestation verify` on every install. Off by default. Can also be set persistently via `~/.hypermark/config.json` (`{ "verifyAttestation": true }`) or per-invocation via `--verify-attestation`. Requires the `gh` CLI, but not a login: the attestation bundle is fetched from GitHub's public attestations API (single unauthenticated attempt, never retried; the endpoint allows 60 requests/hour per IP) and verified with `--bundle`; the extraction needs one JSON tool on PATH (node, python3, or jq). gh's authenticated fetch is the fallback whenever the bundle path is unavailable or does not complete (missing extractor, fetch failure, or a gh that cannot verify the fetched bundle, e.g. an older gh without `--bundle`). Verification still needs network on every run because the Sigstore TUF trust root is fetched per-run; that failure is reported as connectivity, distinct from a real provenance failure, and both fail closed. |
| `HYPERMARK_SKIP_SKILLS_INSTALL` | **Read by the install scripts only.** Set to `1` / `true` to skip the skills/slash-command sparse checkout entirely — no `git clone` of the release tag, so nothing is written to any skill or command scope (`~/.claude/skills`, `~/.agents/skills`), the extras are not offered, and the skill-scope cleanup sweeps stay suspended (skip means do-not-write, never remove). The binary, sem sidecar, agent-terminal runtime, hooks, and per-agent config still install, and git stops being a hard requirement. The installer reports `Skills: skipped (...)` and the closing banner stops claiming the `/hypermark-*` commands are ready. Unlike the per-agent opt-outs this is not one agent's home — it covers every scope the checkout writes. Config key: `skipInstall.skills`; flags: `--skip-skills` (bash/cmd), `-SkipSkills` (PowerShell); precedence is flag > env var > config. Used by the `install-script-smoke` CI job, which installs a synthetic `v9.9.9` whose tag has no GitHub counterpart. Off by default. |
| `HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL` | Set to `1` / `true` to skip installing the managed Node/WebTUI runtime used by compiled Bun builds for the annotate-mode agent terminal. Read by `hypermark install-runtime agent-terminal`, which the installers call automatically. |
| `HYPERMARK_MINIMAL` | **Read by the install scripts only**, not by the runtime binary. Set to `1` / `true` / `yes` to have `scripts/install.sh` / `install.ps1` / `install.cmd` install **only** the `hypermark` binary, skipping the sem sidecar, the agent-terminal runtime, all per-agent skills, hooks, slash commands, and config, and the CallDiff runtime even when its opt-in is set. Equivalent to the `--minimal` (aliased to `--binary-only`) flag; `--no-minimal` overrides it. Off by default. |
| `HYPERMARK_SKIP_SEM_INSTALL` | **Read by the install scripts only.** Set to `1` / `true` to skip installing the optional `sem` semantic-diff sidecar (used by code review). Off by default. |
| `HYPERMARK_INSTALL_CALLDIFF` | **Read by the install scripts only.** Set to `1` / `true` / `yes` to ALSO install the optional pinned, pruned CallDiff core used by code review's Call Flow analysis (about 5 MB on macOS arm64, Node.js 22+). The runtime is strictly opt-in and is NOT installed by default. The normal path is in-app: enabling Call flow consents to one background install of core plus exactly the language packs required by the current changed files; later missing languages install automatically under the same consent, while the Languages list supports install-ahead. Each target gets one automatic attempt per review session; a failed target then requires an explicit Retry in that session. Equivalent to `--with-call-flow` (PowerShell: `-WithCallFlow`) or `{ "installCallFlow": true }` in `~/.hypermark/config.json`; precedence is flag > env var > config. `--minimal` always excludes it. Off by default. |
| `HYPERMARK_CALLDIFF_PATH` | Development override for a built CallDiff `0.4.1` package root containing `dist/run.js`; the exact pinned Tree-sitter core and any desired optional grammars must already exist under its `node_modules`. Managed language-pack installation is disabled for overrides. Normal installs use the selective managed core and grammar cache under the Hypermark data directory. |

**Config-only settings (`~/.hypermark/config.json`)**: Some settings have no env-var equivalent and are toggled by editing the config file directly:

- `markdownExtensions` (array of strings, default none) — extra file extensions the **annotate** path treats as markdown, e.g. `{ "markdownExtensions": [".livemd"] }` for Livebook notebooks (#1307). A listed extension is accepted everywhere `.md` is on that path: CLI target resolution (`hypermark annotate notes.livemd`), folder discovery and the file browser, `/api/doc` plus relative and wiki-link navigation between sibling docs, the 2MB `MAX_ANNOTATABLE_FILE_BYTES` cap, and per-file version history. Listed extensions render as **markdown** (frontmatter stripped), never as raw HTML, and they only widen the set: nothing built in is removed. Entries must start with a dot and be free of path separators, globs, and whitespace (`".livemd"`, not `"livemd"` or `"*.livemd"`); invalid entries are dropped silently, built-in extensions are deduplicated, and the dotenv family can never be registered: `.env` itself plus any entry ending in `.env` or starting with `.env.` (such as `.prod.env` or `.env.local`) is denied, because annotate copies file contents into the data dir (the same reason `.env` is excluded from the built-in set). The value is read from `config.json` once per process. Predicates stay pure in `packages/core/annotatable.ts`, which is browser-safe and cannot read config; the node-side resolver that threads the normalized list into them is `packages/shared/markdown-extensions.ts`, and the annotate `/api/plan` payload ships the same list to the renderer so it can linkify links to sibling documents. Not applied to Edit Mode source save (`SOURCE_SAVE_FILE_REGEX` in `packages/core/source-save.ts`), which keep their own narrower allowlists.
- `agentTerminalSide` (`"left"` / `"right"` / `"hidden"`, default `"left"`): which edge the **annotate-mode** Agent TUI docks against, or `"hidden"` to keep it out of the layout entirely (#1050). Type and guard live in `packages/core/agent-terminal.ts:63-83`, the config declaration in `packages/shared/config.ts:116`. Unrecognized values are silently ignored rather than warned about: `getServerConfig()` omits the key behind `isAgentTerminalSide` (`packages/shared/config.ts:374`) and `resolveAnnotateAgentTerminalSide` independently falls back to `"left"` (`packages/core/agent-terminal.ts:90-94`). `"hidden"` is a default, not a lock: the terminal can still be opened for the session from the sidebar rail, the Shift-Shift shortcut, or a message routed to the agent, none of which rewrite the preference, and an opened `"hidden"` terminal docks left (`packages/core/agent-terminal.ts:101-105`). Settings is the only way back from `"hidden"`. Two UI surfaces write the key (the terminal's own Display popover Position control and Settings → General → "Agent TUI Position"), and the Display popover's reset button restores `"left"`. The side only decides where the terminal docks when opened; it never auto-opens (`packages/editor/App.tsx:523`), it is not rendered below 1024px or in wide mode (`packages/editor/agentTerminalLayout.ts:14`, `:73`), and `"right"` visually displaces the annotations/AI right panel while preserving its state (`packages/editor/agentTerminalLayout.ts:53-57`).
- `agentTerminalDefaultAgent` (string agent id, e.g. `"claude"`, default `""` meaning no recorded choice): which agent the annotate-mode Agent TUI preselects when the panel opens (#1050). Validation is `typeof === "string"` only, with no enum and no check against installed agents, so an unknown or currently unavailable id is inert rather than an error: `resolveAnnotateAgentId` uses the saved id only when it appears among the available agents and otherwise takes the first available one (`packages/ui/utils/annotateAgentTerminal.ts:45-54`). It is written only by the "save as default" checkbox in the terminal's agent picker (`packages/editor/components/AnnotateAgentTerminalPanel.tsx:257`); there is no Settings control for it. An empty string deletes the cookie and reads as unset, though the server allowlist will still write `""` into `config.json`, where it is then ignored.
- Precedence for both agent-terminal keys follows the settings registry (`packages/ui/config/settings.ts`) and its resolver (`packages/ui/config/configStore.ts:3-5`): **server config file > cookie > built-in default**. `config.json` is the durable, cross-browser store; the cookie (`hypermark-annotate-agent-terminal-side`, `hypermark-annotate-agent-terminal-default`) is the browser-local fallback. There is no one-time cookie-to-config migration: those two cookie names were deliberately kept unchanged so a pre-registry cookie stays readable, and its value only reaches `config.json` if the user changes the setting again. The sync runs one direction at startup, with `init()` stamping a valid config value back into the cookie (`packages/ui/config/configStore.ts:157-161`). Neither key has an env-var equivalent, and only the annotate servers allowlist them on `POST /api/config` (`packages/server/annotate.ts:726-727`), so setting them has no effect on plan or review sessions.
- `pfmReminder` (`true` / `false`, default `false`) — when enabled, a Hypermark Flavored Markdown reminder is injected at plan-time describing the renderer's extensions (code-file links, callouts, tables, diagrams, task lists, hex swatches, wiki-links). Lets the planning agent enrich plans with PFM features without having to discover them. Composes cleanly with the compound-skill improvement hook. Delivered by the `improve-context` PreToolUse hook in `apps/hook/server/index.ts`.

**Every session is local.** The server binds loopback and advertises `localhost`; there is no remote (SSH/devcontainer) mode and no tailnet publication. Set `HYPERMARK_PORT` to pin the port for forwarding.

## Plan Review Flow

```
Claude calls ExitPlanMode
        ↓
PermissionRequest hook fires
        ↓
Bun server reads plan from stdin JSON (tool_input.plan)
        ↓
Server starts on random port, opens browser
        ↓
User reviews plan, optionally adds annotations
        ↓
Approve → stdout: {"hookSpecificOutput":{"decision":{"behavior":"allow"}}}
Deny    → stdout: {"hookSpecificOutput":{"decision":{"behavior":"deny","message":"..."}}}
```

## Code Review Flow

```
User runs /hypermark-review command
        ↓
Claude Code: hypermark review subcommand runs
        ↓
VCS provider captures local changes (Git, GitButler, JJ, or P4 where supported). When review runs from a
non-VCS parent that contains nested Git/JJ/GitButler repos, child diffs are combined with
folder-prefixed paths.
        ↓
Review server starts, opens browser with diff viewer
        ↓
User annotates code, provides feedback
        ↓
Send Feedback → feedback sent to agent session
Approve → approved prompt sent to agent session (with the note/annotations when approving with notes)
```

### Review header decision control (agent mode)

The agent-destination review header uses the same adaptive split control the annotate surfaces
adopted: a ghost-X Close plus `DecisionControl` (`packages/ui/components/DecisionControl.tsx`)
rendered from the pure `buildDecisionSpec` mapping — `Approve` with no annotations,
`Send Feedback · n` otherwise, with `Request changes…` / `Send with a note…` and the explicit
`Approve, discard n annotations…` confirm behind the caret. One `submitPrimaryDecision()`
callback serves the header primary, the global `Mod+Enter` handler, and the compact primary row.
Transport routing is pure in `packages/review-editor/reviewDecision.ts` and single-endpoint:
every decision POSTs `/api/feedback` with `approved` as the only fork; a change-request note
becomes a `scope:'general'` `CodeAnnotation` (sentinel `filePath ''`/0/0, riding the export's
`## General` section) with a one-render deferred submit — zero server change. Approve-carrying
menu items (`Approve with notes`, `Approve with a note…`) are capability-gated on the
server-sent `approvalNotesSupported` advert, which rides every diff payload (`/api/diff`,
`/api/diff/switch`, `/api/pr-diff-scope`, `/api/pr-switch`) and reads as false
when absent, so an old server renders no approve-carrying items. A capable
session's approvals post `buildReviewApprovalBody`: bare approve
sends `feedback: ''` (the old `'LGTM - no changes requested.'` placeholder is gone — a bare
approval now archives as `lgtm` with no sidecar), "Approve with a note…" sends the note as the
feedback, and "Approve with notes" sends the live annotations plus their export (a note, if
both are ever present, is folded in ahead of the export — never dropped). The CLI emits approvals through
the shared `composeReviewApprovedMessage` (`packages/shared/prompts.ts`):
a bare approval is the plain approved prompt; an approval carrying feedback uses the
approved-with-notes framing (`prompts.review.approvedWithNotes`, default
`DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT` — "non-blocking guidance, do not revise or
reopen"), because the bare prompt plus a change-request-shaped export would read as a
contradiction. The legacy placeholder is filtered there so a stale built client cannot get
filler framed as guidance. The standalone dev server (`apps/review/server`) is the exception:
it emits the raw decision JSON with the feedback unfiltered and does not route through the
composer. Compact/touch rows are generated from the same spec, so a visible positive decision
exists in every state; composer rows open `DecisionNoteDialog`. Platform (PR) mode renders the
same ghost-X + `DecisionControl` shape from `buildDecisionSpec`'s platform arm, with **no
composer items ever**: every menu action opens the existing `ReviewSubmissionDialog` (per-target
state, retry, "leave PR open" toggle — whose general-comment textarea is the only note field on
that side), and the self-approval mute is preserved — muted primary/items with the "You can't
approve your own {PR/MR}" reason, `Request changes…` / `Post comments, then…` always live.

Interaction-model changes worth knowing (F8 and siblings): the agent-mode `Approve` primary
follows the `FeedbackButton` responsive pattern and is **icon-only below the `lg` breakpoint**,
where the old `ApproveButton` showed a compact `OK` label — the `title` carries the accessible
name, and compact/touch rows keep full labels. Approving despite annotations is now two clicks
(caret → `Approve, discard n annotations…` → `Discard & approve`) instead of the old dimmed
one-click Approve with its warning dialog, and `Mod+Enter` never stacks with the removed
approve-warning dialog — an open confirm dialog owns `Mod+Enter` outright (the
`data-hypermark-confirm-dialog` sentinel guard in the app's keydown effect; without it one
keystroke over the discard confirm would post two contradictory decisions). Accepted edge: the
compact `DecisionNoteDialog` keeps its draft locally and discards it if the item behind it leaves
the live spec (the dialog closes), while the desktop popover composer keeps drafts keyed by item
id — an intentional asymmetry, not a bug.

The review sidebar carries the durable human producer for review-level comments:
**"+ General comment"** renders in the Annotations tab's General section header (even with zero
general comments) AND in the all-empty state, opening the shared `DecisionNoteField` in a small
anchored popover whose width clamps to the resizable panel (200-600px persisted) so it never
clips inside the sidebar's `overflow-x: hidden` scroll area. Composer state (open + draft) lives
in `ReviewSidebar`, shared by both placements: the draft survives a dismissal, a placement flip
(an external annotation arriving mid-sentence moves the button from the empty state to the
section header), and a tab switch; collapsing the sidebar discards it. The producer is
deliberately present in platform (PR) mode too — a session-level comment there rides the posted
review body through the pre-existing `scope:'general'` handling in `buildFileScopedBody` /
`ReviewSubmissionDialog`. Unlike the header composer's submit note (one-submit lifetime), a sidebar
general comment goes through `addCodeAnnotationsWithHistory` — undoable, draft-persisted,
deletable — and both producers share one shape factory, `createGeneralReviewComment` in
`reviewDecision.ts`: `scope:'general'`, sentinel `filePath ''`/0/0, `review-note-` UUID id, and
deliberately **no PR context**, so the comment passes every PR scope predicate and survives an
in-place PR switch. Creating one raises `totalAnnotationCount`, which is what flips the header
control to `Send Feedback · n` — the control is state-driven, not wired to the button. The
feedback archive records each annotation's `scope` (additive `scope?: string` in
`packages/shared/feedback-archive.ts`'s normalizer, vendored to Pi), so a review-level general
comment stays distinguishable from a line comment in `index.jsonl`.

### Since-main default review view

The default code-review diff is **`since-base`** — a composite of `merge-base(base, HEAD)` vs the working tree plus untracked files ("everything a PR would show if you committed and pushed now"). It can render as a three-section **git status** panel (Committed / Changes / Untracked) via `SectionsPanel`, with a `Tree | Git status | Commits` toggle (`PanelViewToggle`). The Commits segment (git-local sessions only) is a linear `--first-parent` history rail (`CommitsPanel`): clicking a commit opens its own diff (`commit:<sha>`, vs its first parent) as the all-files view headed by the commit message rendered as markdown. The Commits view is a self-contained detour: entering it memoizes the previously active diff, exiting to Tree restores that diff verbatim (exiting to Git status resets to `since-base` as always), the memo clears whenever any non-commit diff is applied, and a reload that serves a commit-family diff with a non-Commits panel view snaps once to the session default so the commit diff cannot outlive the visit. The toggle never writes the persisted `reviewPanelView`/`defaultDiffType` pair (no server writes from a toggle click), but it does record a cookie-only last-used memo (`reviewPanelViewLastUsed`, `sections` | `tree` — never `commits`; the Commits view is session-only). A review OPENS on session choice ?? last-used memo ?? persisted `reviewPanelView` (cookie-only, written only by Settings and `ReviewSetupDialog` through `setReviewPanelView()`, which also syncs the memo so an explicit choice is never shadowed by a stale one — except the App self-heal, which passes `recordLastUsed: false` to repair the diff half of a conflicted pair without touching the memo). The first-run initializer marks review-setup-seen when it seeds the cookie-only Tree choice, not only on dismiss, so it is genuinely one-time per browser and cannot overwrite a returning reviewer's persisted or last-used view; it inherits the resolved `defaultDiffType` without a server config write. The persisted pair is coupled: the Sections view only renders `since-base`, so choosing a classic diff default snaps the persisted view to Tree and vice-versa (enforced in `ReviewSetupDialog`, the Settings Git tab, and the App first-run initializer).

**Staging display invariant:** `useGitAdd`'s `stagedFiles` is the EFFECTIVE staged set (sections-sidecar snapshot + session stage/unstage overrides) and is the only source any surface may render staging state from. The sidecar entry's `staged` flag is a snapshot — ORing it back in makes files unstaged mid-session render as staged (and inverts the next toggle).

`since-base` is only offered when the base ref actually resolves — on a repo whose trunk isn't discoverable (`trunk`, no `origin/HEAD`) `getGitContext` omits it and the default falls through to `uncommitted`, so committed branch work is never silently hidden. The since-base patch/sections/fingerprint/file-content paths all degrade to `HEAD` together when merge-base fails for a resolvable-but-unrelated base. First-run shows `ReviewSetupDialog` (replaces the removed `DiffTypeSetupDialog`), which initializes an unseen reviewer's panel to Tree once while preserving the resolved diff default, and is reopenable from the review header menu. The one-time dialog chain is guide intro → look-and-feel → review setup → Edit Mode → token hover cards; none of the dialogs stack. The token hover announcement is last and additionally skips a session where hover cards cannot run at all (no live workspace), WITHOUT consuming its cookie, and never shows to a reviewer whose trigger is already non-default (which after the boolean-to-trigger migration is exactly the early adopter who turned cards off). Analysis layers no longer add a startup dialog: Semantic Changes retains its enabled default, while Call Flow remains disabled until the user explicitly enables it in Settings, which is also consent for its managed runtime installation.

### GitButler review invariants

GitButler is a distinct VCS provider, ordered after JJ and before Git. It is selected only while symbolic `HEAD` is `refs/heads/gitbutler/workspace` (or legacy `gitbutler/integration`) and the repository has GitButler's local target-ref configuration; a leftover database or an ordinary branch with the reserved name is not detection. An active workspace requires `but >= 0.21.0` on `PATH`, and a missing/incompatible CLI is an explicit error rather than a fallback to ordinary Git staging against the synthetic workspace commit. `--gitbutler` forces this provider; `--git` remains the escape hatch.

The default `gitbutler:workspace` view is GitButler's reported merge base versus the working tree plus untracked files, so it includes every applied committed change and assigned/unassigned worktree change. Multi-branch stack views are committed-only merge-base→stack-tip Git diffs; branch views are committed-only first-parent segment diffs. Client IDs encode branch-name anchors, never GitButler's transient CLI IDs. Do not concatenate independent GitButler hunks: their bases can differ. Assigned worktree hunks stay in Workspace until GitButler exposes an authoritative combined stack diff.

GitButler assignment is not the Git index, so the provider never opts into stage/unstage. Git-status sections, commit history, remote-base discovery/fetch, and the first-run Git setup remain `vcsType: "git"` only. File expansion uses the exact object range for committed views and merge-base/working-tree pair for Workspace; fingerprints cover the visible Git content plus canonical stack/branch topology. Nested multi-repo mode maps only `workspace-current` to GitButler; staged/unstaged/last modes are unavailable when a GitButler child is present.

## Annotate Flow

```
User runs /hypermark-annotate <file.md | file.html | https://... | folder/>
        ↓
Claude Code: hypermark annotate subcommand runs

        ↓
Input type detected:
  .md/.mdx/.txt → file read from disk
  plain-text config/data formats (.yaml .yml .json .jsonc .json5 .toml .ini .cfg .conf .properties .csv .tsv .log .xml .env.example)
             → read from disk, rendered as plain text exactly like .txt (.env itself is
               deliberately excluded — it commonly holds secrets and annotate history
               copies file contents; source-code extensions stay with code review)
             All single-file annotate reads and /api/doc document serves are capped at
             2MB (`MAX_ANNOTATABLE_FILE_BYTES` in `packages/core/annotatable.ts`) —
             larger files get a clear "File too large to annotate (max 2MB)" error.
             Extra extensions listed in `markdownExtensions` (config-only setting,
             e.g. `.livemd`) join this set and render as markdown, frontmatter stripped.
  .html/.htm → file read, rendered as raw HTML by default (or converted to markdown with --markdown)
  https://   → fetched via Jina Reader (default) or fetch+Turndown (--no-jina)
  http://localhost:* (also 127.x and [::1])
             → LIVE app annotation by default when a quick probe returns HTML:
               the running app is mirrored through a loopback reverse proxy and
               annotated in place (see "Live app annotation" below). --static
               forces the classic conversion pipeline; --app forces live mode
               and fails loudly when it cannot apply.
  folder/    → file browser opened, files converted on demand
        ↓
Annotate server starts (reuses plan editor HTML with mode:"annotate")
        ↓
User annotates content, provides feedback
        ↓
Send Feedback → annotations sent to agent session
Done / Approve (gate) → positive decision recorded (see the decision control below)
```

### Annotate header decision control

Every annotate surface's header decision is one adaptive split control, `DecisionControl`
(`packages/ui/components/DecisionControl.tsx`), rendered from the pure `buildDecisionSpec`
state→spec mapping (`packages/ui/utils/decisionSpec.ts`) beside a ghost-X Close: `Done` (or
`Approve` in gate mode) with nothing to send, `Send Feedback · n` otherwise, with the alternate
decisions and the in-place note composer behind the caret. One `submitPrimaryDecision()` callback
serves the header primary, the global `Mod+Enter` handler, and the compact primary row, so
keyboard and header can never disagree. Transport routing is pure in
`packages/editor/annotateDecision.ts`: `Done` and every note post `/api/feedback` (a note becomes
a `GLOBAL_COMMENT` at submit time with a one-render deferred submit — zero server change), so
`formatAnnotateOutcome` shapes and strict-gate exit codes are byte-identical to the old
keyboard-only zero submit; only gate-mode approvals reach `/api/approve`. The non-gated empty
menu carries a single composer, "Send a note…" (maintainer ruling: the old "Done with a note…" /
"Request changes…" pair differed only by framing on the same transport and was collapsed into
one item); the approval-framing sentence (`buildCompleteAnnotateFeedback`'s `approvalFraming`)
now serves only the non-gated discard path, and the only confirm left is the
explicit `Done/Approve, discard n annotations…` menu item (plus the pre-existing
close-with-content warning). Compact/touch rows are generated from the same spec, so a visible
positive decision exists in every state; composer rows open `DecisionNoteDialog`. The header flip
predicate is `hasFeedbackToSend`, so feedback already delivered through the agent terminal shows
the positive primary rather than a stale Send Feedback.

### Tolerant argument resolution

Slash-command hosts forward raw user words to `hypermark annotate` verbatim (on Claude Code through a bash-substitution prefix that runs before the model sees anything), so non-strict invocations resolve their arguments in three tiers. The shared logic lives in `packages/shared/annotate-target.ts` and is wired into the CLI's annotate branch:

1. A single-token invocation runs the classic pipeline unchanged: a bare correct path behaves exactly as before, and a lone typo'd path still fails with `File not found` and exit `1`.
2. With several tokens, each token is probed; exactly one naming an existing file, URL, or folder proceeds with it (`annotate look at notes.md please` opens `notes.md`). Two or more resolving tokens error naming every candidate rather than guessing, which also means `annotate a.md b.md` (previously: silently opened `a.md`, ignoring `b.md`) is now that error. Bare directory names only count as targets when they are the sole argument, so a stray word matching a directory (or `.`) cannot hijack the fast path; unrecognized dash-prefixed tokens disable the tolerance entirely so a typo'd flag (`--no-jna`) errors the way it always did instead of being silently skipped.
3. When nothing resolves, the CLI emits an agent-addressed handoff that echoes the words tried and asks the reading agent to re-run with a concrete target (content flags such as `--markdown` / `--no-jina` / `--render-html` are echoed for the re-run; transport flags are not). In plain mode the handoff goes to **stdout with exit `0`**, because a non-zero exit from a Claude Code bang-prefix skill aborts the prompt before the model sees any output; with `--json` / `--hook` it goes to stderr with exit `1` so machine-readable stdout stays reserved for decision records.

Strict invocations (`--require-approval` / `--result-file`) bypass all three tiers: `args[1]` is the target and a typo'd path stays a startup failure with exit `2`.

The bang prefix in the Claude Code skill is deliberate: #872 (commit `aac5aacb`, "restore `/plannotator-*` bash execution on Claude Code") put it back so the slash command never depends on the model choosing to run the binary. Argument-shape problems belong here in the CLI's resolution, not in the skill templates.

### Strict direct annotate results

Direct `hypermark annotate` invocations may add `--require-approval` and/or `--result-file <path>` only with `--gate --json`; both reject `--hook`. When neither strict option is present, single-target invocations keep the legacy plaintext, JSON, hook, and exit behavior unchanged; multi-token invocations go through the tolerant tiers described under "Tolerant argument resolution" above.

Strict decisions use one newline-terminated JSON record on stdout and, when requested, identical bytes in the result file. Exit codes follow the grep convention: approval exits `0`; with `--require-approval`, annotated and dismissed decisions are published before exiting `1` (negative human outcome); usage/startup/validation failures — bad flag combinations, strict flags outside `annotate --gate --json`, a missing `--result-file` parent, a pre-existing or dangling-symlink destination, and every annotate startup failure (missing path, unreachable URL, empty folder, ambiguous name, missing file, oversized file) — exit `2` (the gate itself was misconfigured or could not start). Those startup sites exit `1` as before for non-strict invocations, with one deliberate exception: the multi-token zero-resolve handoff is not a startup failure, so in plain non-strict mode it prints on stdout and exits `0` (under `--json`/`--hook` it stays stderr + exit `1`). Under a strict flag `1` is reserved for "the reviewer did not approve", so a typo'd path must never masquerade as a rejection. Post-decision publication failures (destination appears between validation and publish, hard links unavailable) also exit `2`: the result *file* was not published, so they present as environment errors — "the gate could not publish its result" — never as a reviewer outcome, and never as approval (still fail-closed, since only `0` means approved). The stdout decision record is written **before** result-file publication and is still emitted whenever the decision itself completed; only a stdout write failure leaves no record anywhere. Signal deaths keep `128+n`. Result paths resolve from the invocation working directory, require an existing parent and absent destination, and publish via a flushed/closed `0600` same-directory temporary file plus an atomic no-clobber hard link—never copy or overwrite fallback (the `0600` mode is a no-op on Windows, and the atomic link/rename is not followed by a parent-directory fsync, so publication is atomic but not crash-durable). Keep reviewed sources at stable project paths; unique result and diagnostic log files may use a narrow temporary directory. Explicit Close emits `dismissed`; missing results or process/browser failures are recovery cases, never approval.

### Abandoned strict gate sessions

Local direct structured gates (`--gate --json`, not `--hook`) advertise a client lease in `/api/plan` and serve `/api/annotate/client-lease` (SSE, `ANNOTATE_CLIENT_LEASE_STREAM_PATH`). Each open stream is one connected review surface; the server heartbeats every 5s and, once at least one client has connected, starts a 30s reconnect grace when the last one disconnects. A reconnect inside the grace continues the same review; expiry resolves the gate as the same `dismissed` decision an explicit Close produces, except that it keeps the saved annotation draft so an abandoned review can still be recovered. Approve, feedback, explicit exit, and server stop all cancel a pending expiry. Whichever producer settles the session first wins: every one of them (each connected surface and the expiry itself) goes through a single one-shot settlement, so a decision arriving after the session already resolved is rejected with `409` rather than deleting the draft and reporting success for an outcome the caller never received. Page lifecycle events are deliberately not used: `pagehide`/`beforeunload` also fire on reload and navigation, so they cannot distinguish abandonment from a reconnect. A session that never receives its first client never auto-dismisses, so browser-launch failures still need a caller-side timeout.

### Live app annotation (annotate-app)

Live local app annotation. `hypermark annotate http://localhost:5173` probes the loopback URL (3s timeout, `accept: text/html`) and, when the probe returns an HTML page, starts server mode `"annotate-app"` instead of converting the page: a dedicated loopback reverse proxy mirrors the whole dev-server origin on its own `127.0.0.1` port, injects `<script src="/__hypermark__/bridge.js">` into every HTML response (streaming, exactly once per document), and passes WebSockets through so HMR keeps working. Every proxy DECISION — the injector state machine, loopback/Host/Origin predicates, CSP/X-Frame-Options policy, redirect rewrite, WS origin gate, bridge assembly, `liveAppDraftIdentity` — lives once in `packages/shared/live-proxy-core.ts`; `packages/server/live-proxy.ts` is the Bun transport over it. The probe itself (timeout, `< 500` status gate, final-response redirect rule) and every user-facing live-mode message are shared too, in `packages/shared/live-probe.ts`. The editor renders the proxied app full-viewport in an unsandboxed iframe and drives the same pinpoint annotation experience the srcdoc surface provides. `--static` forces the classic conversion; `--app` forces live and errors loudly wherever it cannot apply: non-loopback, https, unreachable, non-HTML, off-origin-redirecting, and non-URL (file/folder) targets. "Loopback" means `localhost`, `::1`, or a LITERAL IPv4 address in 127.0.0.0/8 (`isLoopbackHostname` in `live-proxy-core.ts`, the single source of truth); DNS names like `127.0.0.1.evil.example` are not loopback. Live eligibility is judged on the probe's FINAL response after redirects: a target that 302s off its own loopback origin (auth portal, tunnel splash, another local port) falls back to the static pipeline instead of opening a dead live surface, while same-server redirects stay live-eligible.

The advertised `appUrl` is the proxy under its LOCALHOST spelling with the target URL's own path and query (`http://localhost:<B>/admin?tab=2`): localhost keeps the framed app same-site with the editor page and shares the dev app's host-only localhost cookies and storage, which a `127.0.0.1` spelling would not (Safari ITP would then block all cookies in the cross-site iframe). The proxy still BINDS the `127.0.0.1` literal; browsers that resolve localhost to `::1` first fall back to IPv4 on the refused loopback connect.

**Runtime coverage:** the feature ships on the Bun server + Claude Code CLI path. `hypermark annotate http://localhost:5173` probes live-first through the shared `live-probe` module and recognizes `--app`/`--static` in `apps/hook/server/annotate-resolution.ts`.

**Session shape:** the surface opens with pinpoint **armed**, and it is comment-only; the full interaction contract it shares with raw-HTML sessions is documented once under "## Annotation System" below. Two things are specific to live mode: vim navigation is off outright (`vimModeEnabled={liveApp ? false : ...}`, `packages/editor/App.tsx:5484`), because its keyboard cursor writes into the app's own DOM, and the viewer's floating input-method switch is not offered. Text drag-selection commenting is NOT disabled: it stays live in both the armed and Interact states, exactly as on raw HTML. Multi-page sessions are supported in one server session: annotations carry `pageUrl` (pathname + search, capped at 2048), restore filters to the current page, the export groups feedback under per-page headings while numbering stays global, and the bridge reports SPA navigations via a coalesced `page-change` message. Version history, durable submission records, URL sharing, portable HTML export, Obsidian/Bear save, and the annotate agent terminal are all off, exactly like URL sessions. Drafts, feedback, approve, gates, and the client lease work unchanged.

**Security posture:** the proxy binds `127.0.0.1` unconditionally and validates the `Host` header before touching upstream (DNS-rebinding blunting). WebSocket upgrades whose browser `Origin` header is present and does not name the proxy itself are refused before any upstream contact, so a hostile page's cross-site WS connect is never laundered into the origin-less shape dev servers trust as a non-browser client (Vite CVE-2025-24010 class); header-less non-browser clients pass. App CSP on HTML responses is dropped and replaced with a `frame-ancestors` policy listing exactly the editor origins (amending an arbitrary CSP for an injected script is unpredictable; dev servers rarely ship one; `<meta http-equiv>` CSP is a documented non-goal); `X-Frame-Options` is stripped only on those same HTML responses, so non-HTML responses keep whatever framing protection the app shipped. `/__hypermark__/bridge.js` embeds the per-session token, so its delivery refuses `Sec-Fetch-Site` values other than `same-origin`/`none` (defense in depth against off-origin `<script src>` token reads; header-less clients pass). Upstream redirect `Location`s are re-anchored onto the proxy by loopback-host-plus-port equivalence, never by string prefix. The injected bridge authenticates both message directions with a per-session token plus origin checks, and posts each outbound message once per listed editor origin (the browser delivers only the one matching the parent document, so an editor opened at `127.0.0.1` works too); the parent side keeps every existing size cap. The proxy bind is the `127.0.0.1` literal unconditionally, asserted at source level by its test suite.

**Live restore resilience:** a `find-and-mark` that resolves nothing in live mode keeps its record, seeded with unresolved placeholder targets from the durable anchor/text params, so the mutation-driven reconcile re-acquires the pin once a lazy route or data-dependent tree finishes rendering. Srcdoc restores keep the old fail-closed drop (a static document would never re-resolve).

**Known limitations (documented, not bugs):** hardcoded absolute origins in the app, origin-pinned CORS to secondary APIs, and OAuth `redirect_uri` flows land outside the proxy; frame-busting apps break the wrapper; content-encoded HTML that survives the encoding strip renders without the bridge; cross-page annotation clicks do not navigate; a redirect to a DIFFERENT loopback service (another port) is passed through un-rewritten and the iframe leaves the proxy, which is why the probe refuses such targets up front. Manual smoke loop: `scripts/live-annotate-smoke.sh` (not CI).

## Archive Flow

```
User runs hypermark archive (CLI)
        ↓
Server starts in mode:"archive", reads ~/.hypermark/plans/
        ↓
Browser opens read-only archive viewer
        ↓
User browses saved plan decisions with approved/denied badges
        ↓
Done → POST /api/done closes the browser
```

During normal plan review, an Archive sidebar tab provides the same browsing via linked doc overlay without leaving the current session.

## Server API

### Plan Server (`packages/server/index.ts`)

| Endpoint              | Method | Purpose                                    |
| --------------------- | ------ | ------------------------------------------ |
| `/api/plan`           | GET    | Returns `{ plan, origin, previousPlan, versionInfo }` (plan mode) or `{ plan, origin, mode: "archive", archivePlans }` (archive mode) |
| `/api/plan/version`   | GET    | Fetch specific version (`?v=N`)            |
| `/api/plan/versions`  | GET    | List all versions of current plan          |
| `/api/archive/plans`  | GET    | List archived plan decisions (`?customPath=`) |
| `/api/archive/plan`   | GET    | Fetch archived plan content (`?filename=&customPath=`) |
| `/api/done`           | POST   | Close archive browser (archive mode only)  |
| `/api/approve`        | POST   | Approve plan (body: planSave, obsidian, bear, feedback) |
| `/api/deny`           | POST   | Deny plan (body: feedback, planSave)       |
| `/api/save-notes`     | POST   | Save to external note apps (Obsidian, Bear, Octarine) |
| `/api/image`          | GET    | Serve image by path query param            |
| `/api/upload`         | POST   | Upload image, returns `{ path, originalName }` |
| `/api/obsidian/vaults`| GET    | Detect available Obsidian vaults           |
| `/api/skills`         | GET    | List global agent skills for comment skill references (`{ skills: [{ name, root, description?, humanOnly, dir }] }`) |
| `/api/skills/content` | GET    | SKILL.md contents of one discovered skill for human-only feedback injection (`?name=<skill>`) returns `{ skill: { name, dir, path, content, truncated, humanOnly } }`; the name is matched against discovery only, never used as a path |
| `/api/reference/obsidian/files` | GET | List vault markdown files as nested tree (`?vaultPath=<path>`) |
| `/api/reference/obsidian/doc`   | GET | Read a vault markdown file (`?vaultPath=<path>&path=<file>`) |
| `/api/plan/vscode-diff` | POST   | Open diff in VS Code (body: baseVersion)   |
| `/api/doc`              | GET    | Serve linked .md/.mdx file (`?path=<path>`) |
| `/api/doc/exists`       | POST   | Batch-validate code-file paths (body: `{ paths: string[], base?: string }`) returns `{ results: { [path]: { status: "found"\|"ambiguous"\|"missing"\|"unavailable", … } } }` |
| `/api/draft`          | GET/POST/DELETE | Auto-save annotation drafts to survive server crashes |
| `/api/external-annotations/stream` | GET | SSE stream for real-time external annotations |
| `/api/external-annotations` | GET | Snapshot of external annotations (polling fallback, `?since=N` for version gating) |
| `/api/external-annotations` | POST | Add external annotations (single or batch `{ annotations: [...] }`) |
| `/api/external-annotations` | PATCH | Update fields on a single annotation (`?id=`) |
| `/api/external-annotations` | DELETE | Remove by `?id=`, `?source=`, or clear all |
| `/api/agents` | GET | Detected agent CLIs available to the annotate-mode terminal (shared by plan + review, `packages/server/shared-handlers.ts`) |

### Review Server (`packages/server/review.ts`)

| Endpoint              | Method | Purpose                                    |
| --------------------- | ------ | ------------------------------------------ |
| `/api/diff`           | GET    | Returns `{ rawPatch, gitRef, snapshotId, origin, mode?, diffType, base, hideWhitespace, gitContext, agentCwd?, approvalNotesSupported, semanticDiff?, callFlow?, sections?, commitInfo?, generatedFiles?, baseBehindRemote? }`. `snapshotId` identifies this diff snapshot; the client echoes it on `/api/diff/fresh` probes (also returned by the switch/PR endpoints). `approvalNotesSupported` is the approve-with-notes capability advert (echoed on `/api/diff/switch`, `/api/pr-diff-scope`, and `/api/pr-switch` too, so it survives a diff switch); absent reads as false. `sections` is the since-base sidecar (Committed/Changes/Untracked partition); `commitInfo` is the commit-metadata sidecar (subject, markdown body, author + avatar) present only while a `commit:<sha>` diff is active; `generatedFiles` lists the repo-relative paths that count as generated, which the client collapses by default GitHub-style (presentation-only: the patch is never filtered). Two-layer detection (`packages/shared/generated-files.ts`): built-in name defaults (`DEFAULT_GENERATED_PATTERNS` — lockfiles like `bun.lock`/`package-lock.json`/`Cargo.lock`, plus `*.min.js`/`*.min.css`/`*.map`, matched against the path's last segment) apply in every mode with no git needed, and explicit `.gitattributes` `linguist-generated` refines them in BOTH directions via one batched `git check-attr --stdin` at the review cwd (set/true marks any file, unset/false un-marks even a built-in name, unspecified keeps the default). Attribute refinement runs for plain local Git sessions only — PR worktrees, workspace, jj, GitButler, P4, and piped patches get the name-based defaults alone; `baseBehindRemote` flags that the diff base is behind its remote tip. Workspace mode returns `mode: "workspace"` with folder-prefixed paths and no `gitContext`. |
| `/api/diff/switch`    | POST   | Switch diff type, base branch, or whitespace mode (body: `{ diffType, base?, hideWhitespace?, explicitBase? }` — `diffType` includes the `commit:<sha>` family). `explicitBase: true` marks a base the user picked from the picker — the server then honors it verbatim and permanently disables the bare-local-name → `origin/*` canonicalization for the session (echoed bases stay canonicalizable). Response includes `semanticDiff?`, `callFlow?`, `sections?`, `commitInfo?`, `generatedFiles?`, `baseBehindRemote?`, or `{ superseded: true }` when a newer concurrent switch has taken over (client ignores it). |
| `/api/commits`        | GET    | One page of the branch's linear `--first-parent` history for the Commits panel (`?limit=&before=`) → `{ commits, hasMore, base }`. Rows carry `isHead` / `isPastBase` (where the branch meets the active base) and best-effort author `avatarUrl`. Plain local git sessions only (PR/workspace/GitButler/jj/p4 → 400); computed against the active diff's cwd, so worktree sessions list the worktree's history. |
| `/api/diff/fresh`     | GET    | Cheap staleness probe: recomputes the VCS fingerprint captured with the current diff snapshot and returns `{ fresh, fingerprint?, baseBehindRemote?, agentCwd? }`. Accepts `?snapshot=<id>` — the client echoes the `snapshotId` it received with its diff, and a mismatch with the server's current snapshot reports stale PER CLIENT (covers the startup base upgrade and cross-tab switches even when the VCS fingerprint matches). `baseBehindRemote` is carried on every response (omitting it would flicker the "behind GitHub" banner); `agentCwd` re-advertises the PR checkout in PR mode. Unfingerprintable modes (e.g. P4) always report fresh to a matching snapshot. Polled by the UI's "Diff out of date · Refresh" notice. |
| `/api/fetch-base`     | POST   | Runs `git fetch` for the base's remote tracking ref, then re-queries the remote tip (fresh `ls-remote`) so narrow-refspec fetches report honestly. Backs the "Baseline is behind GitHub · Fetch" banner. Git-only, base-relative diff types only. |
| `/api/semantic-diff`  | GET    | Runs semantic diff for the active patch and returns parsed sem output or an unavailable/error response (`?fileExt=` / `?fileExts=` optional). |
| `/api/call-flow`      | GET    | Runs snapshot-bound CallDiff analysis for the active Git review (`?snapshot=<id>` required). Returns bounded call trees, raw output, per-file impacts, and explicit skipped-language/file metadata for packs not yet installed. |
| `/api/call-flow/install` | POST | Starts or joins the selective install (`{ languageIds?: [...] }`; omission uses the current review's server-authored plan). The UI calls it automatically once per target per review session after Call flow consent; manual calls remain for Retry and install-ahead. The coordinator deduplicates/queues core and pack targets, a stale-tolerant data-dir lease serializes publication across server processes, Node >= 22 preflight runs before download, and the endpoint enforces the same-origin guard. |
| `/api/call-flow/install-status` | GET | Poll `{ state, stage?, languageIds?, currentLanguageId?, error?, reason? }` across `downloading` / `verifying` / `installing-deps` / `building`. |
| `/api/review-analysis` | GET / POST  | GET refreshes capability adverts without mutating settings; POST persists independent `{ semanticDiff, callFlow }` booleans and returns adverts. |
| `/api/file-content`   | GET    | Returns `{ oldContent, newContent }` for expandable diff context (`?path=&oldPath=&base=`) |
| `/api/feedback`       | POST   | Submit review (body: feedback, annotations) |
| `/api/image`          | GET    | Serve image by path query param            |
| `/api/upload`         | POST   | Upload image, returns `{ path, originalName }` |
| `/api/draft`          | GET/POST/DELETE | Auto-save annotation drafts to survive server crashes |
| `/api/external-annotations/stream` | GET | SSE stream for real-time external annotations |
| `/api/external-annotations` | GET | Snapshot of external annotations (polling fallback, `?since=N` for version gating) |
| `/api/external-annotations` | POST | Add external annotations (single or batch `{ annotations: [...] }`) |
| `/api/external-annotations` | PATCH | Update fields on a single annotation (`?id=`) |
| `/api/external-annotations` | DELETE | Remove by `?id=`, `?source=`, or clear all |
| `/api/pr-diff-scope` | POST | Switch between layer and full-stack diff scope. Response includes `semanticDiff?`. |
| `/api/pr-list` | GET | List PRs for the current repo (cached 30s) |
| `/api/pr-switch` | POST | Switch to a different PR in-place (body: `{ url }`). Response includes `semanticDiff?`. |
| `/api/code-nav/resolve` | POST | Search for symbol definitions and references via ripgrep (body: `{ symbol, filePath, line, charStart, side, language? }`) |
| `/api/code-nav/file` | GET | Read file from working tree for code-nav preview (`?path=`) |

### Annotate Server (`packages/server/annotate.ts`)

| Endpoint              | Method | Purpose                                    |
| --------------------- | ------ | ------------------------------------------ |
| `/api/plan`           | GET    | Returns `{ plan, origin, mode: "annotate", filePath, sourceInfo?, gate, renderAs?, rawHtml?, previousPlan?, versionInfo?, diffCurrent?, diffHtml? }`. The last four power the per-file version diff: `previousPlan`/`versionInfo`/`diffCurrent` for the markdown diff, `diffHtml` (the previous→current page rendered with inline `<ins>`/`<del>`) for `--render-html` files. A local rendered-HTML root is served from its CURRENT bytes on every read (`readRootHtml`), with the startup snapshot as the fallback when the file is missing, unreadable, or over the 2MB cap; when the served bytes differ from the snapshot, `previousPlan`/`versionInfo` still name the saved baseline and `diffCurrent`/`diffHtml` are recomputed against the served bytes (`htmlDiff` is pure; a GET never writes history), so a reload after an agent edit keeps the version diff. `/api/doc` carries the same recomputed `previousPlan`/`versionInfo`/`diffHtml` when it serves that root document (the in-app Refresh path, `rootHtmlVersionDiff`), and nothing extra for any other document. Live app sessions return `{ mode: "annotate-app", appUrl, targetUrl, liveToken, sharingEnabled: false, ... }` instead: no rawHtml, no version fields (see "Live app annotation"). |
| `/api/plan/version`   | GET    | Fetch a specific stored version of the annotated file (`?v=N`) |
| `/api/plan/versions`  | GET    | List all stored versions of the annotated file |
| `/api/feedback`       | POST   | Submit annotations (body: feedback, annotations) |
| `/api/approve`        | POST   | Approve without feedback (review-gate UX, `--gate`) |
| `/api/exit`           | POST   | Close session without feedback |
| `/api/save-notes`     | POST   | Save to external note apps (Obsidian, Bear, Octarine) |
| `/api/html-assets/<token>/<path>` | GET | Serve relative support assets for raw HTML annotation sessions |
| `/api/share-html`     | GET    | Lazily prepare portable raw HTML for sharing (`?path=<html-file>` optional) |
| `/api/image`          | GET    | Serve image by path query param            |
| `/api/upload`         | POST   | Upload image, returns `{ path, originalName }` |
| `/api/doc`            | GET    | Serve linked .md/.mdx/.html file or code file (`?path=<path>&base=<dir>`) |
| `/api/doc/exists`     | POST   | Batch-validate code-file paths (body: `{ paths: string[], base?: string }`) |
| `/api/skills`         | GET    | List global agent skills for comment skill references (`{ skills: [{ name, root, description?, humanOnly, dir }] }`) |
| `/api/skills/content` | GET    | SKILL.md contents of one discovered skill for human-only feedback injection (`?name=<skill>`) returns `{ skill: { name, dir, path, content, truncated, humanOnly } }`; the name is matched against discovery only, never used as a path |
| `/api/draft`          | GET/POST/DELETE | Auto-save annotation drafts to survive server crashes |
| `/api/agent-terminal/pty/<token>` | WebSocket | Tokenized PTY bridge for the optional annotate-mode agent terminal |
| `/api/external-annotations/stream` | GET | SSE stream for real-time external annotations |
| `/api/external-annotations` | GET | Snapshot of external annotations (polling fallback, `?since=N` for version gating) |
| `/api/external-annotations` | POST | Add external annotations (single or batch `{ annotations: [...] }`) |
| `/api/external-annotations` | PATCH | Update fields on a single annotation (`?id=`) |
| `/api/external-annotations` | DELETE | Remove by `?id=`, `?source=`, or clear all |
| `/api/annotate/client-lease` | GET (SSE) | Client lease for local direct structured gates: each open stream is one connected review surface. 404 when the capability is not advertised. |

All servers bind loopback on a random port; `HYPERMARK_PORT` pins it.

## Plan Version History

Every plan is automatically saved to `~/.hypermark/history/{project}/{slug}/` on arrival, before the user sees the UI. Versions are numbered sequentially (`001.md`, `002.md`, etc.). The slug is derived from the plan's first `# Heading` + today's date via `generateSlug()`, scoped by project name (git repo or cwd). Same heading on the same day = same slug = same plan being iterated on. Identical resubmissions are deduplicated (no new file if content matches the latest version).

This powers the version history API (`/api/plan/version`, `/api/plan/versions`) and the plan diff system.

**Annotate mode** also saves history on open, so the same version diff works when annotating a standalone `.md`/`.txt`/`.html` file (or any other supported plain-text file, e.g. `.yaml`/`.json`/`.toml`). It keys the slug by **file path** — `annotate-{sanitized-basename}-{hash8}` — rather than heading + date, so re-opening the same file groups its versions even as its content (and headings) change. **Note this writes a copy of each annotated file's content** under `~/.hypermark/history/` (or `HYPERMARK_DATA_DIR`); disable via `HYPERMARK_ANNOTATE_HISTORY=0` or `{ "annotateHistory": false }` in `~/.hypermark/config.json` to keep annotate sessions stateless (the version diff is then unavailable, and the durable submitted-feedback records described in the env-var table are also skipped). Single-local-file annotate sessions additionally write each submitted decision to `history/{project}/{slug}/submissions/{timestamp}.md` BEFORE deleting the annotation draft, so feedback survives an agent-side timeout (#678); a failed record write keeps the draft as the recovery copy. For `--render-html` files the diff is rendered as the real page with inline `<ins>`/`<del>` highlights via `htmlDiff()` (`packages/shared/html-diff.ts`).

History saves independently of the `planSave` user setting (which controls decision snapshots in `~/.hypermark/plans/`). Storage functions live in `packages/shared/storage.ts` (runtime-agnostic, re-exported by `packages/server/storage.ts`). Slug format: `{sanitized-heading}-YYYY-MM-DD` (heading first for readability).

## Feedback Archive

Every review submitted through a Hypermark decision is durably archived at
decision-settlement time, so a submission survives an agent-side timeout, a
closed terminal, or a `planSave` setting the user turned off. One deliberate
exception: a review posted straight to GitHub or GitLab with `POST
/api/pr-action` is delivered to the platform and is **not** archived locally
yet (a named follow-up). Layout, per project (same `{project}` key as
`history/`):

```
${HYPERMARK_DATA_DIR}/feedback/{project}/
  index.jsonl                                  # append-only, authoritative, schema v1
  records/2026-08-31T14-22-07-511Z-review-feedback.md   # human-readable sidecar
```

The JSONL line is self-contained (`v`, `ts`, `client`, `clientVersion?`,
`project`, `origin`, `surface`, `decision`, `target`, `feedback`,
`annotations`, `counts`, `recordFile`) so an analyzer never has to open a
sidecar; the markdown sidecar exists because the rest of the data dir is
greppable markdown and is written only for records that carry content. Bare
approvals, LGTMs, and dismissals are decision-only lines with no sidecar.

**This index format is shared, not Hypermark-private.** Several tools append
to the SAME `feedback/{project}/index.jsonl` inside whichever data dir they
resolve, separated by the `client` field on each line rather than by separate
files. Known writers: `hypermark` (this repo) and `plannotator-tui`, the Rust
terminal client; `herdr-annotate` is reserved for a possible future Lite
writer. Note that decision D5 ended the shared *directory*: this repo writes
under `~/.hypermark` while the other clients still write under
`~/.plannotator`, so in practice the two indexes no longer interleave unless
`HYPERMARK_DATA_DIR` points them at the same place. The cross-tool line shape
still holds and is what the rest of this section describes. Treat `client`
as an open set, never an enum to validate against. Practical consequences: the
line shape is a cross-tool contract, so fields are **added, never repurposed**;
other clients suffix their id onto their sidecar filenames
(`{stamp}-{surface}-{decision}-plannotator-tui.md`), so the `records/`
directory holds more filename shapes than this repo writes and `recordFile` is
the only valid handle to a sidecar (nothing may parse the name); and unknown
fields must be ignored rather than rejected.

Two optional fields are declared in v1 but not populated here, so their names
are reserved across every client: `target.agent` (`{ host?, session?,
transcript? }`) is the provenance for surfaces whose subject is an agent
session rather than a file or a diff, such as annotate-last, and
`clientVersion` is the writing client's own version where it knows it
(`packages/shared` has no runtime-agnostic version constant, so this repo
leaves it unset rather than reading `package.json` from a vendored module).

Everything is written by one shared module, `packages/shared/feedback-archive.ts`,
which resolves the data dir per call and **never throws**: a failed archive write is
logged, degrades silently for the user, and keeps the annotation draft as the
recovery copy. The append happens BEFORE `deleteDraft`, generalizing the #678
ordering to every surface. Call sites: `packages/server/index.ts`
(`/api/approve`, `/api/deny`), `packages/server/review.ts` (`/api/feedback`,
`/api/exit`), and `packages/server/annotate.ts` (`persistSubmittedDecision`,
`/api/exit`).

Invariants worth keeping: records never contain patch bytes or a second copy of
the plan (identity and a version-file reference instead); repeat decisions
append rather than overwrite (unlike the legacy `plans/` snapshot, which is
keyed by slug and status and is left alone); annotation `source` / `author`
provenance is preserved so external and agent findings stay
distinguishable from the human's own comments; and `feedback` is listed in
`PURGE_OWNED_TOP_LEVEL` (`packages/server/uninstall.ts`) so uninstall purge
removes it. Controls and the privacy/retention note are in the
`HYPERMARK_FEEDBACK_HISTORY` row of the environment table above. The read
path in v1 is the files on disk (`jq` over `index.jsonl`, `grep` over
`records/`); there is no CLI reader or UI surface yet.

Details that surprise people:

- **Index durability is a practical guarantee, not a formal one.** One record
  is always exactly one line, and the whole line is handed to a single
  append-mode write. That write is not one syscall (`appendFileSync` loops
  internally until its buffer is drained); what holds in practice is that an
  `O_APPEND` write of a line-sized buffer completes without interleaving on a
  local filesystem. NFS and SMB do not promise even that, and a genuine
  interleave damages **both** records that raced, not just the later one. The
  backstop is the reader: unparsable lines are skipped, so everything else in
  the file still reads. With several clients writing one index, this caveat is
  worth knowing rather than assuming away.
- **Readers gate on structure, not version.** `parseFeedbackIndex` keeps any
  line that parses and carries a numeric `v`, so a newer writer's lines are
  still returned; an analyzer that depends on v1 semantics should filter
  `v <= 1` itself. Since fields are only added and never repurposed, a `v2`
  would signal a real shape change rather than the arrival of new keys.
- **Folder-session records name the folder, not the open document.** A folder
  annotate session submits one body of feedback for the session, so
  `target.filePath` is the session's folder; the per-document path is not part
  of the record.
- **URL-session records store the full URL, query string included**, because
  that is the page that was reviewed. A URL carrying a token in its query is
  therefore written to disk; the opt-out is the control for that.
- **`target.review.cwd` is provenance, not a durable handle.** A PR review
  started with `--local` records a per-PR pool checkout that is cleaned up when
  the session ends; `target.review.pr` plus `gitRef` are the identity that
  survives.
- **Project bucketing prefers the caller's `project` option** (the `project`
  field on `ReviewServerOptions`, mirroring the annotate server), falling back
  to deriving a name from the review cwd. The fallback is wrong in PR mode,
  where there is no `gitContext` and `--local` points `agentCwd` at
  `pool/pr-<n>`, so every CLI entry point passes `detectProjectName()`.
- **The test suite turns the archive off** through the `tests/setup/feedback-archive-off.ts`
  preload in `bunfig.toml`, because most server tests boot a real server
  without redirecting `HYPERMARK_DATA_DIR` and would otherwise write into the
  contributor's own data dir. Tests that need the archive opt back in inside
  their own test bodies.

## Plan Diff

When a user denies a plan and Claude resubmits, the UI shows what changed between versions. A `+N/-M` badge appears below the document card; clicking it toggles between normal view and diff view.

**Diff engine** (`packages/ui/utils/planDiffEngine.ts`): Uses the `diff` npm package (`diffLines()`) to compute line-level diffs. Groups consecutive remove+add into "modified" blocks. Returns `PlanDiffBlock[]` and `PlanDiffStats`.

**Two view modes** (toggle via `PlanDiffModeSwitcher`):
- **Rendered** (`PlanCleanDiffView`): Color-coded left borders — green (added), red (removed/strikethrough), yellow (modified)
- **Raw** (`PlanRawDiffView`): Monospace `+/-` lines, git-style

**State** (`packages/ui/hooks/usePlanDiff.ts`): Manages base version selection, diff computation, and version fetching. The server sends `previousPlan` with the initial `/api/plan` response; the hook auto-diffs against it. Users can select any prior version from the sidebar Version Browser.

**Diff annotations:** The clean diff view supports block-level annotation — hover over added/removed/modified sections to annotate entire blocks. Annotations carry a `diffContext` field (`added`/`removed`/`modified`). Exported feedback includes `[In diff content]` labels.

**Annotation hook** (`packages/ui/hooks/useAnnotationHighlighter.ts`): Annotation infrastructure used by `Viewer.tsx`. Manages web-highlighter lifecycle, toolbar/popover state, annotation creation, text-based restoration, and scroll-to-selected. The diff view uses its own block-level hover system instead.

**Sidebar** (`packages/ui/hooks/useSidebar.ts`): Shared left sidebar with three tabs — Table of Contents, Version Browser, and Archive. The "Auto-open Sidebar" setting controls whether it opens on load (TOC tab only). In archive mode, the sidebar opens to the Archive tab automatically.

## Data Types

**Location:** `packages/ui/types.ts`

```typescript
enum AnnotationType {
  DELETION = "DELETION",
  COMMENT = "COMMENT",
  GLOBAL_COMMENT = "GLOBAL_COMMENT",
}

interface ImageAttachment {
  path: string;   // temp file path
  name: string;   // human-readable label (e.g., "login-mockup")
}

interface Annotation {
  id: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  type: AnnotationType;
  text?: string; // For comment
  originalText: string; // The selected text
  createdA: number; // Timestamp
  author?: string; // Tater identity
  images?: ImageAttachment[]; // Attached images with names
  source?: string; // External tool identifier (e.g., "eslint") — set when annotation comes from external API
  diffContext?: 'added' | 'removed' | 'modified'; // Set when annotation created in plan diff view
  htmlAnchor?: HtmlElementAnchor; // Raw-HTML pinpoint: serialized element anchor for reliable restoration
  htmlAdditionalTargets?: HtmlAnnotationTarget[]; // Raw-HTML shift-click multi-select: extra elements this one comment covers
  startMeta?: { parentTagName; parentIndex; textOffset };
  endMeta?: { parentTagName; parentIndex; textOffset };
}

interface HtmlElementAnchor {
  selector: string; // verified-unique CSS selector built in the viewer bridge
  tagName: string;
  text?: string; // normalized text snapshot; weak selectors fail closed against it
  point?: { x: number; y: number }; // normalized (0..1) selected point inside the element's rect, used by placed markers to reproject against the element's current geometry
}

interface HtmlAnnotationTarget {
  label?: string; // semantic label from the pinpoint hover cascade (e.g. "Button")
  text: string; // capped element text, or an element description when text-less
  anchor?: HtmlElementAnchor; // absent when anchoring failed closed
}

interface Block {
  id: string;
  type: "paragraph" | "heading" | "blockquote" | "list-item" | "code" | "hr" | "table" | "html" | "directive";
  content: string;
  level?: number; // For headings (1-6)
  language?: string; // For code blocks
  alertKind?: "note" | "tip" | "warning" | "caution" | "important"; // GitHub alerts (blockquote subtype)
  order: number;
  startLine: number;
}
```

## Markdown Parser

**Location:** `packages/ui/utils/parser.ts`

`parseMarkdownToBlocks(markdown)` splits markdown into Block objects. Handles:

- Headings (`#`, `##`, etc.) with slug-derived anchor ids
- Code blocks (``` with language extraction)
- List items (`-`, `*`, `1.`)
- Blockquotes (`>`) — including GitHub alerts (`> [!NOTE|TIP|WARNING|CAUTION|IMPORTANT]`) which set `alertKind`
- Horizontal rules (`---`)
- Tables (pipe-delimited) — rendered via `TableBlock` with a `TableToolbar` (copy as markdown/CSV) and `TablePopout` overlay
- Raw HTML blocks (`<details>`, `<summary>`, etc.) — rendered via `HtmlBlock` through `marked` + DOMPurify
- Directive containers (`:::kind ... :::`) — rendered via `Callout`
- Paragraphs (default) with inline extras: bare URL autolinks, `@mentions` / `#issue-refs`, emoji shortcodes, smart punctuation

`exportAnnotations(blocks, annotations, globalAttachments)` generates human-readable feedback for Claude. Images are referenced by name: `[image-name] /tmp/path...`. Annotations with `diffContext` include `[In diff content]` labels.

## Annotation System

**Selection mode:** User selects text → toolbar appears → choose annotation type
**Redline mode:** User selects text → auto-creates DELETION annotation

Text highlighting uses `web-highlighter` library. Code blocks use manual `<mark>` wrapping (web-highlighter can't select inside `<pre>`).

**Annotation undo/redo:** each plan, annotate, or code-review app keeps one bounded 50-action stack for the active surface. `Mod+Z` undoes; `Mod+Shift+Z` and `Mod+Y` redo. Only local human annotation mutations are recorded, and a new mutation discards the redo branch. Native inputs, textareas, contenteditable regions, CodeMirror, dialogs/popovers, the Image Annotator, and an open Review Edit Mode session keep ownership of their own history shortcuts. External/agent writes do not enter annotation history; direct source changes, draft/share restore, refresh or diff replacement, identity changes, navigation to another document/message/review context, submission, and other baseline replacements clear it. The Image Annotator keeps a separate stroke undo/redo stack while its overlay is open.

**Raw-HTML annotate:** the sandboxed viewer never mutates the visited page's DOM. Committed annotations render as numbered placed comment markers plus overlay-projected highlight rectangles inside a shadow-rooted fixed overlay host: the durable anchor data (element selector, text snapshot, normalized selected point) is persisted, and the markers/highlights are disposable projections re-resolved from it on every reconcile. Shift-click multi-select joins additional elements to one comment (`htmlAdditionalTargets`).

**HTML and live-app interaction model:** raw-HTML sessions and live app sessions (`mode: "annotate-app"`) share one contract. Both open with pinpoint **armed** (`htmlAnnotateArmed` defaults to `true`, `packages/editor/App.tsx:493`; live sessions open armed like every other HTML surface, `App.tsx:2871`). `Esc` walks a ladder instead of exiting outright: a pending draft closes first, then the pinpoint hover outline clears, and only then does `Esc` drop the surface to **Interact**, where the bridge goes passive so clicks, forms, text selection, and SPA navigation reach the page natively (`packages/ui/components/html-viewer/bridge-script.ts:3066-3080`; committed markers stay visible and a marker click still opens its comment, and in Interact an open drag-comment draft still closes before `Esc` is handed back to the page). Vim owns its own ladder and is skipped here. The header **pen** button re-arms (`packages/editor/components/AppHeader.tsx:386-404`, `aria-pressed`), as does `Mod+Shift+A` (`packages/ui/shortcuts/plan-review/htmlAnnotate.shortcuts.ts:13-21`), which the bridge mirrors inside the iframe on the capture phase and forwards to the parent (`bridge-script.ts:3085-3091`), so the chord works whichever document owns focus. Text drag-selection commenting is **always live**, on both surfaces and in both states, ungated from the armed flag and from the input method (`bridge-script.ts:384-386`, `:1420-1436`): while armed, a click pins an element and a drag selects text at the same time, and the one-shot `dragEndedClick` guard stops a completed drag's trailing click from re-pinning (`bridge-script.ts:1381-1390`).

These surfaces are **comment-only**. `redline` (auto-DELETION) and `quickLabel` are clamped at the trust boundary, which is the parent's postMessage ingest rather than the server, covering the host mode and a page-supplied `modeOverride` alike so a hostile page cannot force a DELETION (`packages/ui/components/html-viewer/useHtmlAnnotation.ts:535-547`). Only CREATION is restricted: persisted DELETION annotations still restore and still render their deletion styling (`useHtmlAnnotation.ts:903`). The selection toolbar drops Delete behind a `commentOnly` seam and is passed no quick-label handler (`packages/ui/components/AnnotationToolbar.tsx:217-224`, `HtmlViewer.tsx:880-883`); markdown surfaces keep the full toolbar. HTML surfaces also pin the viewer input method to pinpoint (`App.tsx:5480`), so there is no floating input-method toolstrip on them at all (`toolstripVisible` is gated on `!isHtmlSurface`, `App.tsx:2788-2793`) and the `Shift+1`-`4` annotation-mode shortcuts cannot fire there. A header **eye** button immediately left of the pen toggles Show/Hide tools: hiding REMOVES all floating chrome over the page from the DOM (the sidebar tongue tabs and the comment/attachments cluster) rather than merely hiding it (`AppHeader.tsx:364-385`, `App.tsx:5193`, `HtmlViewer.tsx:810`). The toggle lives in the header, so a hidden state always has a way back, which is what makes honoring the persisted `toolsHidden` cookie safe (`packages/ui/utils/htmlChrome.ts:17-21`).

**HTML Refresh (#1232).** A local rendered-HTML session can re-read its file from disk without reloading the tab, for the loop where an agent edits the page while the reviewer keeps annotating. The header **Refresh** button (left of the eye, `data-html-refresh`, titled "Refresh HTML from disk") fetches the active document through `/api/doc`, hands the bytes to the app, and remounts the viewer under a bumped `reloadGeneration` key (`packages/editor/App.tsx`, viewer `key`). The engine is the published `useHtmlRefresh` (`packages/ui/hooks/useHtmlRefresh.ts`: superseded and cross-document fetches are dropped, one restore acknowledgement per generation) and Hypermark's binding over `fetchHtmlDocumentSnapshot` is `packages/editor/hooks/useHtmlRefresh.ts` (toasts for refreshed, missing, and unavailable). Committed annotations survive on their durable anchors: the remounted viewer re-resolves every element selector and text snapshot against the new page, and the ones it cannot re-anchor are reported once (`onUnanchoredChange` to `reportAnnotationRestore`), toasted, and marked with an **Unanchored** chip in the annotations panel (`htmlUnanchoredIds` in App, cleared when the document changes); their comments stay in the panel and still export. A refresh keeps the version diff: for the root document `/api/doc` carries `previousPlan`/`versionInfo`/`diffHtml` recomputed against the bytes just read (see the annotate `/api/plan` row), `applyRefreshedHtml` sets them and resets `isPlanDiffActive`, so the view returns to normal mode with "Show changes" still available; a tab reload converges on the same state because `/api/plan` serves the current bytes and recomputes the same diff. `/api/share-html` shares the current bytes too. Only local files refresh: `canRefresh` is false for `http(s)` paths and live-app sessions, and the control is absent on read-only (archive) documents. The compact touch shell renders no header controls (`HtmlSurfaceControls` returns null when `compact`), so its Options menu offers "Refresh from disk" beside the Show/Hide tools and Interact/Annotate actions (`compactDocumentActions` in App, disabled while a refresh is in flight); a host that passes `canRefresh` and `onRefresh` to `HtmlSurfaceControls` gets the Refresh button with or without the eye.

Known limitations: printing a raw-HTML annotate session prints highlight stripes from a best-effort absolute-coordinate layer and is degraded inside the iframe (pre-existing); element-only targets (SVG anchors, multi-select additional element targets) have no print representation. Annotation undo/redo listeners live in the parent document, so they are unavailable while focus is inside a raw-HTML or live-app iframe; the framed page keeps its own `Mod+Z`. Focus the editor chrome or annotation panel first. Forwarding this safely would require synchronizing parent history availability without stealing native or live-app undo; only the reserved `Mod+Shift+A` annotate toggle is currently forwarded.

## Threaded replies (`inReplyTo`)

One additive field on `Annotation`: a reply inherits its parent's anchor, renders indented under it in the annotations panel (`threadReplies` in `AnnotationPanel.tsx`), and exports nested under the parent's entry (`**Replies:**` block in `exportAnnotations`); an annotation without it renders and exports byte-identically to before. The threading rule is shared (`resolveReplyParents` in `packages/core/annotation-threads.ts`): an annotation is a reply only when its target is a different annotation in the same list and the parent chain never returns to it; orphans, self-references, and every member of a cycle render and export as roots in original order, so nothing is ever dropped and the export's header count equals what is emitted. `PATCH /api/external-annotations` refuses an `inReplyTo` that is self, missing, or would close a cycle (`validateReplyTarget`, both runtimes, `400`). Drafts carry it (annotations are opaque JSON to the draft transport); share links deliberately do not (a reply shares as a plain comment on the same quote, the existing text-restore contract, pinned by `sharing.inReplyTo.test.ts`).

## Keyboard Shortcuts

**Location:** `packages/ui/shortcuts/` (engine + scope data). Both apps consume it directly.

The shortcut system has two layers:

1. **Engine** (`packages/ui/shortcuts/{core,runtime}.ts`) — parser for declarative bindings (`Mod+Enter`, `Alt Alt` double-tap, `Alt hold`), dispatcher, platform-aware formatter (mac glyphs vs. `Ctrl`), validator, and the `useShortcutScope` / `useDoubleTapShortcuts` React hooks. Truly shared — both apps use it as-is.
2. **Scopes** — `defineShortcutScope({ id, title, shortcuts: { actionId: { bindings, description, section, ... } } })`. One scope per UI surface (annotation toolbar, comment popover, file tree, etc.). App-specific scopes live in `packages/ui/shortcuts/{plan-review,code-review}/` — **the subfolder names which app's UI the scope serves** — while genuinely cross-app scopes such as `history.shortcuts.ts` and `decisionControl.shortcuts.ts` (the header decision control's note-composer chords, mounted identically by both apps) live at the shortcuts root. Components/Apps wire handlers to a scope via `useShortcutScope({ scope, handlers: { actionId: () => ... } })`.

**Convention for adding new shortcuts:** define the action in the relevant app-specific subfolder (`plan-review/` or `code-review/`), or at the shortcuts root when both apps share the same action and semantics. Declare the binding(s) and description, then wire a handler at the call site with `useShortcutScope`. The marketing docs page picks it up automatically at next build. Unit tests in `packages/ui/shortcuts.test.ts` enforce normalized binding tokens (`Mod`, `Shift`, `Alt`, `A-Z`, `1-0`, named keys, `F1`–`F12`) and unique scope ids.

## Settings Persistence

**Location:** `packages/ui/utils/storage.ts`, `planSave.ts`

Uses cookies (not localStorage) because each hook invocation runs on a random port. Settings include identity, plan saving (enabled/custom path),.

## Syntax Highlighting

There is **one** highlighter in the app: the Shiki instance `@pierre/diffs` already runs for the code-review diff pane, driven by Shiki's **JavaScript regex engine** (`preferredHighlighter: 'shiki-js'`). `highlight.js` is gone. The wrapper is `packages/ui/utils/codeHighlight.ts`:

- `applyHighlight(el, code, lang, theme)` — imperative drop-in for the old `hljs.highlightElement(el)`. Writes plain text immediately (final size on first paint, no layout shift), then swaps in highlighted markup once the grammar is attached; already-attached grammars highlight synchronously, so there is no flicker on cached highlights. It also enforces that the rendered text is byte-identical to the source and falls back to plain text otherwise, because the annotation layer addresses code blocks by text offset.
- `highlightToHtml(code, lang, theme)` / `ensureHighlight(lang, theme)` — the sync/async pair behind it, for callers that need HTML strings (the code-file hover preview).
- `codeBlockClassName(lang)` — the `pn-code font-mono language-{lang}` class every fenced `<code>` carries. **`pn-code` replaced the old `hljs` class** and is the structural hook `blockTargeting`, vim navigation and `print.css` use (`pre > code.pn-code`); `language-*` is how `blockTargeting` reads a block's language back out of the DOM.
- `onCodeHighlightSwap(listener)` — observes every write `applyHighlight` makes, SYNCHRONOUSLY, immediately after it. Each write replaces the element's children, so it also destroys whatever the annotation layer wrapped inside the fence.

**Code-block annotation marks and highlight swaps.** `web-highlighter` cannot select inside a `<pre>`, so a fenced block is annotated all-or-nothing: one `<mark data-bind-id>` that is the `<code>` element's only child, painted by `paintCodeBlockMark` (`packages/ui/utils/codeBlockMark.ts`) — which MOVES the token spans into the mark rather than flattening them to text, so annotating or re-theming a block never costs it its colours. `Viewer` subscribes to `onCodeHighlightSwap` and re-paints that mark right after any swap, which is what keeps a palette or dark/light change from wiping code-block annotations. Being driven by the swap is also what makes the share/draft restore race safe **by ordering rather than by timing**: a restore that painted before the swap is re-established in the same task the swap ran in, and one that runs after finds the mark already there. Do not "fix" a mark-eating swap by skipping the rewrite when a mark is present — that leaves annotated blocks in stale theme colours.

**Language-less fences render as plain text and are never guessed at (#1212). There is no auto-detection anywhere.** `HighlightedCode` (review suggestions) derives its language from the caller's file path via `detectLanguage`; an unrecognised extension renders plain.

**Theming:** fences resolve the SAME theme the diff pane resolves, via `resolveFenceTheme` / `resolveSyntaxTheme` in `packages/ui/utils/syntaxTheme.ts` (keyed on `(colorTheme, resolvedMode)`; `packages/review-editor/hooks/usePierreTheme.ts` re-exports them). `useFenceTheme()` (`packages/ui/hooks/useFenceTheme.ts`) feeds the components and re-highlights on palette or mode change. Palettes with no Shiki counterpart fall back to `@pierre/diffs`' own `pierre-dark` / `pierre-light`. Consequence: code blocks follow the active palette in both light and dark instead of always rendering github-dark, so **do not add per-theme `.hljs-*`-style token CSS** — pick the right Shiki theme in `SHIKI_THEME_MAP` instead.

**Bundle note:** Pierre imports Shiki's full bundle, so every grammar and theme is already inlined in the single-file builds; reusing its shared highlighter costs no extra bytes and needs no CDN or runtime wasm fetch. The Oniguruma WASM engine is dead weight under `shiki-js` and is aliased to `scripts/shiki-wasm-stub.ts` in the review, hook and portal Vite configs (via `resolve.alias`, which — unlike `plugins` — is shared with Vite's worker build).

## Requirements

- Bun runtime
- Claude Code with plugin/hooks support
- Cross-platform: macOS (`open`), Linux (`xdg-open`), Windows (`start`)

## Development

```bash
bun install

# Run either app
bun run dev:hook       # Hook server (plan review + annotate)
bun run dev:review     # Review editor (code review)
```

**Local `hypermark` command:** run `bun link` once in the checkout to make the global `hypermark` command use this repo's source (`apps/hook/server/index.ts`) instead of an installed release binary. Commands like `hypermark review` then reflect local changes immediately. Rebuild the bundled HTML when changing UI code (see Build below).

## Testing Rules

**There is no DOM or React-render test layer in this fork.** Every `.test.tsx`
file and every test that mounted a component or touched `document` was removed,
along with the happy-dom preload and the `DOM_TESTS=1` CI steps. `bun test` is
now a single process running logic tests only. Component and layout behavior is
verified in the browser, by a human — see the manual smokes under `tests/manual/`.
Do not add a `.test.tsx` back without deciding to reinstate that layer
deliberately: one file would need the preload, the gate, and its own CI step.

A test must guard a behavior that can actually regress. Before writing one, name the failure it catches; if you can't, don't write it.

- **Pin copy only on purpose, never as a snapshot.** Locking a short user-facing string is legitimate when it is a deliberate decision — an action label ("Approve"), a command name, a legally/UX-critical phrase the maintainer wants frozen so agents can't drift it. Mark it as such in a comment. What is banned is incidentally snapshotting explanatory prose (intro dialogs, setting descriptions, empty-state copy) with `toBe` just because it was on screen when the test was written — that couples wording edits to test churn while guarding nothing. If such a string carries data that must stay truthful (a server-computed size, a language list, a version), assert those facts with `toContain` on the data, not the sentence around them.
- **Assert behavior, not implementation echo.** A test that restates what the code obviously does (calls X with Y, sets state to Z) without exercising an observable outcome is noise; it breaks on refactors and catches nothing.
- **Bun runs every test file in one process.** Never mutate `process.env`, `~/.hypermark`, or any global at module scope; mutate inside tests with restore in `finally`/`afterEach`, and sandbox all server/data-dir interaction under a temp `HYPERMARK_DATA_DIR`. Never read or write the real user config.

## Build

```bash
bun run build:review     # Code review editor (apps/review)
bun run build:hook       # Single-file HTML for the hook server
bun run build            # build:review then build:hook, in that order
```

**Important: Tailwind `@source` paths.** When creating new directories that contain `.tsx` files with Tailwind classes, add a matching `@source` entry to the app's `index.css`. Tailwind only generates CSS for classes it finds in scanned files — missing paths means classes appear in the DOM but have no effect.

**Important: Build order matters.** The hook build (`build:hook`) copies pre-built HTML from `apps/review/dist/`. If you change UI code in `packages/ui/`, `packages/editor/`, or `packages/review-editor/`, you **must** rebuild the review app first, then the hook:

```bash
bun run --cwd apps/review build && bun run build:hook   # For review UI changes
bun run build:hook                                       # For plan UI changes only
```

Running only `build:hook` after review-editor changes will copy stale HTML files. When testing locally with a compiled binary, the full sequence is:

```bash
bun run --cwd apps/review build && bun run build:hook && \
  bun build apps/hook/server/index.ts --compile --outfile ~/.local/bin/hypermark
```

## Test plugin locally

```
claude --plugin-dir ./apps/hook
```
