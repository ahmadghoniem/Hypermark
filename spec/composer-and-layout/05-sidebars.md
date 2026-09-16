# 05 — Side panels: circuit table of contents, "On this page" header level with the title, no borders

Wave 1 — needs 08 (DialKit) merged. Design reference: https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ,
board **Layout**.

## What changes

**Left sidebar**
- The tab bar (Contents / Versions / Messages) is replaced by a single header
  row: an outline icon and **On this page**.
  - The Messages tab goes away (spec 06 replaces it with the message rail).
  - Versions stays reachable: when the plan has more than one version, the
    header shows a small clock button that switches the sidebar to Versions;
    in Versions the header reads **Versions** and the button switches back.
- The header is not at the top of the sidebar: the sidebar gets top padding
  so the header sits level with the document's first heading (docs-site
  convention). The padding is measured, because the toolstrip, sticky actions
  and breakpoint paddings all move the title.
- The table of contents is drawn in the **circuit** style: one continuous
  hairline down the left; it bends inward with a short curve for level-3
  headings and back out after them. The active heading's segment is a 2px
  primary line and its text is primary. Rows are 28px, one line, truncated.
- **No annotation counts** on the rows.
- Row height, the two line tracks and the hairline's weight come from the
  `05 · Sidebar` dial panel (spec 08's convention), registered in
  `SidebarContainer` and passed down to `TableOfContents`.
- No `border-r` on the sidebar, no `border-b` under the header.

**Right panel (annotations)**
- No `border-l`, no `border-b` under its header. Both panels already use
  `bg-card`, the same as the document area, so they now blend into the page.

## Owned files

- `packages/ui/utils/tocCircuit.ts` (new)
- `packages/ui/utils/tocCircuit.test.ts` (new)
- `packages/ui/components/TableOfContents.tsx`
- `packages/ui/components/sidebar/SidebarContainer.tsx`
- `packages/ui/components/sidebar/SidebarTabs.tsx`
- `packages/ui/components/AnnotationPanel.tsx` — lines 183 and 189 only.
- `packages/editor/App.tsx` — a new effect above `renderPlanSidebar` (~line 2238), `renderPlanSidebar` props (2265–2269), `SidebarTabs` props (2374–2375).

Do **not** delete `sidebar/MessagesBrowser.tsx`, `icons/MessagesIcon.tsx`, or
the `'messages'` member of `SidebarTab` — spec 07 does, after spec 06 lands.

## 1. `packages/ui/utils/tocCircuit.ts`

```ts
/** Row height of the circuit table of contents, in px. */
export const TOC_ROW_HEIGHT = 28;
/** x of the line for levels 1–2, and for level 3, in px. */
export const TOC_LINE_OUTER = 6;
export const TOC_LINE_INNER = 18;

/** x of the line for a heading level: levels 1–2 on the outer track, 3 inset. */
export function tocLineX(level: number, outer = TOC_LINE_OUTER, inner = TOC_LINE_INNER): number {
  return level >= 3 ? inner : outer;
}

/**
 * SVG path of the continuous line. It runs down the outer track and bends
 * inward with a short curve where the level changes.
 */
export function buildTocCircuitPath(
  levels: readonly number[],
  row = TOC_ROW_HEIGHT,
  outer = TOC_LINE_OUTER,
  inner = TOC_LINE_INNER,
): string {
  const n = levels.length;
  if (n === 0) return '';
  const xs = levels.map((level) => tocLineX(level, outer, inner));
  let d = `M ${xs[0]} 6`;
  for (let i = 0; i < n; i++) {
    const top = i * row;
    if (i > 0 && xs[i] !== xs[i - 1]) {
      d += ` C ${xs[i - 1]} ${top}, ${xs[i]} ${top}, ${xs[i]} ${top + 7}`;
    }
    const bottom = i === n - 1
      ? top + row - 6
      : xs[i + 1] !== xs[i] ? top + row - 7 : top + row;
    d += ` L ${xs[i]} ${bottom}`;
  }
  return d;
}

/** SVG path of the active heading's segment, or '' when none is active. */
export function buildTocActivePath(
  levels: readonly number[],
  activeIndex: number,
  row = TOC_ROW_HEIGHT,
  outer = TOC_LINE_OUTER,
  inner = TOC_LINE_INNER,
): string {
  if (activeIndex < 0 || activeIndex >= levels.length) return '';
  const x = tocLineX(levels[activeIndex], outer, inner);
  const top = activeIndex * row;
  return `M ${x} ${top + 7} L ${x} ${top + row - 5}`;
}
```

## 2. `packages/ui/utils/tocCircuit.test.ts`

```ts
import { describe, test, expect } from 'bun:test';
import { buildTocActivePath, buildTocCircuitPath, tocLineX } from './tocCircuit';

describe('tocLineX', () => {
  test('levels 1 and 2 share the outer track', () => {
    expect(tocLineX(1)).toBe(6);
    expect(tocLineX(2)).toBe(6);
    expect(tocLineX(3)).toBe(18);
  });
});

describe('buildTocCircuitPath', () => {
  test('empty', () => {
    expect(buildTocCircuitPath([])).toBe('');
  });
  test('single row', () => {
    expect(buildTocCircuitPath([2])).toBe('M 6 6 L 6 22');
  });
  test('bends inward for a level-3 heading', () => {
    expect(buildTocCircuitPath([1, 2, 3])).toBe('M 6 6 L 6 28 L 6 49 C 6 56, 18 56, 18 63 L 18 78');
  });
  test('bends back out', () => {
    expect(buildTocCircuitPath([3, 2])).toBe('M 18 6 L 18 21 C 18 28, 6 28, 6 35 L 6 50');
  });
  test('dialled row height and tracks', () => {
    expect(buildTocCircuitPath([1, 3], 32, 8, 24)).toBe('M 8 6 L 8 25 C 8 32, 24 32, 24 39 L 24 58');
  });
});

describe('buildTocActivePath', () => {
  test('active segment sits on its row track', () => {
    expect(buildTocActivePath([1, 2, 3], 2)).toBe('M 18 63 L 18 79');
  });
  test('no active heading', () => {
    expect(buildTocActivePath([1, 2], -1)).toBe('');
  });
});
```

## 3. `packages/ui/components/TableOfContents.tsx`

1. Imports: remove `getAnnotationCountBySection` from the `annotationHelpers` import; add
   ```ts
   import {
     TOC_LINE_INNER,
     TOC_LINE_OUTER,
     TOC_ROW_HEIGHT,
     buildTocActivePath,
     buildTocCircuitPath,
     tocLineX,
   } from '../utils/tocCircuit';
   ```
2. Delete `itemClasses` (lines 43–56) and its comment.
3. Keep `annotations` in `TableOfContentsProps` (callers still pass it) but
   remove it from the destructured parameters. Add four dialled props, which
   `SidebarContainer` passes and every other caller leaves at its default:
   ```ts
     /** Circuit geometry, dialled by SidebarContainer. */
     rowHeight?: number;
     lineOuter?: number;
     lineInner?: number;
     lineStroke?: number;
   ```
   and destructure them as
   `rowHeight = TOC_ROW_HEIGHT, lineOuter = TOC_LINE_OUTER, lineInner = TOC_LINE_INNER, lineStroke = 1.25`.
4. Replace the two memos (lines 69–79) with:
   ```ts
   // Counts are not shown in the table of contents, so pass an empty map.
   const tocItems = useMemo(
     () => flattenToc(buildTocHierarchy(blocks, new Map())),
     [blocks]
   );
   const levels = useMemo(() => tocItems.map((item) => item.level), [tocItems]);
   const activeIndex = tocItems.findIndex((item) => item.id === activeId);
   ```
5. Replace the list (lines 131–157, `<div className="flex flex-col gap-0.5">` through its closing `</div>`) with:
   ```tsx
        <div className="relative" style={{ height: tocItems.length * rowHeight }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={lineInner + 6}
            height={tocItems.length * rowHeight}
            fill="none"
          >
            <path
              d={buildTocCircuitPath(levels, rowHeight, lineOuter, lineInner)}
              stroke="currentColor"
              strokeWidth={lineStroke}
              strokeLinecap="round"
              className="text-muted-foreground/40"
            />
            {activeIndex >= 0 && (
              <path
                d={buildTocActivePath(levels, activeIndex, rowHeight, lineOuter, lineInner)}
                stroke="currentColor"
                strokeWidth={lineStroke + 0.75}
                strokeLinecap="round"
                className="text-primary"
              />
            )}
          </svg>
          {tocItems.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? 'location' : undefined}
                title={item.content}
                // 12px between the line and the text, whichever track the row is on.
                style={{ height: rowHeight, paddingLeft: tocLineX(item.level, lineOuter, lineInner) + 12 }}
                className={`flex w-full items-center pr-1.5 text-left text-2xs font-medium transition-colors ${
                  isActive
                    ? 'text-primary'
                    : item.level <= 1
                      ? 'text-foreground hover:text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="truncate">{item.content}</span>
              </button>
            );
          })}
        </div>
   ```
6. The wrapper `<div className="p-1.5">` (line 113) becomes `<div className="px-3 pb-3">`.
7. Update the comment above `flattenToc` (lines 28–30): `Flat list in document order; depth is shown by the circuit line and indentation.`

## 4. `packages/ui/components/sidebar/SidebarContainer.tsx` — full replacement

```tsx
/**
 * SidebarContainer — the left sidebar.
 *
 * A header ("On this page", or "Versions") over the table of contents or the
 * version browser. The host passes `contentTopOffset` so the header sits level
 * with the document's first heading.
 */

