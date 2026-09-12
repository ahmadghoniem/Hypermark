# What has been removed from Hypermark — a leftovers map for Fable

Branch `ui-decluttering-pass`, 18 commits ahead of `main`. Net across the branch:
**540 files changed, 6,671 insertions, 41,634 deletions.**

This document exists so you can hunt dead code without re-deriving the branch
history. Every claim below carries a `file:line` or a commit sha. The codebase at
`HEAD` is the source of truth; `spec/01`–`spec/06` predate the branch and are
quoted here only so you know which passages need rewriting.

**Read this before Workstream A.** Several sections point at leftovers the old
spec still documents as live features.

---

## Contents

| # | Feature | Removal status |
|---|---|---|
| 1 | Compact / mobile touch shell | **Badly incomplete** — largest leftover on the branch |
| 2 | Open-in-app / external editor launching | Complete, except a second VS Code launcher survives untouched |
| 3 | WebMCP / browser-agent tool surface | Complete |
| 4 | Token hover cards + code-nav hover route | Complete in code; `AGENTS.md` still documents the route |
| 5 | Image annotator | Complete |
| 6 | Conventional Comments / edit-to-suggest | **Incomplete** — dead props and a user-visible phantom shortcut |
| 7 | Remote / SSH / tailnet mode | Complete in code; docs and fixtures stale |
| 8 | Close vs. Discard merge | Complete, but left an orphaned compact-row module |
| 9 | Permission-mode select + first-run dialog | Complete; one dead wire field |
| 10 | Auto-close setting, release check, "(me)" attribution, look-and-feel chooser, file browser directories | Complete |
| 11 | Codex/Copilot session adapters, crypto, compress | Complete |
| 12 | Staging (git add) controls | **Incomplete** — decoration pipeline survives with no producer |
| 13 | `adr/`, `docs/`, `bin/`, `build/`, `SECURITY.md` | Complete; broken links remain |
| 14 | Shortcuts panel rework | Complete; exposed two pre-existing registry defects |
| 15 | General settings tab gating | Complete |
| 16 | Plan-mode approval fallback | Complete |

---

## 1. Compact / mobile touch shell

### What it was

Hypermark rendered a second, phone-shaped application shell: a 52px three-region
header with 44px tap targets, a full-screen plan navigator that slid over the
document, touch-sized rows inside every shared control, and a set of
"compact-only" surfaces (`CompactPlanReview`, `CompactPlanStage`,
`CompactEditControls`, `CompactAnnotationControls`) that replaced the desktop
document view entirely below 1024px on a coarse pointer. The desktop header's
buttons were demoted to menu rows there, because the trailing header region was
only one tap target wide.

### When and where it went

Commit `7bcc1212` ("the plugin stops trying to be a launcher") carried the
compact plan-surface removal as an unseparable side-load. Deleted:

| File | Lines |
|---|---|
| `packages/editor/compactPlanSurface.ts` | 42 |
| `packages/editor/compactPlanSurface.test.ts` | 35 |
| `packages/editor/components/CompactPlanReview.tsx` | 167 |
| `packages/editor/components/CompactPlanStage.tsx` | 101 |
| `packages/editor/components/CompactEditControls.tsx` | 85 |
| `packages/editor/components/CompactAnnotationControls.tsx` | 132 |

Commit `3d5b3b2e` ("the document gets its controls and its centring back") is the
repair commit: the removal had orphaned `toggleViewMode` and
`handleEditExitClick`, broken the document's `flex justify-center`, and left
`canUseWideMode || canEditMarkdown` as a bare JSX expression that React rendered
as literal text on the page. That is the shape of damage this removal did.

### What the old spec still claims

`spec/02-feature-removal-and-claude.md:38`:

> Document options keep Theme, Settings, Agent Instructions, Download
> Annotations, and version/history controls. Review keeps Set up review view,
> Agent Instructions, and unrelated retained functionality. **Apply removals to
> desktop and compact/touch layouts.**

`tests/UI-TESTING.md:372` still lists a manual test step:

> 7. **Compact/touch** (real phone or DevTools device mode, both apps). The
>    header menu carries a …

`tests/UI-TESTING.md:343` still requires testing "on desktop AND on a real phone
(touch has no `Mod+Enter`…)".

`AGENTS.md` refers to compact/touch as a live surface at lines 205, 227, 237–238,
244, 329, 340 and 723 — line 723 in particular documents `compactDocumentActions`
and a "Refresh from disk" Options row that cannot render.

### Verified leftovers

**The gate is never set.** Nothing in the tree assigns `compactTouchLayout={true}`
or writes `data-pn-compact-touch-layout`. The single `<AppHeader>` call site
(`packages/editor/App.tsx:4223-4265`) passes none of the four compact props, so
`compactTouchLayout` defaults to `false` at
`packages/editor/components/AppHeader.tsx:112` and every branch below is dead.

The hook that *would* set it is imported and never called:

- `packages/editor/App.tsx:53` — `import { useCompactTouchLayout, useIsMobile }` (only `useIsMobile` is used, at `:552`, `:553`)
- `packages/review-editor/App.tsx:91` — `import { useCompactTouchLayout }`, zero call sites in that file
- `packages/ui/hooks/useIsMobile.ts:36-54` — `useCompactTouchLayout()`, no callers anywhere
- `packages/ui/hooks/useIsMobile.ts:4` — `COMPACT_TOUCH_LAYOUT_MAX_WIDTH`, referenced only by the query on `:13`
- `packages/ui/hooks/useIsMobile.ts:12-13` — `COMPACT_TOUCH_LAYOUT_MEDIA_QUERY`, referenced only by the dead hook

**Dead props and branches in `packages/editor/components/AppHeader.tsx`** (403 lines total):

- `:39-47` prop declarations — `compactTouchLayout`, `compactDocumentTitle`, `compactSessionActions`, `compactDocumentActions`
- `:11` `import type { CompactPlanAction }`
- `:112`, `:116`, `:117`, `:118` destructuring with defaults
- `:155`, `:157` ternaries whose compact arm is unreachable
- `:158-171` the `CompactPlanNavigatorTrigger` arm
- `:172-181` the compact document-title region
- `:182` conditional class
- `:183`, `:205`, `:226`, `:291`, `:318` — five `!compactTouchLayout &&` guards that are now always true
- `:278` `compact={compactTouchLayout}` passed to `HtmlSurfaceControls`
- `:352-354` the three compact props forwarded to `PlanHeaderMenu`
- `:361-390` `CompactPlanNavigatorTrigger` — exported, single caller is the dead arm at `:160`
- `:369`, `:372`, `:373`, `:374`, `:382` — `pn-compact-*` ids and `data-pn-touch-target` attributes inside it

**Dead props and branches in `packages/ui/components/PlanHeaderMenu.tsx`** (260 lines total):

- `:30-32` prop declarations
- `:35-41` `export interface CompactPlanAction` — a 12-member `id` union
- `:47-49` destructuring with defaults
- `:55` `if (!compactTouchLayout && !agentInstructionsEnabled) return null;` — the first clause is always true, so this collapses to `if (!agentInstructionsEnabled) return null`
- `:60-62` compact `panelClassName`
- `:66-70` compact id and touch-target attributes on the trigger
- `:86-95`, `:97-106` the two `CompactActionSection` blocks
- `:108-133` the compact Theme row
- `:134-…` the compact Settings/Download rows
- `:165-190` `CompactActionSection` — only callers are the two dead blocks
- `:191-…` `CompactPlanActionIcon` — only caller is `CompactActionSection`

**`HtmlSurfaceControls` compact seam** — `packages/ui/components/HtmlSurfaceControls.tsx:66`
(`compact?: boolean`), `:78` (default `false`), `:81` (`if (compact) return null`).
Its only caller is the dead `AppHeader.tsx:278`.

