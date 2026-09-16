# 09 — Quick labels are editable from the header

Wave 3 — cut after 03 and 07 are merged. It owns files 03 rewrites.

Spec 03 ships six fixed labels. This spec makes the list yours: a tag button
in the app header opens a popover that lists the labels, and **Add** or the
pencil on a row swaps that popover to a small form. Labels are stored the way
every other setting is (`utils/storage`, a cookie, so they survive the random
port each hook run uses).

```
header:  … [annotations] [tag] [theme] [shortcuts]

click tag ─────────────────┐
┌─ Quick labels ───────────┴──┐      ┌─ Edit label ───────────────┐
│ ✓ Agreed         built in   │      │ Text  [ Needs tests      ] │
│ • Needs explanation  ✎  ×   │      │ Tip   [ Cover this with… ] │
│ • Verify this        ✎  ×   │  ⇄   │ Dot   ● ● ● ● ● ●          │
│ • Give an example    ✎  ×   │      │                            │
│ ⌃⌄ reorder                  │      │ [Cancel]          [Save]   │
│           [ + Add label ]   │      └────────────────────────────┘
└─────────────────────────────┘
```

- **Agreed is built in.** It is the only label comment-only surfaces may emit,
  so it is always first, cannot be edited, renamed or deleted, and shows a
  `built in` note instead of the row's buttons.
- **Reordering** is `↑`/`↓` buttons on each row, not drag: it is keyboard
  operable and far less code for an agent to get right.
- **The composer row follows the stored list** the moment it changes — both
  read the same store.
- **Cookie budget.** Cookies hold about 4KB. The store caps a tip at 240
  characters and the whole list at 24 labels, and refuses to save past that
  with a message in the popover.

## Owned files

- `packages/ui/utils/quickLabels.ts` — the store, the defaults and the cap.
- `packages/ui/utils/quickLabels.test.ts` (new)
- `packages/ui/hooks/useQuickLabels.ts` (new)
- `packages/ui/components/QuickLabelsSettings.tsx` (new)
- `packages/ui/components/Viewer.tsx` — the composer's `quickLabels` prop only.
- `packages/editor/components/AppHeader.tsx` — one import, one element.
- `packages/ui/hooks/useAnnotationHighlighter.ts`,
  `packages/ui/components/html-viewer/useHtmlAnnotation.ts` — only the
  `handleQuickLabel` cleanup in step 6.

## 1. `utils/quickLabels.ts`

Rename spec 03's `COMPOSER_QUICK_LABELS` to `DEFAULT_QUICK_LABELS` and add a
store beneath it. `AGREED_LABEL` stays exactly as it is.

```ts
import { storage } from './storage';

const STORAGE_KEY_QUICK_LABELS = 'hypermark-quick-labels';
/** Cookies hold ~4KB; these caps keep the list well inside that. */
export const QUICK_LABEL_MAX_TIP = 240;
export const QUICK_LABEL_MAX_COUNT = 24;
/** Dot colours offered in the editor; keys of DOT_CLASS in ComposerQuickLabels. */
export const QUICK_LABEL_COLORS = ['green', 'yellow', 'orange', 'cyan', 'red', 'blue'] as const;

/** A label the user may edit: everything except the built-in Agreed. */
export function isEditableQuickLabel(label: QuickLabel): boolean {
  return label.id !== AGREED_LABEL.id;
}

/** kebab-case id derived from the text, made unique against `taken`. */
export function quickLabelId(text: string, taken: readonly string[]): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'label';
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Parses stored JSON, dropping anything malformed. Agreed is always first. */
export function parseQuickLabels(raw: string | null): QuickLabel[] {
  if (!raw) return DEFAULT_QUICK_LABELS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_LABELS;
    const labels = parsed
      .filter((l): l is QuickLabel =>
        !!l && typeof l === 'object'
        && typeof (l as QuickLabel).id === 'string'
        && typeof (l as QuickLabel).text === 'string')
      .filter((l) => isEditableQuickLabel(l))
      .slice(0, QUICK_LABEL_MAX_COUNT)
      .map((l) => ({
        id: l.id,
        emoji: typeof l.emoji === 'string' ? l.emoji : '',
        text: l.text.slice(0, 60),
        color: typeof l.color === 'string' ? l.color : 'blue',
        ...(l.tip ? { tip: String(l.tip).slice(0, QUICK_LABEL_MAX_TIP) } : {}),
      }));
    return [AGREED_LABEL, ...labels];
  } catch {
    return DEFAULT_QUICK_LABELS;
  }
}

export function getQuickLabels(): QuickLabel[] {
  return parseQuickLabels(storage.getItem(STORAGE_KEY_QUICK_LABELS));
}

/** Persists everything except Agreed, which is not the user's to change. */
export function saveQuickLabels(labels: readonly QuickLabel[]): void {
  const editable = labels.filter(isEditableQuickLabel).slice(0, QUICK_LABEL_MAX_COUNT);
  storage.setItem(STORAGE_KEY_QUICK_LABELS, JSON.stringify(editable));
  for (const listener of quickLabelListeners) listener();
}

const quickLabelListeners = new Set<() => void>();

/** Subscribe to saves, so every open composer re-reads the list. */
export function subscribeQuickLabels(listener: () => void): () => void {
  quickLabelListeners.add(listener);
  return () => quickLabelListeners.delete(listener);
}
```

