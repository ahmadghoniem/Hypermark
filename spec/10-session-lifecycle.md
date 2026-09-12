# 10 — Session lifecycle and draft safety

Two problems, one wave. E1: a closed tab loses the open composer and reopening
asks a question. E2: servers outlive the Claude Code session that spawned them.

## Owned files

- `packages/ui/hooks/useAnnotationDraft.ts`, `packages/ui/hooks/useCodeAnnotationDraft.ts`
- `packages/ui/components/CommentPopover.tsx` (the module-level `draftStore`, lines 87–99, and `useCommentDraftSync`)
- `packages/editor/App.tsx` — the draft wiring (1864–1880, 2083–2212, 4275–4285)
- `packages/review-editor/App.tsx` — the draft wiring (503–513, 2339–2347)
- `apps/hook/server/annotate-output.ts` (+ test), `apps/hook/server/index.ts`
- `packages/server/annotate.ts` (lease gate + parent watcher), `packages/server/index.ts` and `packages/server/review.ts` (parent watcher only)
- new `packages/server/parent-watch.ts` (+ test), `packages/server/sessions.ts`

## E1. Drafts survive a closed tab

### What exists

- `/api/draft` GET/POST/DELETE on all three servers, backed by
  `~/.hypermark/drafts/<contentHash>.json` with a generation-gated tombstone
  (`shared/draft.ts`). Both apps debounce-save annotations to it
  (`useAnnotationDraft`, `useCodeAnnotationDraft`), flush on
  `pagehide`/`visibilitychange` with `keepalive` (plan only; review has no
  flush), and on mount read it back and show **Draft Recovered** with
  Restore/Dismiss (`editor/App.tsx:4278`, `review-editor/App.tsx:2342`).
- The open composer's text lives in a module-level `Map` in
  `CommentPopover.tsx:88` (`draftStore`), keyed by `draftKey` — it survives
  the popover unmounting, not the page.
- No `beforeunload` handler anywhere (`rg beforeunload packages` → nothing).
  Good; leave it that way.

### Edits

**1. Persist the open composer through `/api/draft`.**

Add an optional `composer` field to the draft body (both hooks):

```ts
composer?: { key: string; text: string; images: ImageAttachment[]; ts: number } | null;
```

`CommentPopover` already calls `onDraftChange(text, images)` on every change
(line 274). Wire a module-level subscriber: `draftStore` gains
`subscribe(listener)`; `useCommentDraftSync` notifies it. Each draft hook
subscribes on mount, stores the latest `{key, text, images}` in a ref, and
includes it in `persistNow`'s payload. Empty text and no images → `null`.
`scheduleDraftSave()` fires on composer change too (the debounce already
coalesces).

On restore, if `composer` is present, `draftStore.set(key, {text, images})`
before annotations are applied. The next time a popover mounts with that
`draftKey`, it prefills — which is exactly what happens today within a page.
Keys are already stable across reloads for plan (`plan:<scope>:selection:…`,
`useAnnotationHighlighter.ts:44–56` builds them from DOM offsets and text) and
for review file comments (`file:<path>`). For the review *line* composer the
key becomes `line:<path>:<start>-<end>` in spec 07; until then it has no key
and is not persisted — acceptable for one wave.

The composer does not reopen by itself on restore. Reopening requires the
anchor element, which for a text selection no longer exists. The text is
there when the user clicks the same place. Say this in the composer's
placeholder? No — leave it; a prefilled composer explains itself.

Review side: add the same `pagehide`/`visibilitychange` flush that
`useAnnotationDraft.ts:493–509` has (it is 15 lines; spec 02 later dedupes the
helpers).

**2. Restore automatically, no dialog.**

In both hooks, `draftBanner` state and `dismissDraft` go. On load, when a
draft exists, call the restore path directly. `restoreDraft()` in the plan
app does real work (`handleRestoreDraft`, `App.tsx:2083–2212`: re-anchors
annotations, reconciles edited documents, validates saved-file changes). Keep
that function; call it from the hook's load `.then` via an `onDraftLoaded`
callback option instead of from the dialog's `onConfirm`. Delete the two
`ConfirmDialog` blocks and `draftBannerMessage` (`editor/App.tsx:260`).

Replace the dialog with a `sonner` toast (`toast('Restored N annotations from
<timeAgo>')`, both apps already import `toast`), with an action `Discard`
that calls what `dismissDraft` did (clear annotations, tombstone the draft).
That keeps the escape hatch without a modal.

**3. Lease always on.**