import React from "react";
import { useDialKit } from "dialkit";
import type { SidebarTab } from "../../hooks/useSidebar";
import type { Block, Annotation } from "../../types";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { TableOfContents } from "../TableOfContents";
import { VersionBrowser } from "./VersionBrowser";
import { OverlayScrollArea } from "../OverlayScrollArea";

interface SidebarContainerProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  width: number | string;
  /** Top padding, in px, that puts the header level with the document title. */
  contentTopOffset?: number;
  // TOC props
  showContentsTab?: boolean;
  blocks: Block[];
  annotations: Annotation[];
  activeSection: string | null;
  onTocNavigate: (blockId: string) => void;
  linkedDocFilepath?: string | null;
  onLinkedDocBack?: () => void;
  backLabel?: string;
  // Version Browser props
  showVersionsTab?: boolean;
  versionInfo: VersionInfo | null;
  versions: VersionEntry[];
  selectedBaseVersion: number | null;
  onSelectBaseVersion: (version: number) => void;
  isPlanDiffActive: boolean;
  hasPreviousVersion: boolean;
  onActivatePlanDiff: () => void;
  isLoadingVersions: boolean;
  isSelectingVersion: boolean;
  fetchingVersion: number | null;
  onFetchVersions: () => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  activeTab,
  onTabChange,
  width,
  contentTopOffset = 0,
  showContentsTab = true,
  blocks,
  annotations,
  activeSection,
  onTocNavigate,
  linkedDocFilepath,
  onLinkedDocBack,
  backLabel,
  showVersionsTab,
  versionInfo,
  versions,
  selectedBaseVersion,
  onSelectBaseVersion,
  isPlanDiffActive,
  hasPreviousVersion,
  onActivatePlanDiff,
  isLoadingVersions,
  isSelectingVersion,
  fetchingVersion,
  onFetchVersions,
}) => {
  const dials = useDialKit('05 · Sidebar', {
    rowHeight: [28, 22, 36, 1],
    /** x of the hairline for levels 1–2, and for level 3. */
    lineOuter: [6, 2, 14, 1],
    lineInner: [18, 10, 30, 1],
    lineStroke: [1.25, 0.75, 2, 0.25],
  }, { id: 'cl-05', persist: true });
  const showingVersions = activeTab === "versions" && !!showVersionsTab;

  return (
    <aside
      className="hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)] shrink-0 bg-card"
      style={{ width, paddingTop: contentTopOffset }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3.5">
        <span className="flex shrink-0 text-muted-foreground" aria-hidden="true">
          {showingVersions ? <ClockIcon /> : <OutlineIcon />}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {showingVersions ? "Versions" : "On this page"}
        </h2>
        {showVersionsTab && (
          <button
            type="button"
            onClick={() => onTabChange(showingVersions ? "toc" : "versions")}
            title={showingVersions ? "Back to contents" : "Plan versions"}
            aria-label={showingVersions ? "Back to contents" : "Plan versions"}
            aria-pressed={showingVersions}
            className="grid size-5.5 shrink-0 place-items-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showingVersions ? <OutlineIcon /> : <ClockIcon />}
          </button>
        )}
      </div>

      {/* Content area */}
      <OverlayScrollArea className="flex-1 min-h-0">
        {!showingVersions && showContentsTab && (
          <TableOfContents
            blocks={blocks}
            annotations={annotations}
            activeId={activeSection}
            onNavigate={onTocNavigate}
            className=""
            rowHeight={dials.rowHeight}
            lineOuter={dials.lineOuter}
            lineInner={dials.lineInner}
            lineStroke={dials.lineStroke}
            linkedDocFilepath={linkedDocFilepath}
            onLinkedDocBack={onLinkedDocBack}
            backLabel={backLabel}
          />
        )}
        {showingVersions && (
          <VersionBrowser
            versionInfo={versionInfo}
            versions={versions}
            selectedBaseVersion={selectedBaseVersion}
            onSelectBaseVersion={onSelectBaseVersion}
            isPlanDiffActive={isPlanDiffActive}
            hasPreviousVersion={hasPreviousVersion}
            onActivatePlanDiff={onActivatePlanDiff}
            isLoading={isLoadingVersions}
            isSelectingVersion={isSelectingVersion}
            fetchingVersion={fetchingVersion}
            onFetchVersions={onFetchVersions}
          />
        )}
      </OverlayScrollArea>
    </aside>
  );
};

/** Four lines, the middle two inset: an outline. */
const OutlineIcon: React.FC = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
    <path d="M4 5h16" />
    <path d="M9 10h11" />
    <path d="M9 15h11" />
    <path d="M4 20h16" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
```

`onClose` stays in the props interface (App passes it) but is not destructured,
as before it was unused.

## 5. `packages/ui/components/sidebar/SidebarTabs.tsx`

- Delete the `showMessagesTab` and `hasMessageAnnotations` props (interface lines 18–19, destructure 29–30).
- Delete the Messages flag, lines 84–96.
- Delete the `MessagesIcon` import (line 10).

## 6. `packages/ui/components/AnnotationPanel.tsx`

- Line 183: `'shrink-0 border-l border-border/50'` → `'shrink-0'`.
- Line 189: `<div className="border-b border-border/50">` → `<div>`.

Leave the embedded (mobile) branch at line 222 as it is.

## 7. `packages/editor/App.tsx`

1. Directly above `const renderPlanSidebar = () => {` (~line 2238) add:
   ```tsx
     // Top padding that puts the sidebar header level with the document's first
     // heading. Measured, because the toolstrip, sticky actions and breakpoint
     // paddings all move the title. Both columns start at the same y.
     const [docTitleOffset, setDocTitleOffset] = useState(0);
     useLayoutEffect(() => {
       const area = planAreaRef.current;
       if (!area || isHtmlSurface || !sidebar.isOpen) return;
       const measure = () => {
         const heading = area.querySelector<HTMLElement>('article h1, article h2, article h3');
         if (!heading) {
           setDocTitleOffset(0);
           return;
         }
         const headingTop = heading.getBoundingClientRect().top - area.getBoundingClientRect().top;
         const lineHeight = parseFloat(getComputedStyle(heading).lineHeight) || heading.offsetHeight;
         // The header row is 40px tall with its text centred: align the centres.
         setDocTitleOffset(Math.max(0, Math.round(headingTop + lineHeight / 2 - 20)));
       };
       measure();
       const observer = new ResizeObserver(measure);
       observer.observe(area);
       return () => observer.disconnect();
     }, [isHtmlSurface, sidebar.isOpen, viewerContentKey]);
   ```
   This must stay above the `if (isLoading) { return … }` early return (line 2303). `useState`, `useLayoutEffect` and `planAreaRef` already exist in this file.
2. In `renderPlanSidebar`, delete the five props on lines 2265–2269 (`showMessagesTab` … `messageAnnotationCounts`) and add `contentTopOffset={docTitleOffset}` after `width=…`.
3. In the `<SidebarTabs … />` element, delete lines 2374–2375 (`showMessagesTab=…`, `hasMessageAnnotations=…`).

## Do not

- Do not change `useSidebar`, `MessagesBrowser`, `MessagesIcon` or the `SidebarTab` type (spec 07).
- Do not change the document area's background, the header, or the resize handles.
- Do not remove the Versions feature.

## Completion

- `bun test packages/ui/utils/tocCircuit.test.ts` green.
- `rg -n "annotationCount|getAnnotationCountBySection" packages/ui/components/TableOfContents.tsx` → nothing.
- `rg -n "MessagesBrowser|showMessagesTab|messageAnnotationCounts" packages/ui/components/sidebar/SidebarContainer.tsx packages/ui/components/sidebar/SidebarTabs.tsx` → nothing.
- `rg -n "border-l border-border/50" packages/ui/components/AnnotationPanel.tsx` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- `bun run dev:hook` on a markdown plan with H1–H3 headings, open the left sidebar:
  - no tab bar; "On this page" sits on the same line as the document title;
  - one hairline runs down the left and curves inward at level-3 headings; the active heading is primary with a primary segment; no count badges;
  - no border between the sidebar, the document and the annotations panel;
  - on a plan with previous versions, the clock button switches to Versions and back;
  - the DialKit panel shows a **05 · Sidebar** section; `rowHeight`, `lineOuter`, `lineInner` and `lineStroke` redraw the circuit, and the rows keep 12px between the line and their text.