Declare `quickLabelListeners` above `saveQuickLabels` if the file's lint
ordering complains.

## 2. `utils/quickLabels.test.ts` (new)

```ts
import { describe, test, expect } from 'bun:test';
import {
  AGREED_LABEL,
  DEFAULT_QUICK_LABELS,
  parseQuickLabels,
  quickLabelId,
  QUICK_LABEL_MAX_TIP,
} from './quickLabels';

describe('parseQuickLabels', () => {
  test('missing or malformed storage falls back to the defaults', () => {
    expect(parseQuickLabels(null)).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{')).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{"a":1}')).toEqual(DEFAULT_QUICK_LABELS);
  });

  test('Agreed is first and is never taken from storage', () => {
    const stored = JSON.stringify([
      { id: 'agreed', emoji: '', text: 'Hacked', color: 'red' },
      { id: 'needs-tests', emoji: '', text: 'Needs tests', color: 'blue' },
    ]);
    const labels = parseQuickLabels(stored);
    expect(labels[0]).toEqual(AGREED_LABEL);
    expect(labels).toHaveLength(2);
    expect(labels[1]?.text).toBe('Needs tests');
  });

  test('a long tip is truncated', () => {
    const stored = JSON.stringify([
      { id: 'x', emoji: '', text: 'X', color: 'blue', tip: 'y'.repeat(400) },
    ]);
    expect(parseQuickLabels(stored)[1]?.tip).toHaveLength(QUICK_LABEL_MAX_TIP);
  });
});

describe('quickLabelId', () => {
  test('kebab-cases the text', () => {
    expect(quickLabelId('Needs tests!', [])).toBe('needs-tests');
  });
  test('makes it unique', () => {
    expect(quickLabelId('Needs tests', ['needs-tests'])).toBe('needs-tests-2');
  });
});
```

## 3. `hooks/useQuickLabels.ts` (new)

```ts
import { useCallback, useSyncExternalStore } from 'react';
import {
  getQuickLabels,
  saveQuickLabels,
  subscribeQuickLabels,
  type QuickLabel,
} from '../utils/quickLabels';

let snapshot: QuickLabel[] = getQuickLabels();
const refresh = () => { snapshot = getQuickLabels(); };
subscribeQuickLabels(refresh);

/**
 * The quick labels, live: every composer and the settings popover read the
 * same list, and a save re-renders all of them. The snapshot is cached because
 * `useSyncExternalStore` compares it by identity.
 */
export function useQuickLabels(): [QuickLabel[], (next: readonly QuickLabel[]) => void] {
  const labels = useSyncExternalStore(subscribeQuickLabels, () => snapshot, () => snapshot);
  const save = useCallback((next: readonly QuickLabel[]) => saveQuickLabels(next), []);
  return [labels, save];
}
```

## 4. `components/QuickLabelsSettings.tsx` (new)

A header button and the popover it opens. Use the existing `Popover`
(`./Popover`) the way `ThemeModeButton` uses `ActionMenu`: trigger button,
popup anchored below, `side="bottom" align="end"`.

Shape it as one component with two views and this state:

