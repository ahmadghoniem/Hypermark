# What has already changed in Hypermark

The record of work already done: the foundation the old `spec/01`–`06` files
laid down, then every removal and change made on branch `ui-decluttering-pass`.
Check the code against it. Where the two disagree, the code wins and this file
is wrong. Work that has not happened yet belongs in `FABLE-BRIEF.md`.

---

## Foundation — from the deleted specs 01–06

These were settled and built before this branch. The code still matches them.

- **Product.** A single-user, Windows-first, Claude Code-only fork of
  Plannotator. Both the MIT and Apache-2.0 licences and the original
  `backnotprop` attribution stay.
- **Shape.** Three apps: `apps/hook` (plan hook, annotate, annotate-last, the
  CLI and its server), `apps/review` (code review), `apps/skills`. Six
  packages: `core`, `shared`, `server`, `ui`, `editor`, `review-editor`.
- **Launchers.** `/hypermark-annotate`, `/hypermark-last`, `/hypermark-review`.
  Claude Code's native `/btw` is left alone and is not a Hypermark skill.
- **Removed upstream, before this branch.** Fourteen apps, Guided Review, Code
  Tours, background review agents, multi-repository Workspaces, share links,
  import, export, print and note-app integrations, Ask AI in both editors,
  Vim modes, the editable identity field, and the stage/unstage mutation routes.
  The Claude Agent Terminal survived deliberately.
- **Theme.** Seven palettes: `pierre` (default), `hypermark`, `catppuccin`,
  `github`, `ayu-dark`, `one-dark-pro`, `tokyo-night`. One favicon, Classic.
  Phosphor icons for Hypermark's own controls; Pierre keeps its own diff and
  tree icons. No font is fetched from a CDN.
- **File tree.** `@pierre/trees` with one fixed configuration: opens expanded,
  flattens empty directories, search hides non-matches, complete icon set. No
  staging or git-status decoration.
- **Comments.** A code comment lives at its line: gutter marker, then a pinned
  popover, then editing in that same popover. Images belong to the comment and
  show as thumbnails inside the composer.
- **Naming.** Hypermark / `hypermark` everywhere, repository
  `ahmadghoniem/Hypermark`, data under `~/.hypermark`.

---

## Committed on this branch

### 1. Compact / mobile touch shell

A second, phone-shaped application shell. Below 1024px on a coarse pointer it
replaced the desktop document view with a 52px header of 44px tap targets, a
full-screen plan navigator and touch-sized rows in every shared control. The
desktop header's buttons collapsed into menu rows there.

**Commits:** `7bcc1212` deleted the compact plan surfaces; `3d5b3b2e` repaired
the controls and centring that removal broke; `5dd7245f` removed the rest
(`useCompactTouchLayout`, the compact header and menu branches, ~114 lines of
`theme.css`). Zero references remain.

### 2. Open-in-app / external editor launching

A split button on review file rows and plan badges. It detected installed
editors, terminals and file managers, then spawned the chosen one on the file.
It shipped a base64 brand-icon catalog inside all three bundles.

**Commits:** `e2a7814b` cut the macOS-only entries; `7bcc1212` removed the rest.
The file-actions menu that replaced it went too, in `db17fe58`.

### 3. WebMCP / browser-agent tool surface

The page advertised itself as a Model Context Protocol provider to a Chrome or
Edge browser agent, exposing in-page tools. It was an origin-trial API behind a
flag, and no agent ever used it.

**Commit:** `30b87090`, 33 files.

### 4. Token hover cards and the code-nav hover pipeline

Hovering a symbol in a review diff popped a card with its kind, a signature,
doc comment, preview and five sample references, resolved by a server-side
ripgrep search. It had its own dwell and trigger settings and a first-run
announcement.

**Commit:** `18e8180f`, 32 files.

### 5. Image annotator

Picking an image attachment opened a canvas overlay for drawing pen strokes,
arrows and circles on it before sending, with a tool palette, an undo stack and
its own shortcut scope.

**Commit:** `436442c5`, 15 files.

### 6. Conventional Comments and edit-to-suggest

A label taxonomy for comments (`praise`, `nitpick`, `issue`, `blocking`…), plus
an in-diff edit session that turned your code edits into a GitHub `suggestion`
block. A third surface, the "Add suggested code" box, wrote the same blocks by
hand.