**The sidebar's overlay presentation is unreachable.**
`packages/editor/App.tsx:4118` declares `const renderPlanSidebar = (presentation: 'desktop')` —
the parameter type has one member, and the one call site (`:4361`) passes
`'desktop'`. So `packages/ui/components/sidebar/SidebarContainer.tsx:131`
(`const compact = presentation === "overlay"`) is permanently `false`, killing:

- `SidebarContainer.tsx:25` the `"desktop" | "overlay"` union (one live member)
- `:135-136`, `:139-…` the compact focus and key-handling effects
- `:166-177` compact dialog role, `aria-modal`, `pn-compact-plan-navigator` id, `data-pn-plan-navigator`
- `:172-174` the `pn-visible-viewport-stage` class arm
- `:177-202` the compact close-button header, including `data-pn-touch-target` at `:189-190`
- `:203-206` compact content class arm
- `:236`, `:259`, `:269`, `:293`, `:316` — five `touch={compact}` props
- `:398-404` the `touch?: boolean` prop on the tab component, its `data-pn-touch-target` and its `h-9` class arm

**Dead CSS in `packages/ui/theme.css`** (1,129 lines total). These selectors have
no element that can match them:

- `:207-222` — `[data-pn-document-scroll="true"]` rules. The attribute is written nowhere in the tree.
- `:296-311` — `[data-pn-plan-navigator="true"]` rules (4 blocks). Only writer is the unreachable `SidebarContainer.tsx:167`.
- `:316-319` — `[data-pn-compact-plan-stage="true"]` rules. `CompactPlanStage.tsx` was deleted in `7bcc1212`; the attribute is written nowhere.
- `:363-399` — the whole `html:has([data-pn-compact-touch-layout='true'])` family (5 rule blocks incl. a `prefers-reduced-motion` variant). The root marker is never written, so every `data-pn-touch-target` attribute in the tree is inert.
- `:279-294` — `.pn-visible-viewport-stage`, whose only consumer is the unreachable `SidebarContainer.tsx:173`.

**Inert `data-pn-touch-target` attributes** — 15+ call sites now render an
attribute nothing styles: `packages/review-editor/components/DiffOptionsPopover.tsx:116-117`,
`PRSelector.tsx:100,114`, `ReviewHeaderMenu.tsx:55-56`, `ReviewSidebar.tsx:114,441-442,596`,
`ReviewSubmissionDialog.tsx:488,501,509`, `StackedPRLabel.tsx:152,192,230,277`,
`packages/ui/components/PlanHeaderMenu.tsx:67-68`,
`packages/ui/components/sidebar/SidebarContainer.tsx:189-190,403`.

**Stale comments describing the removed shell** —
`packages/editor/App.tsx:1805-1806`, `:4607-4608` (both name `compactDocumentActions`);
`packages/review-editor/components/DiffViewer.tsx:632-636`;
`packages/review-editor/dock/ReviewDockRightActions.tsx:11-13`;
`packages/ui/components/PlanHeaderMenu.tsx:19-22`;
`packages/ui/hooks/useIsMobile.ts:32-35`;
`packages/editor/App.tsx:4266-4271` (the `ScrollViewportProvider` comment justifying
its position by "the compact navigator renders the SAME TableOfContents").

**One dead callback the removal left behind.**
`packages/review-editor/components/DiffViewer.tsx:638-640` defines
`handlePierreLineSelectionChange`, documented by the comment above it as existing
only for compact touch. It has **zero** consumers in the file.

**Session-only diff style, now an alias.** `packages/review-editor/App.tsx:336`
is `const effectiveDiffStyle = diffStyle;` — a pure rename. The seam it fed,
`packages/review-editor/dock/ReviewDockRightActions.tsx:23-26`
(`state?.diffStyle ?? storedDiffStyle`), exists because compact review supplied a
session-only style; both sides now resolve to `configStore.get('diffStyle')`.

**A removal done right, for contrast:**
`packages/editor/components/FolderAnnotationEmptyState.tsx` took its
`compactTouchLayout` prop, its compact copy variant and its compact "Choose a
file" button out entirely in `7bcc1212` and is now a 13-line component with no
props. That is what `AppHeader` and `PlanHeaderMenu` did not get.

### Simplification this unlocks

- `AppHeader` loses 4 props and ~9 conditional branches; five `!compactTouchLayout &&` guards become unconditional renders; `CompactPlanNavigatorTrigger` (30 lines) deletes.
- `PlanHeaderMenu` loses 3 props, the `CompactPlanAction` interface, two sub-components (`CompactActionSection`, `CompactPlanActionIcon`), and its guard at `:55` collapses to one clause. Roughly half the file.
- `HtmlSurfaceControls` loses a prop and an early return.
- `SidebarContainer`'s `presentation` union drops to one member (`"desktop"`) — i.e. the prop itself becomes removable — taking the `compact` flag, the dialog semantics, the close-button header and the `touch` prop on `SidebarTab` with it.
- `useIsMobile.ts` drops from 54 lines to ~15 (only `useIsMobile` survives).
- `theme.css` loses ~70 lines of unmatched selectors; `--pn-touch-target` (`:110`) loses its last consumer.
- Every `data-pn-touch-target` / `data-pn-touch-target-icon` attribute in the tree becomes deletable.
- `packages/editor/annotateDecision.ts:65-87` — see §8.

**Uncertain:** `--pn-safe-*`, `--pn-viewport-height` and `useViewportEnvironment`
(`packages/ui/hooks/useViewportEnvironment.ts`, 350 lines) are *not* compact-gated
— `.pn-app-viewport` is applied unconditionally at `packages/editor/App.tsx:4211,4221`
and `packages/review-editor/App.tsx:3368,3381`, and `hasPrimaryCoarsePointer()` is
read at `CommentPopover.tsx:159` and `AnnotationToolbar.tsx:58` on every device. I
have not established whether the observed-viewport machinery still earns its
keep on a desktop-only product; treat it as a separate question, not part of this
removal.

---

## 2. Open-in-app / external editor launching

### What it was

A split-button in the review file rows and the plan doc badges that detected
installed editors, terminals and file managers on the machine and spawned the
chosen one on the file under the cursor. It shipped a brand-icon catalog
(VS Code, Cursor, Xcode, iTerm2, Ghostty, Warp, Zed, Android Studio, Sublime,
PowerShell, Finder/Explorer…) as base64 inside all three single-file bundles.

### When and where it went

Commit `e2a7814b` first cut the macOS-only catalog entries
(`packages/core/open-in-apps.ts` −127). Commit `7bcc1212` removed the rest end to
end:

| File | Lines |
|---|---|
| `packages/server/open-in.ts` | 326 (deleted) |
| `packages/server/open-in.test.ts` | 101 (deleted) |
| `packages/ui/components/OpenInAppButton.tsx` | 292 (deleted) |
| `packages/ui/components/icons/AppIcon.tsx` | 56 (deleted) |
| `packages/ui/components/icons/app/*` | 16 SVG/PNG files (deleted) |
| `packages/core/open-in-apps.ts` | 92 (deleted) |
| `packages/shared/open-in-apps.ts` | 1 (deleted) |
| `packages/shared/html-assets-node.ts` | 46 (deleted) |

Replaced by `packages/ui/components/FileActionsButton.tsx` — 92 lines, an
overflow menu carrying only Copy path and Copy file diff, which were never part
of the feature and merely shared its dropdown.

### What the old spec still claims

`spec/06-branding-and-release.md:69` lists "safe remote/live behavior left within
approved scope" among document surfaces; the open-in catalog is implicitly part
of the "retained functionality" `spec/02` line 38 preserves for Review. Neither
file names the feature directly, so this section is mostly a note that the specs
never documented it explicitly — **check `spec/` for any file-row control
inventory before rewriting.**

### Verified leftovers

Grepped for: `open-in`, `openIn`, `OpenInApp`, `AppIcon`, `lastUsedApp`,
`OPEN_IN_APPS`, `/api/apps`, `detect-apps`. No live code found. No
`packages/server/open-in.ts`, `packages/core/open-in-apps.ts` or
`packages/shared/open-in-apps.ts` exists.

