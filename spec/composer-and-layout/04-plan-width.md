# 04 — One dialled column width, and the table of contents is always on

Wave 1 — needs 08 (DialKit) merged.

Two preferences go. Neither has a UI any more (nothing calls
`saveUIPreferences`), so both have been stuck at their stored default.

1. **`planWidth` goes.** Three widths named `compact`, `default` and `wide`,
   where `default` was not the default (`compact` was), is a setting nobody
   can change and a name that lies. One constant replaces them, dialled in the
   DialKit panel: the document is read in a centred column with a gutter on
   each side, Obsidian-style, and the left gutter is where the table of
   contents lives.
2. **`tocEnabled` goes.** The table of contents is always on: the sidebar
   opens itself when the document has headings, as it does today with the
   preference at its default.

`UIPreferences` keeps `stickyActionsEnabled` alone.

## The widths on the dial

Body text renders around 16px, so a character averages about 8.5px. The
options are the measures that read well at that size, each a multiple of 16:

| px | ≈ characters | |
|---|---|---|
| 672 | 62 | Obsidian's readable line length |
| 752 | 70 | top of the classic 45–75 range |
| 832 | 77 | today's `compact`, and the default here |
| 912 | 85 | more room for wide code and tables |
| 1040 | 97 | the old `default` |

## Owned files

- `packages/ui/utils/uiPreferences.ts`
- `packages/editor/App.tsx` — lines 35, 382, 579–588, 1145–1165 and
  2221–2224 only.

## Edits

### `packages/ui/utils/uiPreferences.ts`

Replace the whole file with:

```ts
import { storage } from './storage';

const STORAGE_KEY_STICKY_ACTIONS = 'hypermark-sticky-actions-enabled';

export interface UIPreferences {
  stickyActionsEnabled: boolean;
}

export function getUIPreferences(): UIPreferences {
  return {
    stickyActionsEnabled: storage.getItem(STORAGE_KEY_STICKY_ACTIONS) !== 'false',
  };
}

export function saveUIPreferences(prefs: UIPreferences): void {
  storage.setItem(STORAGE_KEY_STICKY_ACTIONS, String(prefs.stickyActionsEnabled));
}
```

`PlanWidth`, `PLAN_WIDTH_OPTIONS`, `STORAGE_KEY_TOC` and `STORAGE_KEY_PLAN_WIDTH`
are gone. The `hypermark-toc-enabled` and `hypermark-plan-width` cookies are
left where they are; nothing reads them now and they expire on their own.

### `packages/editor/App.tsx`

1. Line 35 becomes two lines:
   ```ts
   import { getUIPreferences } from '@hypermark/ui/utils/uiPreferences';
   import { useDialKit } from 'dialkit';
   ```
2. Line 382: delete `const lastAppliedTocEnabledRef = useRef(uiPrefs.tocEnabled);`.
3. Lines 579–588: delete the whole "Sync sidebar open state when the
   *Auto-open Sidebar* preference changes" effect with its comment. There is no
   preference left to sync.
4. Lines 1145–1165, the auto-open effect: drop the preference from the
   condition and from the dependency array, so the tail reads:
   ```tsx
       if (hasTocEntries) {
         sidebar.open('toc');
       }
     }, [
       hasTocEntries,
       isLoading,
       renderAs,
       sidebar.close,
       sidebar.open,
       wideModeType,
     ]);
   ```
   Leave the `blocks.length`, `isLoading`, `wideModeType` and
   `renderAs === 'html'` guards above it untouched.
5. Lines 2221–2224, `planMaxWidth`, become:
   ```tsx
     // Reading column. One width, dialled: the document is centred with a
     // gutter on each side, and the left gutter holds the table of contents.
     const layoutDials = useDialKit('04 · Layout', {
       columnWidth: {
         type: 'select',
         options: ['672', '752', '832', '912', '1040'],
         default: '832',
       },
     }, { id: 'cl-04', persist: true });
     const planMaxWidth = Number(layoutDials.columnWidth);
   ```
   It must stay above the `if (isLoading)` early return (line 2303) — hooks
   cannot run after it. `useMemo` is gone, and so is its `uiPrefs.planWidth`
   dependency; `planMaxWidth` is a number either way, so its four call sites
   (2417, 2430, 2453, 2514, 2546 through `annotateReaderMaxWidth`) need no
   change.

## Do not

- Do not touch the `Wide | Focus` view-mode toggle or `annotateReaderMaxWidth`
  (line 2225). Spec 10 removes that whole feature in wave 3.
- Do not remove `stickyActionsEnabled`; it is still read at lines 2404 and 2538.
- Do not change `useSidebar(false)` at line 491. The auto-open effect is what
  opens the sidebar, once the document's blocks parse.

## Completion

- `rg -n "tocEnabled|planWidth|PlanWidth|PLAN_WIDTH_OPTIONS" packages apps --glob '!**/dist/**'` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook` on a plan with headings:
  - the table of contents opens by itself, and closing it by hand keeps it
    closed for that document;
  - the document sits in a centred 832px column with a gutter on each side;
  - the DialKit panel shows an **04 · Layout** section, and changing
    `columnWidth` resizes the column immediately and survives a reload.