```tsx
type Draft = { id?: string; text: string; tip: string; color: string };
const [draft, setDraft] = useState<Draft | null>(null);   // null = list view
const [labels, save] = useQuickLabels();
const [error, setError] = useState<string | null>(null);
```

List view, one row per label:

- Agreed: the check glyph, its text, and `built in` in
  `text-3xs text-muted-foreground`. No buttons.
- Every other label: its colour dot, its text (truncated, `min-w-0 truncate`),
  then `↑`, `↓`, `✎`, `×` as 20px icon buttons revealed on row hover
  (`opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100`).
  `↑` on the first editable row and `↓` on the last are disabled.
- Below the list: `+ Add label`, which sets
  `draft = { text: '', tip: '', color: 'blue' }`.
- With only Agreed left, the list shows one muted line:
  `No labels yet. Add one to see it above the composer.`

Form view (`draft !== null`):

- `Text` — a single-line input, `maxLength={60}`, autofocused.
- `Tip` — a two-row textarea, `maxLength={QUICK_LABEL_MAX_TIP}`, with the
  remaining count under it, and the hint
  `Sent to the agent with the comment.`
- `Dot` — the six `QUICK_LABEL_COLORS` as 16px circles, the selected one
  ringed.
- `Cancel` clears the draft; `Save` validates and commits:
  - empty text → `error = 'Give the label a name.'`, nothing saved;
  - new label past `QUICK_LABEL_MAX_COUNT` → `error = 'That is as many labels as fit.'`;
  - otherwise build
    `{ id: draft.id ?? quickLabelId(draft.text, labels.map(l => l.id)), emoji: '', text: draft.text.trim(), color: draft.color, ...(draft.tip.trim() ? { tip: draft.tip.trim() } : {}) }`,
    replace it in place when `draft.id` is set or append it when not, `save(next)`,
    then `setDraft(null)`.
- `Escape` inside the form returns to the list without closing the popover
  (`e.stopPropagation()` then `setDraft(null)`).

Export the trigger:

```tsx
export const QuickLabelsButton: React.FC = () => { /* the component above */ };
```

Its button matches `KeyboardShortcutsButton`'s:
`className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"`,
`title="Quick labels"`, `aria-label="Quick labels"`, with a 16px tag icon
(`M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z`
plus a dot at `7 7`).

## 5. Wiring

1. `AppHeader.tsx`: import `QuickLabelsButton` from
   `@hypermark/ui/components/QuickLabelsSettings` and render it directly
   before `<ThemeModeButton />` (line ~182).
2. `Viewer.tsx`: replace the `COMPOSER_QUICK_LABELS` import with
   `import { useQuickLabels } from '../hooks/useQuickLabels';`, call
   `const [quickLabels] = useQuickLabels();` beside the other hooks, and pass
   `quickLabels={quickLabels}` to the hook `CommentPopover`.
   `HtmlViewer.tsx` keeps its fixed `HTML_QUICK_LABELS`: comment-only surfaces
   accept Agreed and nothing else.

## 6. Cleanup

`rg -n "handleQuickLabel" packages apps --glob '!**/dist/**'`. If the only hits
left are the definitions and the return statements in
`useAnnotationHighlighter.ts` and `useHtmlAnnotation.ts`, delete the function,
its entry in the returned object and its line in the hook's return-type
interface, in both files. If anything else calls it, leave both alone and say
so in the commit message.

## Do not

- Do not let the editor touch `AGREED_LABEL`, and do not store it.
- Do not bring back emoji, `LABEL_COLOR_MAP` or the old label picker.
- Do not add drag-and-drop reordering.
- Do not add a settings dialog, a route or a tab: this is one popover.

## Completion

- `bun test packages/ui/utils/quickLabels.test.ts` green.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook`:
  - the header's tag button opens the popover; Agreed is first and marked
    `built in`;
  - `+ Add label`, a name, a tip, a colour, Save → the chip appears above an
    open composer without a reload, and clicking it saves a comment with that
    text; the exported feedback carries the tip;
  - `✎` on that row edits it, `×` removes it, `↑`/`↓` reorder it, and the
    composer row follows each change;
  - reload the page: the list is unchanged;
  - delete every added label: the popover shows the empty line and the
    composer shows the Agreed chip alone.