Documentation and comment leftovers only:

- `packages/ui/.migration/dropdown-menu.md:27,71` — migration notes naming `OpenInAppButton.tsx` as a consumer to sweep
- `packages/ui/.migration/project.md:32,46,68,76,97` — five references, including a checklist item "✅ OpenInAppButton menu in BOTH annotate (doc badges) and review (file rows)"
- `packages/review-editor/dock/ReviewStateContext.tsx:56` — comment: "absolute (e.g. for the Open-in-app control)"
- `packages/review-editor/hooks/useDiffFreshness.ts:44` — comment: "the Open-in control tracks pool warmup"
- `packages/server/review.ts:1093`, `:1129`, `:1834` — three comments justifying behaviour by "the Open-in button/control"
- `packages/ui/components/FileActionsButton.tsx:14` — self-describing comment, intentional

**A second external-editor launcher was never touched.** The branch removed
open-in-app but `/api/plan/vscode-diff` still spawns the VS Code CLI:

- `packages/server/ide.ts` — "Open two files in VS Code's diff viewer", with an error string instructing the user to run `Shell Command: Install code command in PATH`
- `packages/server/index.ts:370-391` — the route
- `packages/ui/components/plan-diff/PlanDiffViewer.tsx:19,37,40-51,74-95,161-190` — the button, its loading and error states, and `defaultOpenVscodeDiff`
- `packages/ui/components/plan-diff/VSCodeIcon.tsx` — a brand icon, the same class of asset `7bcc1212` deleted 115 KB of

This is not a leftover in the strict sense — it predates and survives the
removal — but a plugin that "stops trying to be a launcher" still launches
VS Code from the plan diff view. Flag it as an inconsistency, not as dead code.

### Simplification this unlocks

`FileActionsButton` has replaced a 292-line split button with an 89-line menu
already. The remaining work is comment and migration-note cleanup, plus a
maintainer decision on the VS Code diff path.

---

## 3. WebMCP / browser-agent tool surface

### What it was

The page advertised itself as a Model Context Protocol provider to a Chrome/Edge
browser agent, exposing in-page tools (read the document, list changes, nudge the
user) so an agent could call them instead of scraping the DOM. It was an
origin-trial API behind a flag; no browser agent in this fork ever pointed at it.

### When and where it went

Commit `30b87090` — 33 files, 4,263 deletions:

- `packages/ui/webmcp/` — 15 files (`toolset.ts` 337, `changes.ts` 251, `nudges.ts` 189, `modelContext.ts` 103, `schema.ts` 81, `useToolset.ts` 74, `index.ts` 72, `policy.ts` 50, `preference.ts` 50, `activity.ts` 46, plus 5 test files totalling 624 lines)
- `packages/editor/webmcp/` — 4 files (`documentTools.ts` 861, `documentTools.test.ts` 565, `useDocumentWebMcp.ts` 384, `documentText.ts` 266)
- `packages/editor/components/AgentNudgeBanner.tsx` — 49 (its only caller was `nudge_user`)
- the `webmcp` seam on `configureHypermarkUI` (`packages/ui/configure.ts` −10)
- the Settings "Agent tools" row (`packages/ui/components/Settings.tsx` −47)

Kept deliberately: `Annotation.inReplyTo` and the `source` provenance field, both
of which predate the tools and serve external annotation ingest.

### What the old spec still claims

`spec/01-foundation-and-scope.md:32` (scope — things to preserve):

> Review setup and diff/base selectors, reading staged changes, correct current
> Git worktree, Semantic Changes and Call Flow, **WebMCP**, external annotation
> ingestion/provenance, and safety/sanitization guards unless separately removed
> by an explicit decision.

`spec/02-feature-removal-and-claude.md:42`:

> Preserve localhost/Host/Origin/path checks, HTML sanitization, **WebMCP
> human-decision boundaries**, external API validation, source-save conflicts,
> strict annotate gates, and safe file limits.

Both passages must go. `FABLE-BRIEF.md:58` already tells you not to spec its
removal — it is done.

### Verified leftovers

**None found.** Grepped for `webmcp`, `web-mcp`, `modelContext`, `AgentNudge`,
`nudge_user`, `useToolset`, `configureHypermarkUI` across `packages`, `apps`,
`spec`, `tests`, `scripts` and root `*.md`. The only `@modelcontextprotocol`
hits are `packages/shared/call-flow.ts:56` and
`packages/shared/call-flow-runtime/package-lock.json:30,32,91` — that is the Call
Flow runtime's own npm dependency, unrelated to the removed surface.

### Simplification this unlocks

Nothing further in code. In `spec/`, deleting the WebMCP clauses also removes the
justification for the "human-decision boundaries" language in `spec/02`, which
has no other referent.

---

## 4. Token hover cards and the code-nav hover pipeline

### What it was

Hovering (or Cmd-hovering, per a setting) a symbol in a review diff popped a card
with the symbol's kind, an approximate signature, a heuristic doc comment, a
short preview and a five-reference sample, resolved server-side by a ripgrep
search. It had a dwell-delay setting, a trigger setting, two cookies and a
first-run announcement dialog.

### When and where it went

Commit `18e8180f` — 32 files, 3,658 deletions:

| File | Lines |
|---|---|
| `packages/review-editor/hooks/useTokenHover.ts` | 533 (deleted) |
| `packages/review-editor/components/TokenHoverAnnouncementDialog.tsx` | 411 (deleted) |
| `packages/shared/code-nav.ts` | 400 (deleted) |
| `packages/shared/code-nav.test.ts` | 405 (deleted) |
| `packages/review-editor/components/TokenHoverCard.tsx` | 261 (deleted) |
| `packages/server/code-nav-hover-endpoint.test.ts` | 242 (deleted) |
| `packages/review-editor/utils/tokenHoverAnnouncement.ts` + test | 86 + 133 (deleted) |
| `packages/ui/config/tokenHoverSetting.test.ts` | 104 (deleted) |
| `packages/review-editor/utils/codeNavHoverHandoff.test.ts` | 104 (deleted) |
| `packages/review-editor/utils/stitchTokenIdentifier.ts` | 97 (deleted) |
| `packages/core/token-hover.ts` | 88 (deleted) |
| `packages/review-editor/components/tokenHoverStyles.ts` | 46 (deleted) |
| `packages/review-editor/utils/buildCodeNavRequest.ts` | 19 (deleted) |
| `packages/shared/token-hover.ts` | 1 (deleted) |

Cmd+click go-to-definition and the References panel survive; `.pn-token-nav` now
carries the underline it used to borrow from the hover class.

### What the old spec still claims

`spec/05-comments-and-attachments.md:193`:

> Do not steal native editor shortcuts, selection gestures, **token-hover
> behavior**, or edit-session shortcuts.

`spec/05-comments-and-attachments.md:196`:

> A comment trigger takes precedence over **token hover** on that trigger only.

`AGENTS.md:460` is the worst of it: a full API-table row documenting
`/api/code-nav/hover` — the request shape, the `backend: 'unavailable'`
behaviour, both cookie settings (`tokenHoverTrigger`, `tokenHoverDelay`), the
boolean→trigger migration, the reasoning for Cmd over Alt, and the `pn-token-hover`
class. The route does not exist. `AGENTS.md:275` also still describes the
one-time dialog chain as "guide intro → look-and-feel → review setup → Edit Mode
→ token hover cards" — three of those five dialogs are deleted.

### Verified leftovers

Grepped for `tokenHover`, `token-hover`, `hoverCard`, `codeNavHover`,
`code-nav/hover`, `resolveCodeNavHover`, `pn-token-hover`. **In `packages/` and
`apps/`: none found.** Every surviving hit is `pn-token-**nav**`, the Cmd+click
affordance that was deliberately kept:

- `packages/review-editor/components/DiffViewer.tsx:687,692`
- `packages/review-editor/components/AllFilesCodeView.tsx:139,1707,1713`
- `packages/review-editor/hooks/usePierreTheme.ts:246`

