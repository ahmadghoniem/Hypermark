# 01 — Test pruning

Delete tests that pin removed behaviour or assert the implementation back to
itself. Do not run the suite; the classification below is from reading.

## Owned files

Only the test files named here, plus the one source constant in §3.

## Context

150 test files, 35,172 lines. The classification signals that decide a bucket:

- **A (removed behaviour)**: the test passes options a server no longer
  accepts, or exercises a decoder for a format nothing writes, or only
  references a removed agent.
- **B (self-assertion)**: the test reads a `.ts` source file as text and greps
  it, or hashes a constant and compares it to itself, or asserts that a
  validator accepts the literal set it contains.
- **C (only coverage of something real)**: everything else. 130 files,
  24,839 lines. They stay.

Per-file signals for every test file are in the audit table the spec author
generated; the executor needs only the deletions below.

## 1. Delete — removed behaviour (bucket A)

| File | Lines | Reason |
|---|---|---|
| `packages/server/skills-endpoint.test.ts` | 178 | Starts the plan server with `mode: "archive"` and `customPlanPath` (lines 92–93). Neither option exists on `ServerOptions` since the archive removal; the file cannot compile. The `/api/skills` route it also checks is covered by `packages/server/reference-handlers.test.ts` and `packages/server/api-404-guard.test.ts`. |
| `packages/server/api-404-guard.test.ts` | 149 | **Keep.** The archive commit already dropped its archive case; what remains is the only test that unknown `/api/*` paths return 404 on all three servers rather than the SPA catch-all. Its `./annotate.ts?api-404-guard` import (line 10) is a cache-busting query, not a broken path. Listed here because the audit flagged it. |
| `packages/core/favicon.test.ts` | 68 | Hashes `FAVICON_PNG_BYTES` and compares to a hard-coded digest (line 14). The PNG constants (`core/favicon.ts:5–101`, ~96 lines) have no non-test consumer — `ThemeProvider.tsx:135` calls `faviconDataUrl()` which returns the SVG unconditionally. Delete the test **and** the PNG constants `FAVICON_PNG_BASE64`, `FAVICON_PNG_DATA_URL`, `FAVICON_PNG_BYTES` from `packages/core/favicon.ts`. Keep `isFaviconStyle`, `CLASSIC_FAVICON_SVG`, `CLASSIC_FAVICON_DATA_URL`, `faviconDataUrl`. |
| `packages/ui/utils/annotationSerialization.test.ts` | 169 | Half the file pins the legacy tuple `isQuickLabel` flag (index 5). The quick-label picker is gone; the decoder still reads the flag for old drafts and `parser.ts:1292,1320,1344` still branches on `ann.isQuickLabel`. **Trim, do not delete**: remove the `isQuickLabel` cases; keep the image-encoding tests (`parseShareableImages` describe). Open question for the maintainer, logged in §5: drop `isQuickLabel` from `packages/ui/types.ts:47` and `parser.ts` entirely? That is a follow-up, not this spec. |

## 2. Delete — self-assertion (bucket B)

| File | Lines | Reason |
|---|---|---|
| `apps/hook/server/unknown-subcommand.test.ts` | 102 | Test 1 (lines 12–20) reads `index.ts` as text and regex-extracts `args[0] === "…"` to compare with `KNOWN_SUBCOMMANDS`. That is a grep, not a test. **Trim**: delete that one test; keep `findClosestSubcommand` / `formatUnknownSubcommandError` tests, which cover real output. |
| `apps/hook/server/annotate-output.test.ts` | 120 | The `annotate client-lease call sites` describe (lines ~60–120) reads `index.ts` as text and counts occurrences of `clientLeaseSupported: supportsAnnotateClientLease({`. Spec 10 removes the predicate entirely, so this describe dies with it. **Trim**: delete the describe; keep `annotate stdout` (formatAnnotateOutcome), which is the only test of the JSON/plaintext/hook output shapes. |
| `apps/hook/server/strict-annotate-result.test.ts` | 310 | One test (lines ~144–170) slices `index.ts` source between two string markers and asserts no `process.exit(1)` inside. **Trim**: delete that test; the rest covers result-file serialization and is the only coverage of `--result-file`. |
| `packages/server/live-proxy.test.ts` | 804 | One test (`the proxy origin and bind are always loopback`, line ~511) reads `live-proxy.ts` and asserts on source strings. **Trim**: replace with the runtime assertion already present on the line above (`proxy.origin` is `127.0.0.1`), delete the three `source` expectations. |

Bucket B deletions total: 1 file removed (`favicon.test.ts`, counted in A because its constants are also dead), 4 files trimmed by one test each.

## 3. Source constant that goes with §1

`packages/core/favicon.ts` lines 5–101: the PNG base64 array and its two
derived exports. After removal, `rg -n "FAVICON_PNG" packages apps` returns
nothing.

## 4. Keep, and why (bucket C highlights)

These looked deletable and are not:

- `apps/hook/server/session-log.test.ts` (1,563): the only coverage of Windows
  path casing, `USERPROFILE`, and the PowerShell process-table parser that
  spec 10 relies on.
- `packages/server/annotate.test.ts` (2,319): the only coverage of the
  client-lease tracker (lines 1433–1660) and the draft tombstone protocol. Spec
  10 changes the lease gate; the `advertises the effective client-lease
  capability` test (line 1488) will need its `false` arm removed **by spec
  10**, not here.
- `packages/review-editor/utils/commitViewRestore.test.ts`: the audit flagged
  it as viewed-feature leftovers. It is not; it tests `isCommitDiffType`, which
  the worktree parser depends on. Keep.
- Every test mentioning `codex`/`OpenCode` in a comment or a skill-root
  fixture (`review-skill-loader.test.ts`, `skillReferences.test.ts`,
  `shared-handlers.test.ts:112`): the code still scans `~/.codex/skills` as a
  skill root and detects Codex Desktop's bundle id. Whether *that* should go is
  a spec 09 question; the tests are correct today.

## 5. Open questions (for the maintainer, not the executor)

1. `isQuickLabel` survives in `types.ts`, `parser.ts` (3 sites) and the tuple
   decoder for old drafts. Drafts older than the branch are unlikely to exist
   on a single-user machine. Drop the field? ~20 lines.
2. `~/.codex/skills` as a skill root (`review-skill-loader.ts`, 9 refs) and the
   Codex Desktop host check (`shared-handlers.ts:198`). Both are dead on a
   Claude-only machine. ~30 lines.

## Completion

- `rg -n "FAVICON_PNG" packages apps` → nothing.
- `rg -n "mode: \"archive\"|customPlanPath" packages apps` → nothing.
- `rg -n "readFileSync\([^)]*import\.meta\.dir[^)]*\.tsx?\"" packages apps -g '*.test.ts'` → nothing (no test reads a source file as text).
- `bun run typecheck && bun run typecheck:editors` green.
- Net: 2 files deleted (`skills-endpoint.test.ts`, `favicon.test.ts`), 5 trimmed, ≈ 450 lines removed including the PNG constants.