`apps/hook/server/annotate-output.ts:33–37` `supportsAnnotateClientLease`
returns `gate && json && !hook`. It is called at `index.ts:770` and `922` and
the result becomes `clientLeaseSupported` on `startAnnotateServer`; the server
advertises `clientLease.enabled` in `/api/plan` and serves the SSE stream only
when true. The comment says only the `--gate --json` transport can "safely"
auto-resolve, because "no other protocol depends on the exact timing of the
response." For plaintext `hypermark annotate <file>` the CLI prints the
feedback and exits — a dismissed-by-abandonment outcome prints nothing and
exits, which is the same as the user pressing Close. There is no unsafe case.

Edit: delete `supportsAnnotateClientLease` and its interface; pass
`clientLeaseSupported: true` at both sites — or better, remove the option and
make `packages/server/annotate.ts:228` unconditional. Update
`annotate.test.ts:1488–1530` (`advertises the effective client-lease
capability`, `returns 404 when disabled`): the disabled arm no longer exists;
delete those two tests, keep the expiry/reconnect/late-decision ones.
`annotate-output.test.ts`'s call-site describe dies with the predicate (spec 01
lists it; delete it here since this spec owns the file).

Plan (`server/index.ts`) and review (`server/review.ts`) servers have no
lease at all. Do not add one there in this spec — E2's parent watcher covers
the "Claude is gone" case for all three, and a plan session closed by the
user is a `deny` that the hook protocol needs answered (see E2 §"tab still
open").

## E2. Orphaned servers on Windows

### How a server lives and dies

`apps/hook/server/index.ts` is the process. Every mode does
`startXServer → registerSession → await waitForDecision() → Bun.sleep(…) → server.stop() → process.exit(0)`.
Nothing else ends it. Signals: `SIGINT`/`SIGTERM` route to `process.exit`
(lines 373–374); `SIGHUP` is deliberately not handled so `nohup` works.

So a server exits only when a decision arrives. Decisions come from the tab
(approve/deny/feedback/exit) or, in annotate with the lease on, from the tab
disconnecting for 30s. A plan hook whose tab was closed, or whose Claude Code
window was closed, waits forever — that is the six `bun run
apps/hook/server/index.ts` processes. Windows makes it worse: when Claude Code
exits it does not kill its hook's process tree, and a Bun process with no
console owner is invisible.

### The two shapes

**Shape 1 — stale-session reaper (parent watcher).** At startup the server
records the PID of the Claude Code process that spawned it and polls it. When
that PID is gone, the server settles the pending decision as dismissed,
stops, and exits.

Finding the parent: `apps/hook/server/session-log.ts` already walks the
process tree (`getAncestorPids`, `createDefaultGetParentPid` — `ps` on Unix,
`Get-CimInstance Win32_Process` via PowerShell on Windows, lines 231–276) to
locate `~/.claude/sessions/<pid>.json`. `resolveSessionLogByAncestorPids`
(line 343) returns the matched log; extend it to also return the ancestor PID
it matched on. That PID is Claude Code. If no ancestor matches (the CLI was
run by hand), fall back to `process.ppid` (the shell) — closing the shell also
means the user is done.

Liveness: `process.kill(pid, 0)` works on Windows in Bun/Node for existence
checks; `sessions.ts:isAlive` already uses it. Poll every 5s.

Cost: one new module `packages/server/parent-watch.ts` (~60 lines: resolve
parent once, `setInterval`, `onGone` callback, `stop()`), wired in the three
`start*Server` functions (~10 lines each: call `onGone → decision.settle({exit:true}) ; stop()`).
Plus ~40 lines of tests using an injectable `isAlive`. **≈130 lines.**
Behaviour: a server dies within 5s of its Claude session, with no user action.

**Shape 2 — `hypermark sessions --kill`.** `hypermark sessions` already lists
live servers from `~/.hypermark/sessions/<pid>.json` and prunes dead PIDs
(`sessions.ts:listSessions`). Add `--kill [N|all]`: `process.kill(pid,
'SIGTERM')` on Unix; on Windows Bun's `process.kill` sends a terminate that the
target cannot intercept, so `process.on('exit')` may not run — call
`unregisterSession(pid)` from the killer side too. Cost: ~35 lines in
`index.ts` `sessions` arm + ~15 in `sessions.ts`. **≈50 lines.** Behaviour:
the user notices, opens a terminal, runs a command.

### Which

**Both, with 1 as the fix and 2 as the tool.** Shape 1 is the one that
actually closes the leak: the failure is "the user did nothing and six servers
accumulated", and a command the user must remember to run does not change
that. Shape 2 costs 50 lines and is the only remedy when Shape 1's parent
resolution is wrong (a wrapper shell that outlives Claude, a hand-launched
server), and it is how the maintainer will *verify* Shape 1 on the Windows
machine (`sessions` shows zero after Claude exits).

### A server whose browser tab is still open

Shape 1 fires when Claude is gone. If the tab is still open, the user can
still type — into a session whose consumer no longer exists. Sending would
POST to a dead server and fail with a network error, which the apps already
surface (`scheduleDraftSaveAfterSubmitFailure`). Better: before exiting, the
server flushes a final draft snapshot? It cannot — the draft is client-side.
So: the watcher gives the tab 10s grace after Claude disappears, during which
`/api/plan`, `/api/review` etc. respond with `{ sessionEnded: true }` on a new
lightweight `/api/session` poll the client already approximates through the
lease SSE (annotate) — for plan and review, add the same SSE endpoint the
annotate lease uses (`ANNOTATE_CLIENT_LEASE_STREAM_PATH` generalises to
`/api/session/stream`), server→client only. On `sessionEnded`, the client
flushes its draft (`persistNow(true)`), then shows the existing
`CompletionOverlay` with the `exited` copy ("Session closed"). Their typing is
in the draft file, and the next session on the same content restores it (E1).

That is the Shape 1 grace design: **Claude gone → announce on the stream →
wait 10s → settle dismissed → exit.** Cost adds ~40 lines client-side (one
`EventSource`, reuse `annotateClientLease.ts`'s `openAnnotateClientLeaseStream`)
and ~20 server-side.

### Other things left behind on Windows

Checked, with verdicts:

| Leak | Where | Verdict |
|---|---|---|
| Session registry entries for dead PIDs | `~/.hypermark/sessions/*.json` | Already pruned on next `listSessions()`; Shape 2 prunes on `--kill`. Fine. |
| Draft tombstones `*.deleted.json` | `shared/draft.ts` writes one per delete, never removes it | **Fix in this spec**: `deleteDraft` also removes tombstones older than 30 days in the same directory (one `readdirSync` pass, ~10 lines). |
| Image uploads | `server/image.ts:18` `UPLOAD_DIR = join(tmpdir(), "hypermark")` — never cleaned | **Fix**: `server.stop()` in each server removes files it created this session (track paths in a `Set`; ~15 lines). |
| Plan version history | `~/.hypermark/history/{project}/{slug}/NNN.md` — every plan revision forever | **Ask**: cap per slug (e.g. 20) or leave. Not a process leak; disk only. |
| Agent-terminal sidecar (`node` child) | `server/agent-terminal.ts:237–265` spawns Node; `dispose()` calls `proc.kill()` which is SIGTERM → on Windows `TerminateProcess`, fine. But the sidecar's own PTY children (the Claude CLI it hosts) are not in its job object | **Fix**: on Windows, dispose with `taskkill /T /F /PID <pid>` via `Bun.spawnSync` so the tree dies (~8 lines, `process.platform === 'win32'` guard). |
| Browser launcher child | `server/browser.ts:98` spawns detached + `unref` | Intended; the browser outlives us. Fine. |
| Review temp worktrees | `server/review.ts:105 onCleanup` | Only used by the removed PR path; nothing passes `onCleanup` now (`rg -n "onCleanup:" apps packages -g '!*.test.ts'` → nothing). Fine; spec 11 may remove the option. |
| Fixed-port retry | `server-port.ts:51–90` retries an in-use `HYPERMARK_PORT` 5× | Orphans holding the port cause this. Shape 1 removes the cause. Fine. |
| File-browser watchers | `server/reference-watch.ts` `closeAllFileBrowserWatchers` on stop | Already closed in `stop()`. Fine. |

## Open questions

1. Grace period after Claude exits: 10s proposed. Long enough to flush a
   draft; short enough that `hypermark sessions` stays honest.
2. Should Shape 1 also fire when the *terminal* (parent shell) dies but Claude
   is somehow alive? No — Claude is the consumer; the shell is incidental.
3. History cap (table above).

## Completion

- `rg -n "supportsAnnotateClientLease|AnnotateClientLeaseCapabilityOptions|clientLeaseSupported" apps packages` → nothing.
- `rg -n "Draft Recovered|draftBanner|dismissDraft" packages` → nothing.
- `rg -n "beforeunload" packages` → nothing (unchanged).
- `ls packages/server/parent-watch.ts packages/server/parent-watch.test.ts` → both exist; `rg -n "startParentWatch" packages/server/index.ts packages/server/annotate.ts packages/server/review.ts` → one hit each.
- `hypermark sessions --help` output (via `bun run apps/hook/server/index.ts sessions --help`) lists `--kill [N|all]`.
- Behaviour (Linux, partial): `bun run dev:hook`, type into a composer, reload — the same selection's composer reopens prefilled; annotations reappear with a toast and no dialog.
- Behaviour (Windows, `WINDOWS-HANDOFF.md` §1–2): start a plan review from Claude Code, close Claude Code; within 15s `hypermark sessions` shows none, and the tab shows "Session closed".
- `bun run typecheck && bun run typecheck:editors` green.