**Commit:** `ae41f15a`, 61 files.

### 7. Remote / SSH / devcontainer / tailnet mode

The server could assume the browser was on another machine: SSH and devcontainer
detection, a fixed port `19432`, a `0.0.0.0` bind, a URL-host override, and a
`--tailscale` flag that published the session to a tailnet with a QR code.

**Commits:** `e2a7814b` removed it; `32f686be` removed the docs and tests that
pinned it.

### 8. Close and Discard become one exit

The plan and review headers had two identical-looking buttons with opposite
meanings. Close told the agent "dismissed"; Discard posted an approval, silently
green-lighting annotated work. There is now one exit.

**Commits:** `6e942c40`; `95e8c75e` renamed the annotate primary from `Done` to
`No notes`.

### 9. Permission-mode select and its first-run dialog

After a plan was approved, Hypermark asked which permission mode Claude Code
should resume in, through a four-way select and a first-run dialog. The client
now always sends `bypassPermissions` on approve.

**Commit:** `76c8cf9f`.

### 10. Settings that asked about themselves

Five features removed together: an auto-close-tab delay, a GitHub release poll
with an update dot and toast, a "(me)" suffix on your own comments, a first-run
flat-or-grid look chooser, and a tab for adding directories to the file browser.

**Commit:** `8801a1c6`, 40 files.

### 11. Codex and Copilot session adapters, crypto, compress

Per-agent adapters parsed Codex and Copilot transcripts so those agents could
drive a review. `packages/core` also carried encryption and compression modules
for a share-upload path that was already gone.

**Commit:** `73f373d8`, 159 files.

### 12. Staging (git add) controls

The review tree could stage and unstage files, with a staged count in the panel
header and an `A` shortcut. The per-row staged dot is informational and still
shows.

**Commit:** `0473298b` removed the last of the controls.

### 13. `adr/`, `docs/`, `bin/`, `build/`, `SECURITY.md`

`adr/` held about 1 MB of upstream architecture decision records and a design
prototype. `docs/` held two user pages. `bin/hypermark.js` shimmed a package
marked private and never published.

**Commits:** `5430e3b6` deleted `adr/`; `95e8c75e` deleted `bin/` and the rest.

### 14. Shortcuts list driven by the registry

Settings rendered a hand-typed shortcut list next to the `shortcuts/` registry
the runtime used, and the two drifted apart. The list now comes from the
registry. It lives in `KeyboardShortcutsDialog.tsx`, since the Settings dialog
that held it was later deleted (§19).

**Commit:** `0473298b`.

### 15. Plan-mode approval fallback

`/api/approve` fell back to the hook event's own `permission_mode`. That event
is `ExitPlanMode`, which fires while still in plan mode. Echoing `plan` back
would approve a plan and leave the session unable to act.

**Commit:** `36fcff76` stops the fallback returning `plan`.

### 16. Review skills checked into the repo

`interface-review`, the seven `better-*` skills it delegates to, `grilling` and
`writing-for-agents` now live in `.claude/skills/`. A cloud session has no
plugin cache, so skills reached only through a plugin were unreachable there.

**Commit:** `4f5555e6`.

### 17. Comment composer rebuilt around the attachment shelf

The anchored comment popover got an anchor icon and close control in a top
strip, an expand control at the textarea's top-right, a resize grip, and a
permanent 44px attachment shelf that holds the attach trigger. The shelf never
changes height, so the action row cannot shift under the cursor. The action row
is Improve, Ask and Save; Improve and Ask are not wired to anything yet.

**Commit:** `76dee4a3`.

### 18. Pull-request and merge-request review

`/hypermark-review` accepted a GitHub or GitLab PR URL. It fetched the PR into a
worktree pool and showed overview, checks, comments and artifact panels, a
stacked-PR label and a PR picker. Review feedback could be posted back to the
platform through a destination dropdown and a submission dialog.

**Commits:** `dd501502` (86 files, ~16,000 lines) removed the PR providers,
worktree pool, panels and submission path; `ef62599f` removed what it missed,
including the destination dropdown and the PR arms of the decision control and
shortcuts; `64d2451a` removed the PR icons and the skill and README text that
still told agents to pass a PR URL.

