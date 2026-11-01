---
name: verify-annotate
description: Launch, check, drive, prove and bug bash Hypermark's annotate app (the browser UI a `hypermark annotate <file>` session serves) with e2e. Use before claiming an annotate UI change works, when asked to verify, screenshot or bug bash the annotate app.
---

# Verify the annotate app

Read the e2e skill first (`npx e2e guide` prints it; `npx e2e guide <topic>` prints one
reference). This skill only says what is true of Hypermark. The config is `e2e.config.ts`
(one target, `web`; tests are the default glob, today `tests/e2e/**/*.e2e.ts`). The
features and their charters are in [features/](features/README.md).

## Launch

The target's `app.command` runs a real CLI session, `bun src/cli/index.ts annotate
tests/e2e/fixtures/annotate.md`, on the built `dist/annotate/index.html`. The CLI reads
that file once at start, so build first after any UI change:

```bash
bun run build:annotate                     # or `bun run test:e2e`, which builds and runs every test
```

The runner picks a free port (`url: http://127.0.0.1:0`, passed as `HYPERMARK_PORT`),
starts the CLI, waits for the URL and stops it after the run. Nothing to start by hand,
and runs never collide. The command's env:

- `HYPERMARK_SKIP_BROWSER_OPEN=1`: no tab opens on the desktop.
- `HYPERMARK_DATA_DIR`: a temp dir per run (`hm-e2e-*`, also in `HM_E2E_DATA_DIR`), so
  drafts and the feedback archive never reach `~/.hypermark`. Removed when the run ends.
- `HYPERMARK_SIDE_CHAT_STUB=1`: side questions stream a fixed answer
  (`SIDE_CHAT_STUB_ANSWER` in `src/server/side-chat.ts`) instead of calling Claude Code.
- `SystemRoot`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`: passed through; bun on Windows
  needs them.

No seeds or accounts: the fixture markdown is the data. The CLI's stdout and stderr
(including the feedback text a send prints) append to `.e2e/logs/app.log`.

Do not verify against `bun run dev:annotate` (the dev mock on :3000). It fakes the API,
drafts and the side chat; a proof there says nothing about a real session.

## Doctor

```bash
npx e2e list                                            # loads the config, starts nothing; exit 0, one line per test
E2E_TELEMETRY_DISABLED=1 npx e2e run tests/e2e/smoke.e2e.ts   # exit 0
```

The smoke test opens the session, pins the `Rollout plan` heading and two lines of the
fixture, and fails on any console error or failed request (`/api/draft`'s 404 with no
draft saved is expected). `list` failing is the config or a dependency. `run` failing on
the heading with an old-looking page is a stale `dist/annotate`: rebuild. Run Doctor
first whenever anything looks off.

## Drive

Live: the `e2e mcp` server is not registered for this project yet. Register it with
`claude mcp add --scope project e2e -- npx e2e mcp`, start a new Claude Code session, then
`open_session`, `observe`, the verbs, and `locate` before writing any locator (topic
`mcp`). No project tools or credentials.

Scripted: a test under `tests/e2e/`, `screen` for every control in the feature map (all
have accessible names). Text selection goes through `tests/e2e/select-text.ts`
(`selectText(browser, screen, text)`, a real mouse drag across a text node's box); a
partial selection inside a block needs a `Range` rect instead. Wait on conditions (a
visible element, a focused field, a card count), never on sleeps.

`agent.act` runs on the decision models in the config (`default` is Liquid's
`d1-ultra`, `LIQUID_API_KEY`; `drex` is Nace's, `NACE_API_KEY`; both from `.env`). They
pick taps, drags and key presses on controls only: no text nodes, no typing, and no
`agent.assert`/`waitFor`/`extract`. Agent tests carry the `agent` tag and skip without
the key (`tests/e2e/agent/comment.e2e.ts`).

## Evidence

Every run writes `.e2e/report.json`. `--trace on` writes `results/<test>/trace.md` for
passing tests too, `--video` records each attempt, and `app.screenshot('<name>')` saves a
named frame. The next run clears `.e2e/results/`, Doctor included, so a proof that must
outlive it runs with `--output .e2e/proof/<name>`:

```bash
E2E_TELEMETRY_DISABLED=1 npx e2e run tests/e2e/comment.e2e.ts --trace on --output .e2e/proof/comment
```

A proof selects text with the mouse, types in the composer and presses its buttons, as a
reviewer does, and captures the action and the state after it, not only the final screen.
Side effects live in the session's data dir and the CLI's output:

- Drafts: `$HM_E2E_DATA_DIR/drafts/` (a test reads it with `node:fs`; workers inherit
  the variable). Gone when the run ends, so assert on it inside the test.
- Sent feedback: the CLI prints it to `.e2e/logs/app.log` and archives it under
  `$HM_E2E_DATA_DIR/feedback/<project>/` (`index.jsonl` plus `records/`).
- Side chat: nothing persists with the stub; the answer shows only on screen.

Mock only the side chat's model call (the stub). Never drive internal setters or
`window` hooks to create annotations.

## Bug bash

Unproven: `e2e explore` needs a tool-calling LLM, and this project has only decision
models. When one is available, write `e2e.bugbash.config.ts` (untracked) per topic
`bug-bash`: spread `e2e.config.ts`, add `tests/bugbash/**/*.e2e.ts` to the tests, give
`default`, `skeptic` and `fuzzer` personas the model with 40+ `maxSteps` and
`maxModelCalls`, and this `context`: "A local Hypermark annotate session on one fixture
file. The side chat answers with one fixed sentence. Not bugs: All good, Send Feedback
and Close session end the session, after which the page shows the completion screen and
the server stops; the dev canvas is not part of the app." Keep the config's port `0`, so
each explorer gets its own session; no accounts to seed. Charters come from the feature
map, already in `slug|target|agent|charter` form. `.e2e/bugbash/` and `.e2e/proof/` are
in `.gitignore`. A finding is a bug once `tests/bugbash/<slug>.e2e.ts` fails with
`ASSERTION_FAILED` on the assertion that encodes it.

## Cleanup

The runner stops the CLI it started and `close_session` stops the one a session started.
A `hypermark` session or dev server the user started is theirs; stop only what you
started, by its pid, never by process name (`bun` and `node` run the user's own
sessions). The run's data dir removes itself. Remove `.e2e/bugbash/<slug>/` for a charter
whose findings were all rejected. Keep `.e2e/results/`, `.e2e/proof/`,
`.e2e/report.json` and `.e2e/logs/app.log`: that is the proof, and all of it is
gitignored.

## Helpers

`tests/e2e/select-text.ts` (imported by tests, see Drive). Otherwise the e2e CLI is the
helper.