Documentation leftovers: `spec/05:193,196`, `AGENTS.md:460`, `AGENTS.md:275`.

### Simplification this unlocks

Nothing in code. `AGENTS.md:460` is a ~900-word paragraph documenting a route
that 404s — deleting it is the single largest doc win available.

---

## 5. Image annotator

### What it was

Picking an image attachment opened a canvas overlay where you drew pen strokes,
arrows and circles on the screenshot before sending it, with a tool palette, a
stroke-history undo stack and its own keyboard shortcut scope.

### When and where it went

Commit `436442c5` — 15 files, 1,044 deletions:

| File | Lines |
|---|---|
| `packages/ui/components/ImageAnnotator/index.tsx` | 264 |
| `packages/ui/components/ImageAnnotator/Toolbar.tsx` | 245 |
| `packages/ui/components/ImageAnnotator/utils.ts` | 147 |
| `packages/ui/components/ImageAnnotator/Canvas.tsx` | 118 |
| `packages/ui/components/ImageAnnotator/strokeHistory.ts` | 58 |
| `packages/ui/components/ImageAnnotator/types.ts` | 39 |
| `packages/ui/components/ImageAnnotator/strokeHistory.test.ts` | 37 |
| `packages/ui/shortcuts/plan-review/imageAnnotator.shortcuts.ts` | 51 |
| `packages/ui/test-consumer/image-annotator-legacy.tsx` | 29 |

Picking a file now uploads it.

### What the old spec still claims

`spec/05-comments-and-attachments.md:51`, in the "verify these existing paths
before editing" table:

> | Image annotation overlay | `packages/ui/components/ImageAnnotator/index.tsx` |

That row points at a directory that no longer exists.

### Verified leftovers

Grepped for `ImageAnnotator`, `strokeHistory`, `annotateImage`, `image-annotator`,
`ImageAnnotation`. The only hits are:

- `spec/05-comments-and-attachments.md:51` (the stale table row above)
- `packages/editor/annotateSubmission.test.ts:82,111` — a local test fixture variable named `globalImageAnnotation`, unrelated to the overlay (it is an image-only global comment, a feature that still exists)

`packages/ui/tsconfig.strict-consumer.json` and `packages/ui/shortcuts/index.ts`
had their references removed in the same commit. **No leftovers.**

### Simplification this unlocks

Nothing further; this removal was clean. Note it as the model for §1 and §6.

---

## 6. Conventional Comments and edit-to-suggest

### What it was

Two overlapping review features: a Conventional Comments label taxonomy
(`praise`, `nitpick`, `issue`, `blocking`…) that let reviewers signal intent to
other reviewers, and an in-diff edit session where you rewrote code directly and
the app derived a GitHub ```suggestion block from your edits. A third surface,
the "+ Add suggested code" composer box, emitted the same blocks by hand.

### When and where it went

Commit `ae41f15a` — 61 files, **4,580 deletions**, the largest single feature
removal on the branch:

| File | Lines |
|---|---|
| `packages/review-editor/edit/useEditSession.ts` | 703 |
| `packages/review-editor/index.css` | 397 (CSS only) |
| `packages/review-editor/edit/deriveSuggestions.test.ts` | 319 |
| `packages/review-editor/components/EditModeAnnouncementDialog.tsx` | 300 |
| `packages/review-editor/edit/deriveSuggestions.ts` | 230 |
| `packages/review-editor/edit/selectionAnchor.ts` | 217 |
| `packages/review-editor/edit/selectionAnchor.test.ts` | 199 |
| `packages/review-editor/components/ConventionalLabelPicker.tsx` | 161 |
| `packages/review-editor/components/SuggestionModal.tsx` | 129 |
| `packages/review-editor/edit/pierreEditAdapter.ts` | 115 |
| `packages/review-editor/utils/editModeAnnouncement.test.ts` | 94 |
| `packages/review-editor/components/EditSessionHud.tsx` | 86 |
| `packages/review-editor/edit/selectionActionPopover.ts` | 77 |
| `packages/review-editor/utils/editModeAnnouncement.ts` | 58 |
| `packages/review-editor/edit/adapterWall.test.ts` | 53 |
| `packages/review-editor/edit/cloneDiff.test.ts` | 46 |
| `packages/review-editor/components/SuggestionDiff.tsx` | 26 |
| `packages/review-editor/components/SuggestionBlock.tsx` | 27 |
| `packages/ui/shortcuts/code-review/suggestionModal.shortcuts.ts` | 25 |
| `packages/review-editor/edit/cloneDiff.ts` | 18 |

The whole `packages/review-editor/edit/` directory is gone. Types removed from
`packages/ui/types.ts`: `ConventionalLabel`, `ConventionalDecoration`, and the
fields `suggestedCode`, `originalCode`, `conventionalLabel`, `decorations`,
`selectedTextFromEdits` from `CodeAnnotation` and `DiffAnnotationMetadata`.
Settings keys removed: `editSuggestions`, `conventionalComments`,
`conventionalLabels`, plus `CCLabelConfig` on every `/api/config` endpoint.

### What the old spec still claims

`spec/05-comments-and-attachments.md:198`:

> File/general comments retain suitable non-range surfaces, and **suggestions
> keep their full payload/edit behavior** rather than being downgraded to plain
> text by the new popup.

`spec/05-comments-and-attachments.md:193` (same sentence as §4) requires not
stealing "**edit-session shortcuts**".

`AGENTS.md:75` still documents the shortcut directory layout as:

> `code-review/` # Scopes for review-editor surfaces (ai, allFilesDiff,
> annotationToolbar, fileTree, prComments, **suggestionModal, tourDialog**)

`suggestionModal.shortcuts.ts` was deleted in this commit; `ai` and `tourDialog`
do not exist either. The real contents are `allFilesDiff`, `annotationToolbar`,
`fileTree`, `prComments`, `reviewChrome`.

`AGENTS.md:759` still says "`HighlightedCode` (**review suggestions**) derives its
language from the caller's file path".

### Verified leftovers

**A dead prop pair threaded into a live component.**
`packages/review-editor/components/ExpandedCommentDialog.tsx`:

- `:20` `onEditSuggestion?: () => void;`
- `:21` `hasSuggestedCode?: boolean;`
- `:44`, `:45` destructured, `hasSuggestedCode` defaulted to `false`
- `:199-207` a conditional block rendering a button labelled `{hasSuggestedCode ? 'Edit suggestion' : 'Suggest code'}`

The component's only caller is `packages/review-editor/components/ToolbarHost.tsx:134-152`,
which passes **neither** prop. `onEditSuggestion` is `undefined`, so the button
never renders. Grepped `onEditSuggestion` across `packages/` — the only four hits
are the four lines above.

**A phantom shortcut that the Settings panel now shows to users.**
`packages/ui/shortcuts/code-review/annotationToolbar.shortcuts.ts:14-19`:

```
    indentSuggestedCode: {
      description: 'Indent suggested code',
      bindings: ['Tab'],
      section: 'Annotations',
      displayOrder: 20,
    },
