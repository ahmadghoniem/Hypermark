# 02 — Duplication and cross-app consistency

Collapse the helpers `packages/editor`, `packages/review-editor` and
`packages/ui` grew separately, and make the two apps read as one product where
that costs a rename rather than a redesign. Runs in wave 4, after every other
UI spec, so it repoints the final imports.

## Owned files

- `packages/review-editor/utils/generateId.ts` (delete), `packages/review-editor/App.tsx:28` (import)
- `packages/ui/hooks/useCodeAnnotationDraft.ts`, `packages/ui/hooks/useAnnotationDraft.ts` (shared helpers only)
- `packages/ui/components/core/button.tsx` (delete), `packages/ui/components/goal-setup/GoalSetupSurface.tsx:23` (import)
- `packages/editor/hooks/useHtmlRefresh.ts` (rename)
- `packages/review-editor/components/ReviewHeader.tsx` (new), `packages/review-editor/App.tsx:1996–2184` (extract)
- `packages/editor/utils/` (new directory; moves only)

## 1. Duplicate helpers — survivors

| Pair | Survivor | Edit |
|---|---|---|
| `review-editor/utils/generateId.ts` (2 lines, `Math.random`) vs `ui/utils/generateId.ts` (7 lines, `crypto.randomUUID` with fallback) | `ui` | Delete the review-editor file. Repoint the one import at `review-editor/App.tsx:28` to `@hypermark/ui/utils/generateId`. Call sites at 843 and 869 pass no prefix; unchanged. |
| `readDraftGeneration`, `formatTimeAgo`, `DEBOUNCE_MS` defined twice: `ui/hooks/useAnnotationDraft.ts:25,242,246` and `ui/hooks/useCodeAnnotationDraft.ts:12,20,24` | `useAnnotationDraft.ts` | Export the three from `useAnnotationDraft.ts` and import them in `useCodeAnnotationDraft.ts`, which already imports `getDraftTransport` from there. Spec 10 edits both hooks in wave 1; do this after rebasing on it. |
| `ui/components/core/button.tsx` (50 lines, hand-rolled `cx`, variants `primary/outline/ghost/icon/danger`) vs `ui/components/ui/button.tsx` (83 lines, cva + Base UI, variants `default/destructive/success/outline/secondary/ghost/link`) | `ui/button.tsx` | `core/button.tsx` has exactly one consumer, `GoalSetupSurface.tsx:23`, using `ghost` ×3 (`size="sm"`), `info` ×1 (line 986) and `warning` ×1 (line 423). Neither `info` nor `warning` exists in either file — they are already silently falling through to the base classes. Repoint the import to `../ui/button`, map `info`/`warning` → `secondary`, keep `ghost`/`sm`. Delete `core/button.tsx`. If spec 09's goal-setup question resolves to "cut", this row is moot; do it anyway so the tree is consistent in the interim. |
| `editor/hooks/useHtmlRefresh.ts` (92) wraps `ui/hooks/useHtmlRefresh.ts` (158) under the same exported name | Both stay; rename the wrapper | Rename the editor file and its export to `useAnnotateHtmlRefresh` (one import, `editor/App.tsx:125`). Same-name re-wraps are what the audit misreads as duplicates. |

Not duplicates, verified: `annotateDecision.ts` (62) vs `reviewDecision.ts`
(155) route to different transports; the two "Draft Recovered" dialogs are one
shared `ConfirmDialog` with app-specific messages, and spec 10 deletes both
anyway; `review-editor/components/AnnotationToolbar.tsx` vs
`ui/components/AnnotationToolbar.tsx` are different components (line-comment
composer vs. selection toolbar) — spec 07 retires the review one.

## 2. Consistency — one convention each

| Concern | Today | Convention | Edit in this spec |
|---|---|---|---|
| Header | Plan: `editor/components/AppHeader.tsx` (306 lines, prop-driven). Review: 190 lines of JSX inline at `review-editor/App.tsx:1996–2184`. | Each app has `components/<App>Header.tsx`. | Extract `ReviewHeader.tsx` from lines 1996–2184. Props are the values the JSX reads; keep it a mechanical lift, no behaviour change. Target: `review-editor/App.tsx` loses ≥180 lines. |
| Decision-control props | Plan passes `{ spec, handlers, closeTitle }` as one `annotateDecision` object into `AppHeader`. Review passes `reviewDecisionSpec` and `reviewDecisionHandlers` loose. | The object form. | `ReviewHeader` takes `decision: { spec, handlers }`. |
| File layout | `editor/` has 14 loose `.ts` modules at package root (`annotateSubmission.ts`, `directEdits.ts`, `editableDocuments.ts`, `sourceDocument*.ts`…) and `hooks/`. `review-editor/` has `components/`, `hooks/`, `utils/` (34 files), `dock/`. | `components/`, `hooks/`, `utils/` in both. App-root files: `App.tsx`, `index.tsx`, `types.ts`, the decision router, demo data. | Move editor's loose modules into `editor/utils/` with `git mv` (tests move alongside). Repoint imports (all inside `packages/editor`; `rg -n "from './" packages/editor/App.tsx` lists them). Leave `annotateDecision.ts`, `annotateClientLease.ts`, `demoPlan*.ts` at root. |
| Sidebar card callbacks | Plan `AnnotationPanel`: `onSelect/onDelete/onEdit` per card, `onEditCodeAnnotation` at panel level. Review `ReviewSidebar`: `onSelectAnnotation/onDeleteAnnotation/onNavigateToAnnotation`. | Panel-level props are verb+`Annotation` (`onSelectAnnotation`, `onDeleteAnnotation`, `onEditAnnotation`); card-level props are the bare verb. | Rename `AnnotationPanel`'s panel-level `onEdit`/`onDelete`/`onSelect` (lines 102–148) to the suffixed form; three call sites in `editor/App.tsx`. Leave card-level names. |
| Annotation vs comment nouns | Plan: `Annotation`; review: `CodeAnnotation` in code, "Comment" in UI copy (`title="Comment"`, `Add Comment`). | Code says annotation, UI says comment, in both apps. | No code edit; spec 04 and 07 own the copy. Note only. |

## Open questions

1. Should `review-editor/utils/` (34 files) be audited for modules that belong
   in `ui/utils`? Out of scope here — nothing in `editor` imports them, so they
   are not duplicates yet. Flagged for a later pass.

## Completion

- `ls packages/review-editor/utils/generateId.ts packages/ui/components/core/button.tsx` → both missing.
- `rg -n "^function (readDraftGeneration|formatTimeAgo)|^const DEBOUNCE_MS" packages/ui/hooks` → exactly one hit each, in `useAnnotationDraft.ts`.
- `rg -n "export function useHtmlRefresh" packages/editor` → nothing.
- `ls packages/review-editor/components/ReviewHeader.tsx` exists; `rg -c "<header" packages/review-editor/App.tsx` → 0.
- `ls packages/editor/*.ts | wc -l` ≤ 8 (App-root modules only).
- `bun run typecheck && bun run typecheck:editors` green.
- Then run `bun run --cwd packages/ui knip` or root `bunx knip` (spec 11 owns the config): no new unused exports introduced.