### 19. Analysis, and the Settings dialog

Two review analyses: Semantic Changes, powered by a downloaded `sem` sidecar,
and Call Flow, which installed per-language parser packs. Both had panels, file
badges and install flows. The Settings dialog went with them, taking its Theme,
Hooks and General tabs; the General tab had already been gated to appear only
when it held a control (`7c4f1f99`).

**Commits:** `8a51f4ee` (103 files, ~12,500 lines); `64d2451a` removed the
installers' sidecar download, the tests still asserting the analysis routes,
and "tater mode", whose only toggle lived in the deleted dialog.

### 20. Review header, options menu and per-file diff tabs

The review header lost its export button and export modal, and the options menu
went end to end with its setup dialog and agent-instructions action. The
uppercase tag badge on annotation cards and the per-file overflow menu went too.
Per-file diff tabs are gone, so reviews land on the all-files view, and picking
a file in the tree scrolls it into view. A split/unified icon toggle was added
to the header.

**Commit:** `db17fe58`.

### 21. Diff options in one header popover

Diff options were reachable only from the dock tab strip's gear, where a
Split/Unified pair duplicated the header toggle. They moved into one header
popover, which also carries code font and size. The tab strip keeps collapse-all
and nothing else. The all-files panel can no longer be closed. Sixteen unread
review-state fields, a set of never-passed props, and several orphaned modules
went with it.

**Commit:** `2596f33a`.

---

## Done, not yet committed

### 22. The viewed feature

Both layers are gone. The automatic layer marked a file viewed when you scrolled
past it, showed a one-time toast, and un-viewed files on a diff switch. The
manual layer was a per-file viewed checkmark, a hide-viewed filter, a viewed
counter, the `v` shortcut, a show-controls preference behind a gear popover,
viewed decoration in the tree, and a viewed list saved in the review draft.

The draft blob is opaque to the server, so an older draft just carries a field
nothing reads. No migration was needed.

### 23. Plan saving, the plan archive, and the quick-label picker

Approved plans and their annotations were written to `~/.hypermark/plans/`. A
`hypermark archive` mode and a sidebar archive browser listed them, served by
`/api/archive/plans` and `/api/archive/plan`. The directory is deleted from disk
too. The quick-label picker and its ten default labels are gone; the single
`Agreed` label remains.

### 24. The read-only document flag

`packages/editor/App.tsx` declared `documentReadOnly = false` and read it at 29
sites. The guards and conditions are folded away, and the three `readOnly` props
it passed to child components are gone.

### 25. Five composer fixes

The anchored composer's shell no longer scrolls, so it no longer clips the grip
or paints a horizontal scrollbar. Only the top-left resize grip remains. The
submit hint reads `Ctrl ↵`. Improve and Ask render enabled with green and red
tints, though still unwired. A global comment hides the top strip's contents.

### 26. Expanded comment dialog on the shelf

The review side's expanded comment dialog used an attachment strip plus a
separate attach button. It now uses the same attachment shelf as the anchored
popover.

### 27. Windows fixes

- Project-name resolution split paths on `/` only, so a backslash path resolved
  to the wrong project name and draft deletion missed its target. Both
  separators now work, with a drive-root guard.
- Session-log lookup returned the caller's path casing rather than the on-disk
  casing.
- Resolving the agent-terminal sidecar threw on Windows for a compiled binary's
  virtual path; it now returns `null`.
- Two subprocess test fixtures set `HOME` but not `USERPROFILE`, which is what
  Windows reads. That caused 15 test failures.

### 28. Dead tests and dead code

Three tests for removed behaviour are gone: remote-mode live sessions, a PNG
favicon fallback, and a second prompt runtime. `knip` ran with a new
`knip.json`. Eight `exports` subpaths pointing at deleted files were removed, as
were twelve dead exports in `packages/server/jj.ts`, ten unused dependency
entries, and unreferenced search-highlight helpers.

### 29. `AGENTS.md` and the old specs

`AGENTS.md` is emptied and committed (`99079e1d`), because its claims had
drifted from the code. The six `spec/` files are deleted; their lasting content
is the Foundation section above.