```

Grepped `indentSuggestedCode` across `packages/` and `apps/` — that declaration is
the **only** occurrence. No handler dispatches it. This matters more than it used
to: commit `0473298b` rewired the Settings shortcuts panel to render from the
registry (§14), and `reviewAnnotationToolbarShortcuts` is a member of
`reviewShortcutRegistry` (`packages/ui/shortcuts/surfaces.ts:65`). So the panel
now advertises `Tab` — "Indent suggested code" — as a working review binding for
a feature deleted three commits earlier. The registry rewrite was supposed to end
exactly this class of drift and instead promoted one instance of it into the UI.

**Other:** `tests/manual/test-external-annotations.ts:144` constructs a fixture
annotation with a `suggestedCode` field that `CodeAnnotation` no longer declares.
`packages/server/uninstall.ts:303` uses "conventional" in its ordinary English
sense — not a leftover.

### Simplification this unlocks

- `ExpandedCommentDialog` loses 2 props and a 9-line conditional; its prop interface drops to what `ToolbarHost` actually passes.
- `reviewAnnotationToolbarShortcuts` drops to two entries (`submitComment`, `cancel`), and the Settings review panel stops lying about `Tab`.
- `spec/05:198`'s "suggestions keep their full payload/edit behavior" requirement has no referent at all and should be deleted rather than rewritten.

---

## 7. Remote / SSH / devcontainer / tailnet mode

### What it was

The server could assume the browser was not on the machine it ran on: an SSH and
devcontainer detection path, a fixed port `19432`, a `0.0.0.0` bind, a
`HYPERMARK_URL_HOST` override layer, and a `--tailscale` flag that published the
session onto a tailnet and printed a QR code for a phone to scan.

### When and where it went

Commit `e2a7814b` — 39 files, 1,857 deletions:

| File | Lines |
|---|---|
| `packages/server/remote.test.ts` | 323 (deleted) |
| `packages/shared/tailscale.ts` | 240 (deleted) |
| `packages/server/tailscale-serve.ts` | 170 (deleted) |
| `apps/hook/server/index.ts` | −164 |
| `packages/server/open-in.ts` | −162 |
| `packages/core/open-in-apps.ts` | −127 |
| `packages/server/remote.ts` | −108 |
| `packages/shared/config.test.ts` | −105 |
| `packages/server/browser.ts` | −94 |
| `packages/server/qr.ts` | 23 (deleted) |

Commit `32f686be` followed with the docs and the tests that pinned the removed
behaviour (8 files, 207 deletions). Commit `5430e3b6` deleted
`tests/devcontainer-port-only/` (3 files, 79 lines) and `tests/manual/ssh/`
(4 files, 149 lines).

One behaviour change worth carrying into the spec: the annotate client lease no
longer requires `!isRemote`, so closing the tab on a `--gate --json` session now
settles as dismissed instead of hanging. (This is the same lease the brief's
workstream G1 is about — the `gate && json && !hook` condition still gates it for
the `annotate-last` path.)

### What the old spec still claims

`spec/01-foundation-and-scope.md:46`:

> URL/Jina, Git hosting, runtime downloads, **remote/tailnet**, and Claude
> network policy remain separately open.

`spec/06-branding-and-release.md:69` lists among retained document surfaces:

> …image-only/global comments, feedback export/download, **safe remote/live
> behavior** left within approved scope.

### Verified leftovers

Grepped for `tailscale`, `HYPERMARK_REMOTE`, `isRemoteSession`, `urlHost`,
`isWSL`, `19432`, `HYPERMARK_URL_HOST`. No live code path survives. What remains:

- `AGENTS.md:491` — "All servers use random ports locally or fixed port (`19432`) in remote mode." **Directly contradicts `AGENTS.md:160`** in the same file, which correctly says "there is no remote (SSH/devcontainer) mode and no tailnet publication."
- `packages/ui/utils/planAgentInstructions.ts:12` — comment: "server is running on a random local port or the fixed remote port (19432)"
- `packages/ui/utils/reviewAgentInstructions.ts:12` — the identical comment
- `scripts/dast/target.ts:5,21` — the security-scan harness pins `SCAN_PORT = 19432` and sets `HYPERMARK_REMOTE: "0"`. The env var is no longer read by anything; whether the scan still reaches the server on that port needs checking (I did not run it).
- `tests/manual/vim-ux-smoke.md:28` — a manual repro that exports `HYPERMARK_REMOTE=1`
- `tests/test-fixtures/10-inline-gaps-and-bullets.md:174-175` — a *fixture* describing `HYPERMARK_PORT=19432` and `HYPERMARK_REMOTE=1`. This is sample markdown content, not a claim about the product; do not "fix" it without deciding whether the fixture's text matters to its assertions.

### Simplification this unlocks

`AGENTS.md:491` and the two identical comments in `*AgentInstructions.ts` are
one-line deletions. `scripts/dast/target.ts` can drop a dead env var. The
`--tailscale`-shaped branches in the annotate CLI test suite were already removed
in `5430e3b6`.

---

## 8. Close and Discard become one exit

### What it was

The plan and review headers each carried two buttons that looked identical and
meant opposite things: **Close** posted `/api/exit` and the agent heard
"dismissed"; **Discard** posted an approval and the agent heard "no changes
needed" — silently green-lighting work you had just annotated.

### When and where it went

Commit `6e942c40` — 14 files, 277 deletions, 205 insertions. There is now one
`close-session` item, in the menu, in every arm and at every count; it always
dismisses. `packages/ui/components/ToolbarButtons.tsx` lost 27 lines (the
standalone Close button), `packages/editor/components/AppHeader.tsx` 41, and
Download Annotations moved from the plan header into the sidebar footer beside
Copy.

Commit `95e8c75e` then changed the annotate primary from `Done` to `No notes`
and corrected four `decisionSpec` assertions that had gone stale against the
always-present close item — they were failing before that commit.

### What the old spec still claims

`spec/02-feature-removal-and-claude.md:32` requires preserving "standalone
**Download Annotations**" as a document-options entry, and `spec/02:38` lists it
among the options the Document menu keeps. It is no longer in that menu; it is in
the sidebar footer.

### Verified leftovers

**The compact row-id module survives the surface it fed.**
`packages/editor/annotateDecision.ts` is documented as "pure transport routing",
but two of its three exports exist only for the deleted compact rows:

- `:2` `import type { CompactPlanAction } from "@hypermark/ui/components/PlanHeaderMenu"` — an import from the dead compact interface (§1)
- `:58-79` `compactRowIdForDecisionItem()` — returns `Extract<CompactPlanAction["id"], …>`; the only non-test caller is `packages/editor/App.tsx:169` (imported) and it is not invoked in any live render path
- `:81-87` `compactPrimaryIdForDecision()` — no caller outside the test

Its test is orphaned the same way:
`packages/editor/decisionHandlers.test.ts:85-98` — "compact row ids are unique per
spec and never collide with the primary row", guarding, in its own comment, "the
compact surface … a collision hides a decision row on touch".

**A documented-dead branch.** `packages/editor/annotateDecision.ts:36-46` — the
non-gate arm of `note-with-approval`, which the code comment and
`packages/ui/utils/decisionSpec.test.ts:171-174` both explicitly call unreachable:

> this is also what keeps the non-gate `note-with-approval` arm in
> `annotateDecision.ts` dead code.

**Stale AGENTS.md prose:** `:205`, `:227`, `:237-238`, `:244`, `:329`, `:340` all
describe the decision spec as feeding "the compact primary row" and
"compact/touch rows".

### Simplification this unlocks

- `annotateDecision.ts` drops from 87 lines to ~56: the `CompactPlanAction` import and both compact id helpers go, and with them `App.tsx:169`'s import.
- `decisionHandlers.test.ts` loses the compact-collision test (14 lines) and its two imports.
- Deleting the compact helpers removes the last external consumer of `CompactPlanAction`, which unblocks the `PlanHeaderMenu` cleanup in §1.
- `resolveAnnotateDecisionAction`'s `note-with-approval` case collapses from a ternary to `{ kind: "note", route: "approve", approvalFraming: false }` — but only if the maintainer accepts deleting a branch two comments describe as a deliberate safety net. **Flag, do not assume.**

---

## 9. Permission-mode select and its first-run dialog

### What it was

After approving a plan, Hypermark asked which permission mode Claude Code should
resume in — a four-way select in Settings plus a first-run setup dialog.

### When and where it went

Commit `76c8cf9f`:

- `packages/ui/components/PermissionModeSetup.tsx` — 111 lines (deleted)
- `packages/ui/components/Settings.tsx` — −42
- `packages/ui/utils/permissionMode.ts` — 87 lines reduced to 18, of which 17 are the comment explaining why

The file is now a single constant:
`packages/ui/utils/permissionMode.ts:18` — `export const PLAN_APPROVAL_PERMISSION_MODE = 'bypassPermissions';`

### What the old spec still claims

No `spec/` file names permission mode. `AGENTS.md` does not either. Nothing to
rewrite here — note it in the spec as a settled decision, since it is the kind of
control a future pass would otherwise re-propose.

### Verified leftovers

**One dead field on the wire.** `packages/server/index.ts:309` still includes
`permissionMode` in the `/api/config` response:

```
return Response.json({ plan, origin, permissionMode, repoInfo, previousPlan, versionInfo, projectRoot: process.cwd(), serverConfig: getServerConfig(gitUser) });
```

No client reads it. Grepped `permissionMode` across `packages/editor`,
`packages/ui` and `packages/review-editor`: the only hits are
`packages/editor/App.tsx:56` (the constant import), `:2959` (the request body
type) and `:2965` (setting it on approve). Nothing reads the response field.

**A near-dead fallback.** `packages/server/index.ts:540-541`:

```
const inheritedPermissionMode = permissionMode === "plan" ? undefined : permissionMode;
const effectivePermissionMode = requestedPermissionMode || inheritedPermissionMode;
```

Since `76c8cf9f` the client always sends `bypassPermissions` on the gate path
(`App.tsx:2965`), so `requestedPermissionMode` is always truthy there and the
`inheritedPermissionMode` arm is only reachable from a caller that omits the
field. Commit `36fcff76` (§16) exists to make that arm safe. **I could not
establish whether any live caller still omits it** — the strict-annotate and hook
transports would need tracing. Say so rather than proposing the deletion.

### Simplification this unlocks

Removing `permissionMode` from the `/api/config` payload is safe (no reader).
Collapsing the fallback is not, until the caller question above is answered.

---

## 10. Chrome that asked about itself: auto-close, release check, self-attribution, look-and-feel chooser, file-browser directories

### What it was

Five separate settings-shaped features removed as one theme: an auto-close-tab
delay setting with an "Off" default; a GitHub release poll that put an update dot
in the header and a "new version available" toast; a "(me)" suffix and dimmed
styling on your own comments; a first-run "flat or grid look" chooser with two
screenshot assets; and a Settings tab where you added arbitrary directories for
the file browser sidebar to list.

### When and where it went

Commit `8801a1c6` — 40 files, 1,374 deletions:

| File | Lines |
|---|---|
| `packages/ui/components/LookAndFeelAnnouncementDialog.tsx` | 199 (deleted) |
| `packages/ui/components/Settings.tsx` | −194 |
| `packages/ui/components/PlanHeaderMenu.tsx` | −156 |
| `packages/review-editor/components/ReviewHeaderMenu.tsx` | −152 |
| `packages/ui/components/MenuVersionSection.tsx` | 88 (deleted) |
| `packages/ui/components/AnnotationToolstrip.tsx` | −92 |
| `packages/ui/assets/look-flat.png`, `look-grid.png` | 305 KB (deleted) |
| `packages/ui/utils/lookAndFeelAnnouncement.ts` + test | 22 + 51 (deleted) |
| `packages/ui/utils/agentSwitch.ts` + test | 97 + 60 (deleted) |

Also removed across the branch: `packages/ui/utils/fileBrowser.ts` (40 lines,
`e2a7814b`) and the `hypermark-auto-close` / `hypermark-open-in-app` storage keys
(`packages/ui/utils/storage.ts` −42).

### What the old spec still claims

`spec/02-feature-removal-and-claude.md:38` keeps "**version/history controls**" in
the Document options menu — the version half is gone. The same line's Settings
inventory ("Keep General, Theme, Git, Display, Analysis, Saving, Labels,
Shortcuts, **Files**, **Comments**, and Hooks") lists two tabs that no longer
exist: Files went with the file browser here, Comments went with Conventional
Comments in `ae41f15a` (§6).

### Verified leftovers

Grepped for `autoClose`, `releaseCheck`, `latestRelease`, `updateAvailable`,
`MenuVersion`, `checkForUpdate`, `lookAndFeel`, `gridLook`, `extraDirectories`,
`fileBrowserEnabled`, `allowedDirectories`, `getLastOpenInApp`.

- **Release check: none found.** `packages/ui/HANDOFF.md:242` documents the removal correctly.
- **File browser directories: none found.** No `fileBrowser.ts`, no storage keys.
- **Look-and-feel: two stale comments only** — `packages/review-editor/components/ReviewSetupDialog.tsx:9` ("LookAndFeelAnnouncementDialog. Left: which panel view a review opens in") and `packages/review-editor/utils/reviewSetup.ts:7` ("look-and-feel announcement gate"). Both name a deleted dialog. `AGENTS.md:275` also still lists look-and-feel in the one-time dialog chain.
- **Auto-close:** the *setting* is gone; the hook is intentionally kept. `packages/ui/hooks/useAutoClose.ts` now always closes immediately (`:67-77`), and `packages/ui/components/CompletionOverlay.tsx:35` is its only caller. Two small dead shapes remain: the `'closing'` phase (`useAutoClose.ts:12`) is set at `:72` but `CompletionOverlay.tsx:61` only ever tests for `'closeFailed'`, so `'closing'` and `'idle'` render identically; and `UseAutoCloseReturn` (`:15-17`) wraps a single field.
- **Self-attribution:** `isCurrentUser` is kept deliberately on the identity seam (`packages/ui/utils/identity.ts:24-27`, `:105-107`) with one consumer, `packages/ui/components/AnnotationPanel.tsx:622`. Since Hypermark stamps every annotation with `getIdentity()`, that predicate is always true in practice and the author prefix never renders — which is the documented intent, not a bug.

**Separately: three dead identity exports.** `setCustomIdentity`
(`identity.ts:85-90`), `regenerateIdentity` (`:96-100`) and `isIdentityEditable`
(`:114-116`) have **no non-test callers** anywhere in `packages/` or `apps/`.
They fed the editable-identity controls that `spec/02:33` says to delete
("Delete Vim modes/engine/shortcuts/settings and **editable identity controls**").
That removal happened before this branch and left these three behind.

### Simplification this unlocks

- `useAutoClose` can return the phase directly and drop the `'closing'` member (the state machine has two observable states, not three).
- `identity.ts` loses three exports, ~25 lines, and with them the `isEditable` member of the `IdentityProvider` interface (`:41`) — though that one is a documented host seam, so check `packages/ui/configure.ts` consumers before cutting it.
- `spec/02:38`'s Settings tab inventory needs to be rewritten against the real list at `packages/ui/components/Settings.tsx:28`: `'general' | 'theme' | 'git' | 'display' | 'analysis' | 'saving' | 'labels' | 'shortcuts' | 'hooks'`.

---

## 11. Codex and Copilot session adapters, crypto, compress

### What it was

`apps/hook/server/` carried per-agent session adapters that parsed Codex and
Copilot transcript formats so those agents could drive a Hypermark review the way
Claude Code does. `packages/core` carried an encryption module and a compression
module for the share-upload path that `spec/02` had already removed.

### When and where it went

Commit `73f373d8` ("the dead code stops shipping") — 159 files, **8,614
deletions**, described as a sweep for "features with no reachable caller":

| File | Lines |
|---|---|
| `apps/hook/server/index.ts` | −825 |
| `apps/hook/server/codex-session.test.ts` | 516 (deleted) |
| `apps/hook/server/codex-session.ts` | 470 (deleted) |
| `apps/hook/server/copilot-session.ts` | 302 (deleted) |
| `apps/hook/server/copilot-session.test.ts` | 225 (deleted) |
| `packages/core/crypto.ts` + test | 97 + 172 (deleted) |
| `apps/hook/server/opencode-review-advert.test.ts` | 147 (deleted) |
| `packages/review-editor/components/LiveLogViewer.tsx` | 95 (deleted) |
| `packages/editor/shortcuts.ts` | 140 (deleted) |
| `packages/core/compress.ts` | 51 (deleted) |
| `packages/review-editor/components/ScrollFade.tsx` | 54 (deleted) |
| `packages/review-editor/components/InlineAnnotation.tsx` | −57 |
| `.github/assets/` | 8 icon files + 3 large PNGs (deleted) |

The commit message records that `typecheck:editors` went from 27 errors to 0 —
"the first time it has passed on this branch."

### What the old spec still claims

`spec/01-foundation-and-scope.md:78` already ordered the removal of
`apps/codex`, `apps/copilot`, `apps/gemini`, `apps/kiro-cli`, `apps/amp-plugin`
and nine other application roots. This commit finished a job `spec/01` had
started — the spec's *instruction* is satisfied, but it is written in the
imperative ("Remove …") as if pending. Rewrite it as a statement of the current
shape, not a task.

### Verified leftovers

Grepped for `codex`, `copilot`, `opencode`, `droid`, `kiro`, `crypto`, `compress`,
`encrypt`, `gzip` across `packages/` and `apps/`.

- No Codex/Copilot session code survives.
- `packages/core/feedback-templates.test.ts:12,22-26` still asserts that "all three integrations (hook, **opencode**, pi)" produce identical feedback text. The opencode and pi *plugins* are gone (`spec/01:78`); this test now compares three call shapes of the same local function. **Classify it for workstream B** — it is the "asserts the implementation back to itself" bucket.
- `packages/editor/App.tsx:1910` — "Fetch available agents for OpenCode (for validation on approve)"; `:2974` — "for OpenCode 'approve with notes'". Live code with comments referring to a removed integration; whether the code path itself is dead needs tracing (`/api/agents`), which I did not do.
- `packages/editor/App.tsx:3753` and `packages/review-editor/App.tsx:807` both say "(Claude Code, Codex, etc.)" in agent-instructions comments. Cosmetic.
- `gzip` hits are all `packages/server/live-proxy.{ts,test.ts}` — the HTTP proxy's transparent-decompression handling, unrelated.

### Simplification this unlocks

`feedback-templates.test.ts` is a deletion candidate with a number attached
(the file's three-way equality assertion now has one real party). The OpenCode
comments in both `App.tsx` files should either be corrected or the code paths
traced and removed — I have not determined which.

---

## 12. Staging (git add) controls

### What it was

The review file tree let you stage and unstage files against the git index from
inside the app, with a per-row staged dot, a staged count in the panel header,
and an `A` keyboard shortcut.

### When and where it went

The controls themselves went before this branch (`spec/02:63` ordered it:
"Remove Vim, editable identity and **staging**; prune menus/settings. … Verify no
in-app stage/unstage path mutates the index"). Commit `0473298b` removed the last
config key:

> `reviewShowStageControls` goes too: nothing has read it since staging was
> removed.

### What the old spec still claims

`spec/01-foundation-and-scope.md:32` lists "**reading staged changes**" among
things to preserve — that part is still true and should survive the rewrite.
`spec/02:63`'s removal instruction is satisfied.
`AGENTS.md:283` correctly notes "GitButler assignment is not the Git index, so
the provider never opts into stage/unstage."

### Verified leftovers

**The decoration pipeline survives with no producer.** `stagedFiles` is still
computed, threaded through three components and rendered:

- `packages/review-editor/App.tsx:1780` — `const stagedFiles = useMemo(…)`
- `:2649`, `:2707` — carried in review state and a dep array
- `:3791`, `:3909` — passed to two panels
- `packages/review-editor/dock/ReviewStateContext.tsx:126` — `stagedFiles: Set<string>;` on the context type
- `packages/review-editor/components/FileTree.tsx:75,163,347,350,364,457` — prop, destructure, decoration ref, `isStaged` computation, `stagedCount={stagedFiles.size}`
- `packages/review-editor/components/SectionsPanel.tsx:66,202,260,269,335` — prop, destructure, per-file `staged` flag, `stagedCount`
- `packages/review-editor/utils/fileTreeRowDecoration.ts:119` — "outside since-base, `stagedFiles` alone drives the staged dot"

**The mutation hook it was named for no longer exists.**
`packages/shared/review-core.ts:2184` refers to "the client's effective
stagedFiles set (**useGitAdd** folds …)". Grepped `useGitAdd`, `gitAdd`,
`/api/stage`, `toggleStage` across `packages/` and `apps/` — that comment is the
**only** hit. There is no `useGitAdd`.

**I have not determined whether the staged dot is still correct.** `stagedFiles`
is now derived read-only from the git status the server reports, which is
legitimate information to display — `spec/01:32` asks for "reading staged
changes" to be preserved. So this may be intended surviving behaviour rather than
dead code. What is certainly stale is the `useGitAdd` comment and, possibly,
the `stagedCount` badges whose only remaining purpose is informational. **Verify
against the maintainer before proposing deletion.**

### Simplification this unlocks

At minimum the `review-core.ts:2184` comment. Beyond that, the question is
whether an informational staged dot earns six files of prop threading — a
maintainer call, argued with the file count above.

---

## 13. `adr/`, `docs/`, `bin/`, `build/`, `SECURITY.md`

### What it was

`adr/` held 102 files and ~1 MB of upstream (Plannotator) architecture decision
records, spikes, synthesis notes and a synthetic design prototype with vendored
icon sets. `docs/` held two user pages. `bin/hypermark.js` was an npm shim for a
package marked `"private": true` and therefore never published.

### When and where it went

Commit `5430e3b6` — 120 files, **11,511 deletions** — deleted `adr/` entirely,
plus `tests/devcontainer-port-only/` and `tests/manual/ssh/`, and a set of tests
"dead by construction on Windows rather than by judgment" (`git-background.test.ts`
in full, the launch-semantics half of `open-in.test.ts`, and four win32-skipped
cases in `source-save-node` and `strict-annotate-result`).

Commit `95e8c75e` — 14 files, 275 deletions — deleted `bin/hypermark.js` (24) and
the `bin` field from `package.json`, `docs/vim-controls.md` (136),
`docs/custom-reviews.md` (47), and `SECURITY.md` (29). `build/shiki-wasm-stub.ts`
moved to `scripts/` because both Vite configs need it.

### What the old spec still claims

`spec/01-foundation-and-scope.md:5` — the opening paragraph of the first spec
file — links to three files inside the deleted directory:

> It consolidates the earlier [fork specification](../adr/specs/hypermark-fork-spec-20260905.md),
> [review](../adr/specs/hypermark-fork-review-20260905.md), and
> [design decisions](../adr/specs/hypermark-design-decisions-20260905.md). Those
> documents remain rationale/history; these six files own task boundaries and the
> latest requirements.

All three links are dead, and the sentence "Those documents remain
rationale/history" is false. This is the first thing a reader of `spec/` hits.

### Verified leftovers

Grepped `adr/`, `docs/vim-controls`, `docs/custom-reviews`, `bin/hypermark`,
`build/shiki`, `SECURITY.md` across the repo (excluding `node_modules` and
`.claude/`):

- `spec/01-foundation-and-scope.md:5` — three dead links (above)
- `packages/server/agent-terminal-runtime.ts:17` — "See ADR `adr/implementation/annotate-agent-terminal.md` for the full design." That ADR was 89 lines and is deleted; a companion 306-line recap went with it. This comment is now the only pointer to a design rationale that no longer exists in the repo.
- `README.md:436` and `AGENTS.md:820` mention `~/.local/bin/hypermark` — that is the compiled binary's install path, not the deleted npm shim. Not a leftover.

### Simplification this unlocks

Nothing in code. `spec/01:5` must be rewritten for workstream A regardless; note
that the ADR history it points at is genuinely gone, so the rewrite cannot
delegate rationale to it.

---

## 14. The shortcuts panel rework

### What it was

Settings rendered a hand-typed list of keyboard shortcuts alongside a
`shortcuts/` registry that separately described the same keys to the runtime. The
two drifted: the panel documented `A` to stage a file and `Alt Alt` to switch
feedback destination — both gone with their features — and never mentioned
annotation undo or redo, which work.

### When and where it went

Commit `0473298b` — 7 files, 287 insertions, 167 deletions. Not a removal so much
as a consolidation:

- `packages/ui/components/KeyboardShortcuts.tsx` — 190 lines changed, the hand-typed list replaced by a registry render
- `packages/ui/shortcuts/surfaces.ts` — 76 lines (new): `planShortcutRegistry`, `annotateShortcutRegistry`, `reviewShortcutRegistry`
- `packages/ui/shortcuts/surfaces.test.ts` — 54 lines (new)
- `packages/ui/shortcuts/code-review/reviewChrome.shortcuts.ts` — 79 lines (new), a scope for the seven review keys no scope owned
- `packages/ui/config/settings.ts` — −11 (`reviewShowStageControls`)

Two scope files were deleted earlier in the branch:
`suggestionModal.shortcuts.ts` (25 lines, `ae41f15a`) and
`imageAnnotator.shortcuts.ts` (51 lines, `436442c5`).

### What the old spec still claims

`spec/02-feature-removal-and-claude.md:20` locates settings/shortcuts at
"`packages/ui/shortcuts/`, **both editor `shortcuts.ts` files**" — neither exists
now (`packages/editor/shortcuts.ts` deleted in `73f373d8`;
`packages/review-editor/shortcuts.ts` deleted in `ae41f15a`).

`spec/02:63` requires "Update actual surviving settings/shortcut docs rather than
leaving empty tabs, stale menu items or **default-seeding cookies**." That
requirement is now enforced structurally by `surfaces.ts` — and, as §6 shows, it
is not sufficient on its own.

`AGENTS.md:75` still lists three scope files that do not exist (`ai`,
`suggestionModal`, `tourDialog`) and omits `reviewChrome`.

### Verified leftovers

**The registry now publishes two defects into the UI.**

1. `indentSuggestedCode` — see §6. A `Tab` binding for a deleted feature, now shown in the review shortcuts panel.

2. An empty orphan scope. `packages/ui/shortcuts/plan-review/goalSetup.shortcuts.ts` is 10 lines defining `goalSetupShortcuts` with `shortcuts: {}` and a hook `useGoalSetupShortcuts`. Neither is imported by `surfaces.ts`, and grepping `goalSetupShortcuts` / `useGoalSetupShortcuts` across `packages/` and `apps/` finds only its own definition and the re-export at `packages/ui/shortcuts/index.ts:15`. **This predates the branch** — `git log main..HEAD -- packages/ui/shortcuts/plan-review/goalSetup.shortcuts.ts` is empty, so it is not a removal leftover; it is pre-existing dead code the consolidation walked past.

### Simplification this unlocks

- Delete `goalSetup.shortcuts.ts` (10 lines) and its re-export.
- Delete `indentSuggestedCode` (6 lines), which fixes a user-visible wrong claim.
- A structural idea worth speccing: `surfaces.ts` proves a scope's *bindings* reach the panel, but nothing proves a binding has a *handler*. Both defects above are of that shape. A test that cross-checks declared shortcut keys against `useShortcutScope` dispatch sites would have caught them. **Do not propose the mechanism without counting how many such orphans exist** — I found two by inspection; I did not exhaustively cross-reference all 45 declared shortcuts.

---

## 15. The General settings tab

### What it was

The Settings dialog's first tab. By the end of the branch it held two situational
controls, so review sessions — and annotate sessions with no agent terminal —
opened Settings onto a blank pane.

### When and where it went

Commit `30b87090` removed its second control (the WebMCP "Agent tools" row),
leaving one. Commit `7c4f1f99` — 1 file, 18 insertions, 3 deletions — gated the
tab on that one control and made the dialog re-point when the active tab stops
existing.

`packages/ui/components/Settings.tsx:527` —
`const hasGeneralSettings = mode === 'annotate' && agentTerminalAvailable;`
`:530-548` builds the tab list; `:553-557` re-points the active tab.

### What the old spec still claims

`spec/02-feature-removal-and-claude.md:38`:

> **Keep General**, Theme, Git, Display, Analysis, Saving, Labels, Shortcuts,
> Files, Comments, and Hooks insofar as their features remain

Of the eleven tabs listed, **Files and Comments no longer exist** and General
exists conditionally. The real union is
`packages/ui/components/Settings.tsx:28`.

### Verified leftovers

**None found.** `SettingsTab` (`Settings.tsx:28`) lists exactly the nine tabs the
`mainTabs` builder can produce, every one of which has a render arm
(`:679`, `:715`, `:718`, `:723`, `:727`, `:731`, `:912`, `:959`, `:1146`, `:1153`).
The settings registry (`packages/ui/config/settings.ts`, 461 lines, 26 keys) has
no orphaned entries — I checked each key name against a consumer grep.

### Simplification this unlocks

Nothing in code; the gating is the simplification. In `spec/`, rewrite the tab
inventory from `Settings.tsx:28`.

---

## 16. The plan-mode approval fallback

### What it was

`/api/approve` fell back to the hook event's own `permission_mode` when the
client sent none. That event is `ExitPlanMode`, which fires while the session is
still in plan mode, so the fallback reported `plan` — and echoing it back as
`setMode: plan` would approve a plan and leave the session unable to act on it.

### When and where it went

Commit `36fcff76` — 1 file, 8 insertions, 2 deletions, in
`packages/server/index.ts:534-541`. The fallback now refuses `plan`. The comment
at `:534-539` records the reasoning, including why the session's own mode cannot
be inherited: "at the one instant the question is asked, the session's mode is
`plan`."

This is the only commit on the branch that is a bug fix rather than a removal.

### What the old spec still claims

Nothing. No `spec/` file describes the approve transport's permission handling.

### Verified leftovers

**None found.** Grepped `permission_mode`, `permissionMode`, `setMode` across
`packages/server` and `apps/hook/server`: the guard at `:540` is the only place
`"plan"` is tested, and `apps/hook/server/index.ts:1310,1323,1353-1356` consume
the result without re-deriving it.

### Simplification this unlocks

None — but see §9: the same two lines carry a fallback arm whose reachability is
unresolved. These two sections are about the same code and should be read
together.

---

## Cross-cutting notes for the spec rewrite

**`AGENTS.md` is the most stale document in the repo**, more so than `spec/`.
Concrete defects found while writing this:

| Line | Claim | Reality |
|---|---|---|
| `:75` | code-review scopes include `ai`, `suggestionModal`, `tourDialog` | none exist; `reviewChrome` missing |
| `:160` vs `:491` | "no remote mode" vs "fixed port 19432 in remote mode" | the file contradicts itself |
| `:275` | dialog chain "guide intro → look-and-feel → review setup → Edit Mode → token hover cards" | three of five deleted |
| `:460` | full API row for `/api/code-nav/hover` | route deleted |
| `:205,227,237,244,329,340,723` | compact/touch rows as a live surface | unreachable |

**Two removals left no trace at all** — the image annotator (§5) and WebMCP (§3).
Both were self-contained directories with a single seam. The removals that left
the most behind — compact touch (§1), Conventional Comments (§6) — were props
threaded through components that survived. That is the pattern worth naming in
whatever consistency spec comes out of workstream F: a feature that owns a
directory removes cleanly; a feature that owns a prop does not.

**Things I did not verify and would be guessing about:**

- Whether `useViewportEnvironment` (350 lines) and the `--pn-safe-*` token family still earn their place on a desktop-only product. They are not compact-gated, so they are not a leftover of §1 — but the question they answer (what does the visible viewport do when a software keyboard opens) may no longer arise.
- Whether the `stagedFiles` decoration in §12 is dead or is the "reading staged changes" `spec/01:32` asks to preserve.
- Whether any live caller of `/api/approve` still omits `permissionMode` (§9).
- Whether `scripts/dast/target.ts`'s port pin still reaches a running server (§7). I did not run it, per the no-execution rule.
- Whether the OpenCode agent-validation path in `packages/editor/App.tsx:1910,2974` is live code or a leftover of the `apps/opencode-plugin` removal (§11).
