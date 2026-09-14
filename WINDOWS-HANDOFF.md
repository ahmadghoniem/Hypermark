# Windows handoff

The specs in `spec/` were written and their evidence gathered on a Linux
sandbox. These are the checks that only mean something on the maintainer's
Windows machine. Run them after the waves merge, in this order. Each item
says what to run, what to look for, and which spec it verifies.

Prerequisites: `bun install`; Claude Code with the Hypermark hook installed
(`apps/hook/hooks/hooks.json` or the `PermissionRequest` entry in
`~/.claude/settings.json`); Edge or Chrome as the default browser.

## 0. Baseline — before merging anything

Capture the current state so the after-numbers mean something.

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*apps/hook/server/index.ts*' -or $_.Name -like 'hypermark*' } | Select-Object ProcessId, CreationDate, CommandLine
bun run apps/hook/server/index.ts sessions
```

Record how many servers are alive and how old the oldest is. Kill them
(`Stop-Process -Id <pid>`) so the tests below start clean.

## 1. Orphan reaper (spec 10, Shape 1)

1. In a Claude Code session, enter plan mode and exit it so the Hypermark
   plan review opens in the browser. Do not decide.
2. Close the Claude Code window (or `Stop-Process` its PID).
3. Within 15 seconds:
   - The browser tab shows the "Session closed" completion overlay.
   - `bun run apps/hook/server/index.ts sessions` prints `No active Hypermark sessions.`
   - The `Get-CimInstance` query from §0 returns no `index.ts` process.
4. Repeat with `hypermark annotate <file.md>` (plaintext, no `--gate`) and
   with `hypermark review`. All three server kinds must exit.

Failure modes to report: the server survives (parent resolution picked the
wrong PID — capture `Get-CimInstance Win32_Process | Select ProcessId,
ParentProcessId, Name` while the session is open and attach it); the tab
never shows the overlay (the session stream did not deliver `sessionEnded`).

## 2. `hypermark sessions --kill` (spec 10, Shape 2)

1. Start two annotate sessions from two terminals; leave both open.
2. `bun run apps/hook/server/index.ts sessions` lists two.
3. `bun run apps/hook/server/index.ts sessions --kill 1` — the first exits,
   its tab shows the overlay, the list shows one.
4. `… sessions --kill all` — none remain, and
   `~/.hypermark/sessions/` has no `*.json` left (the killer side
   unregisters, since a terminated Bun process runs no exit handlers).

## 3. Draft survival (spec 10, E1)

1. `hypermark annotate <file.md>`; add two annotations; open a third
   composer, type a sentence, do **not** save.
2. Close the tab (not the terminal). Wait 2 seconds.
3. `hypermark sessions --open 1` (or reopen the URL).
   - The two annotations are back, with a toast and **no** dialog.
   - Select the same text as in step 1 → the composer opens with the sentence
     prefilled.
4. The lease must have been advertised for this plaintext session: the
   Network panel shows `/api/annotate/client-lease` open as `text/event-stream`.
5. Close the tab again and leave it closed for 40 seconds: the CLI exits with
   no output (dismissed), and `hypermark sessions` shows none.

## 4. Scrollbars, markers, composer (specs 06, 07, 08)

1. `hypermark review` on a repo with a diff. Every scrollbar (file tree,
   diff, right panel) has **no** stepper arrows at either end and is still
   grabbable at its normal thin width (Edge and Chrome; Firefox never drew
   them).
2. Add a line comment. The gutter marker is 18px tall with a 2px ring;
   hovering within ~4px of it opens the preview. With DevTools → Performance
   recording, the popup's first paint follows `pointerenter` in the next frame.
   Note the before/after frame count if you captured §0 with the old build.
3. The line-comment composer is the same card as the plan app's (anchor strip,
   attachment shelf, Improve/Ask/Save, `Ctrl ↵` hint). The header decision
   menu is 256px wide; no subtitle wraps at Windows' default 100% scaling or
   at 125%.
4. `hypermark annotate <file.md>`: the toolstrip opens on **Select** on a
   fresh profile (clear cookies for `localhost` first); Alt-tap switches to
   Pinpoint; reopening a day later still opens on Select.

## 5. Process-tree cleanup (spec 10, "other leaks")

1. Open an annotate session (`hypermark annotate <file.md>`).
2. Close the tab and wait for the lease to dismiss (or `--kill`).
3. `Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'hypermark.exe' }` shows
   no orphan process (the `taskkill /T` path fired).
4. `Get-ChildItem $env:TEMP\hypermark` is empty after a session that uploaded an image.
5. `Get-ChildItem ~\.hypermark\drafts\*.deleted.json` contains nothing older than 30 days.

## 6. Tests

The suite was never run on the sandbox. Run it once here:

```powershell
bun test 2>&1 | Tee-Object -FilePath test-run.log | Select-String -Pattern "pass|fail" | Select-Object -Last 5
```

Expected: every remaining test passes. If a test fails that no spec touched,
it was failing before this pass — check with `git stash; bun test <file>`.
Attach `test-run.log` to the report.

## Report back

One message with: the §0 counts, pass/fail per section, and the process
table from any §1 failure. That closes the review loop the specs were written
for.
