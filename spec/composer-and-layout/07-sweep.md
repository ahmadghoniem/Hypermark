# 07 — Sweep: remove what the Messages tab and message picker left behind

Wave 2 — cut from `main` after specs 05 and 06 are merged. Runs in parallel
with 03 (no shared files).

After 05 and 06, `MessagesBrowser` is rendered nowhere, `MessagesIcon` is
imported nowhere, and nothing can open the `'messages'` sidebar tab. Only the
`PickerMessage` type is still in use.

## Owned files

- `packages/ui/components/MessageRail.tsx` — the `PickerMessage` import only.
- `packages/ui/components/sidebar/MessagesBrowser.tsx` (delete)
- `packages/ui/components/icons/MessagesIcon.tsx` (delete)
- `packages/ui/hooks/useSidebar.ts`
- `packages/editor/App.tsx` — the `PickerMessage` import (line 59 at `684b9c6e`) and the `MessageRail` import added by 06.

## Edits

1. **Move `PickerMessage` into `MessageRail.tsx`.** Replace
   `import type { PickerMessage } from './sidebar/MessagesBrowser';` with the
   interface itself, exported:
   ```ts
   /** A recent assistant message offered by annotate-last. */
   export interface PickerMessage {
     messageId: string;
     text: string;
     timestamp?: string;
   }
   ```
2. **`App.tsx` imports.** Replace
   ```ts
   import type { PickerMessage } from '@hypermark/ui/components/sidebar/MessagesBrowser';
   ```
   and
   ```ts
   import { MessageRail } from '@hypermark/ui/components/MessageRail';
   ```
   with one line:
   ```ts
   import { MessageRail, type PickerMessage } from '@hypermark/ui/components/MessageRail';
   ```
3. **Delete** `packages/ui/components/sidebar/MessagesBrowser.tsx`.
4. **`useSidebar.ts` line 11:** `export type SidebarTab = "toc" | "versions";`
5. **Delete** `packages/ui/components/icons/MessagesIcon.tsx` — only if step 6's first search finds no other importer. If one exists, keep the file and report the importer.

## Completion (run in this order)

6. `rg -n "MessagesIcon" packages apps --glob '!**/dist/**'` → nothing (after the delete).
7. `rg -n "MessagesBrowser|'messages'\)|\"messages\"\)" packages apps --glob '!**/dist/**'` → nothing. (`feedbackScope: 'messages'` in `annotateSubmission` is unrelated and stays.)
8. `bun run typecheck && bun run typecheck:editors` green.
9. `bun test` green.
