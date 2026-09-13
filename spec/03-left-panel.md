# 03 — Left panel: Messages tab

The Messages panel in the plan app's left sidebar loses its heading, its star
and its index gutter. (The Files tab is removed entirely by spec 13, together
with folder annotate.)

## Owned files

- `packages/ui/components/sidebar/MessagesBrowser.tsx`

## Messages panel

`MessagesBrowser.tsx` is 109 lines. Three edits, all inside the `return` at
lines 60–107.

1. **Heading.** Delete the `<div className="px-2 pt-1 pb-2 text-[10px] …">Recent messages — newest first</div>` (lines 62–64). The tab label already says Messages; the list order is visible from the timestamps.
2. **Star.** The `#N` span (lines 82–85) appends `" ★"` when `idx === 0`. Delete the conditional; the first row is already first.
3. **Gutter.** The same span is `w-8 shrink-0 text-right` — a fixed 32px column for a two-character index. **Drop the index span entirely.** The rows carry a timestamp and a preview, so the row becomes `[preview + timestamp][count badge]`.

After the edit the row's text starts at `px-2` from the button edge. Verify in
the browser that `line-clamp-2` now clips later for a typical message (run
`bun run dev:hook`; the mock serves no messages — temporarily seed
`recentMessages` in `apps/hook/dev-mock-api.ts`; do not commit the seed).

## Completion

- `rg -n "newest first|★" packages/ui/components/sidebar/MessagesBrowser.tsx` → nothing.
- `rg -n "w-8 shrink-0" packages/ui/components/sidebar/MessagesBrowser.tsx` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
