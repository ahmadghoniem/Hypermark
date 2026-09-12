# 06 — Input method default, and scrollbar arrows

Two small, independent fixes.

## Owned files

- `packages/ui/utils/inputMethod.ts`
- `packages/ui/utils/preferenceTtl.ts` (one comment)
- `packages/ui/theme.css` (the scrollbar block at lines 445–452)

## 1. Input method opens on Select

`inputMethod.ts` keeps two preferences: `hypermark-input-method` for markdown
(`DEFAULT_METHOD = 'drag'`, which the toolstrip labels **Select**) and
`hypermark-input-method-html` for raw-HTML sessions
(`DEFAULT_HTML_METHOD = 'pinpoint'`). The HTML record carries a `savedAt` and
expires after seven days (`preferenceTtl.ts`), after which the session falls
back to Pinpoint; a pre-TTL plain-string record is treated as expired too.

So "Pinpoint opens as the default every time" is the HTML-surface behaviour by
design: an explicit switch lasts a week, and a lapsed one resets to Pinpoint.
On the maintainer's machine most sessions are more than a week apart, so the
reset fires on nearly every open.

Edit, in `inputMethod.ts`:

1. `DEFAULT_HTML_METHOD = 'drag'` (line 12). Update the comment above it: HTML
   sessions open on Select like every other surface; Pinpoint is one Alt-tap
   away (`useInputMethodSwitch`).
2. Drop the TTL for the HTML key: `parseHtmlRecord` returns
   `parseInputMethod(record.m)` without the `isStalePreference` check, and
   `saveInputMethod` for `'html'` writes the plain method string, matching the
   markdown key. Keep reading the `{ m, savedAt }` shape for records already on
   disk (`JSON.parse` succeeds → use `m`; fails → treat the raw string as the
   method).
3. `refreshInputMethodStamp` becomes a no-op wrapper — delete it and its one
   call at `editor/App.tsx:3269` (this spec may touch that single line;
   spec 10 owns the rest of `App.tsx` in wave 1 and this lands in wave 2).
4. `preferenceTtl.ts` still serves `htmlChrome.ts` (tools hidden, drawer
   state). Remove "input method" from its doc comment; leave the module.

The resolution function stays pure; update its tests if any exist
(`rg -n inputMethod packages/ui --type ts -g '*.test.*'` — currently none).

## 2. Scrollbar stepper arrows

`theme.css:449–452` sets `scrollbar-width: thin; scrollbar-color: …` on `*`
and deliberately avoids `::-webkit-scrollbar` (the comment cites #354, the
6px-rail grab bug). Chromium on Windows still paints stepper arrows at both
ends of a `thin` scrollbar; Firefox does not.

Add, after that rule:

```css
/* Windows Chromium paints stepper arrows at both ends of every scrollbar.
   Hide the buttons only; the rail width stays the standard `thin` (#354). */
::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
```

Setting only `::-webkit-scrollbar-button` does not switch Chromium out of
standard-property mode for the rail itself, so `thin` is preserved. Verify in
Edge or Chrome on Windows (`WINDOWS-HANDOFF.md` §3); on Linux Chromium the
arrows are not painted and the rule is a no-op.

This applies to both apps because `theme.css` is shared. The brief names the
review app; the plan app has the same rails and gets the same fix.

## Open questions

1. Should the HTML surface keep a distinct preference key at all now that its
   default matches markdown? Collapsing to one key removes ~30 more lines. Not
   done here because a raw-HTML page may still genuinely want Pinpoint as a
   sticky choice.

## Completion

- `rg -n "DEFAULT_HTML_METHOD = 'pinpoint'|refreshInputMethodStamp|isStalePreference" packages/ui/utils/inputMethod.ts packages/editor/App.tsx` → nothing.
- `rg -n "::-webkit-scrollbar-button" packages/ui/theme.css` → one hit.
- Behaviour, `bun run dev:hook` with cookies cleared: the toolstrip opens with **Select** active.
- `bun run typecheck && bun run typecheck:editors` green.
