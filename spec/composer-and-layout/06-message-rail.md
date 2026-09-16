# 06 — Message rail replaces the "Message N of M" button

Wave 1 — needs 08 (DialKit) merged. Design reference: https://claude.ai/artifact/GqG7c49w9VgGzRYkGMAwUQ,
boards **Layout** (the rail between the document and the annotations panel)
and **Message rail · states** (idle, hover, keyboard).

## What changes

In `annotate-last` sessions with more than one recent assistant message, a
thin rail of tick marks sits in the gutter between the document and the
annotations panel, vertically centred. One tick per message, oldest at the
top, newest at the bottom.

| State | Looks like |
|---|---|
| Idle | 2px ticks, right-aligned in a 36px column, 16px apart. The open message's tick is 20px wide and primary; the rest are 12px, `muted-foreground/60`. A 4px primary dot left of a tick marks a message that already has annotations (not shown on the open message). |
| Hover | Ticks grow by distance from the pointer: 32px, 22px, 14px, then 8px. The hovered tick turns `foreground/90`. A card opens to the left of the rail, over the document: "Assistant", relative time, the message's first line (bold, two lines max), and "Open" / "N annotations" when they apply. |
| Keyboard | Tab reaches the rail (one tab stop). Arrow Up/Down, Home and End move between ticks; the focused tick gets a primary ring and the same card. Enter or Space opens the message. |
| Click | Opens that message (same as picking it in the old Messages tab). |

It replaces the **Message N of M** button in the document actions and the
Messages sidebar tab (the tab is removed by spec 05). It is hidden below the
`lg` breakpoint and while the `Wide | Focus` view mode hides the panels (spec
10 removes that mode, and that gate with it).

The rail's width, pitch, tick sizes and card width come from the
`06 · Message rail` dial panel (spec 08's convention).

## Owned files

- `packages/ui/utils/messageRail.ts` (new)
- `packages/ui/utils/messageRail.test.ts` (new)
- `packages/ui/components/MessageRail.tsx` (new)
- `packages/ui/components/Viewer.tsx` — lines 39, 132, 335, 794–808 only.
- `packages/editor/App.tsx` — one new import, lines 2564–2574, and a new block after `</OverlayScrollArea>` (~line 2582).

## 1. `packages/ui/utils/messageRail.ts`

```ts
/** Vertical pitch of the rail, in px. */
export const RAIL_ROW_HEIGHT = 16;
/** Tick width at rest: the open message, and every other one. */
export const RAIL_TICK_OPEN = 20;
export const RAIL_TICK_REST = 12;
/** Width of the hovered tick; its neighbours fall off from it. */
export const RAIL_TICK_HOVER_MAX = 32;
/** Floor for ticks far from the pointer. */
const RAIL_TICK_MIN = 8;

export interface RailTickSizes {
  open?: number;
  rest?: number;
  hoverMax?: number;
}

/**
 * Tick width in px. At rest the open message is 20 and the rest 12. While a
 * tick is hovered or focused, widths fall off with distance from it: 32, 22,
 * 14, then 8.
 */
export function railTickWidth(
  index: number,
  activeIndex: number | null,
  selectedIndex: number,
  sizes: RailTickSizes = {},
): number {
  const { open = RAIL_TICK_OPEN, rest = RAIL_TICK_REST, hoverMax = RAIL_TICK_HOVER_MAX } = sizes;
  if (activeIndex === null) return index === selectedIndex ? open : rest;
  const falloff = [hoverMax, hoverMax - 10, hoverMax - 18];
  return Math.max(RAIL_TICK_MIN, falloff[Math.abs(index - activeIndex)] ?? RAIL_TICK_MIN);
}

/** First non-empty line of a message, without leading markdown marks, capped. */
export function railPreview(text: string, max = 90): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '').trim())
    .find((l) => l.length > 0) ?? '';
  const flat = line.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** "just now", "5m ago", "3h ago", "2d ago"; null for a missing or invalid time. */
export function formatRelativeTime(timestamp: string | undefined, now: number): string | null {
  if (!timestamp) return null;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

## 2. `packages/ui/utils/messageRail.test.ts`

```ts
import { describe, test, expect } from 'bun:test';
import { formatRelativeTime, railPreview, railTickWidth } from './messageRail';

describe('railTickWidth', () => {
  test('at rest the open message is longer', () => {
    expect(railTickWidth(3, null, 3)).toBe(20);
    expect(railTickWidth(2, null, 3)).toBe(12);
  });
  test('hover falls off with distance', () => {
    expect(railTickWidth(5, 5, 0)).toBe(32);
    expect(railTickWidth(4, 5, 0)).toBe(22);
    expect(railTickWidth(7, 5, 0)).toBe(14);
    expect(railTickWidth(0, 5, 0)).toBe(8);
  });
  test('dialled sizes, with the floor holding', () => {
    expect(railTickWidth(2, null, 2, { open: 28, rest: 8 })).toBe(28);
    expect(railTickWidth(5, 5, 0, { hoverMax: 24 })).toBe(24);
    expect(railTickWidth(7, 5, 0, { hoverMax: 24 })).toBe(8);
  });
});

describe('railPreview', () => {
  test('skips blank lines and markdown marks', () => {
    expect(railPreview('\n\n## Remove the agent terminal\nmore')).toBe('Remove the agent terminal');
    expect(railPreview('- item one')).toBe('item one');
  });
  test('caps long lines', () => {
    expect(railPreview('a'.repeat(200), 10)).toBe('aaaaaaaaa…');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');
  test('buckets', () => {
    expect(formatRelativeTime('2026-09-16T11:59:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-09-16T11:55:00Z', now)).toBe('5m ago');
    expect(formatRelativeTime('2026-09-16T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-09-14T12:00:00Z', now)).toBe('2d ago');
  });
  test('missing or invalid', () => {
    expect(formatRelativeTime(undefined, now)).toBeNull();
    expect(formatRelativeTime('nope', now)).toBeNull();
  });
});
```

## 3. `packages/ui/components/MessageRail.tsx`

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKit } from 'dialkit';
import type { PickerMessage } from './sidebar/MessagesBrowser';
import {
  RAIL_ROW_HEIGHT,
  formatRelativeTime,
  railPreview,
  railTickWidth,
} from '../utils/messageRail';

interface MessageRailProps {
  /** Recent assistant messages, newest first (as the server sends them). */
  messages: readonly PickerMessage[];
  selectedMessageId: string | null;
  onSelect: (messageId: string) => void;
  annotationCounts?: ReadonlyMap<string, number>;
  /** Display classes from the host, e.g. `hidden lg:flex`. Must set display. */
  className?: string;
}

/**
 * Tick-mark rail of recent assistant messages, oldest at the top. Hover or
 * keyboard focus grows the ticks near the pointer and shows a preview card to
 * the left, over the document; a click opens the message.
 */
export const MessageRail: React.FC<MessageRailProps> = ({
  messages,
  selectedMessageId,
  onSelect,
  annotationCounts,
  className = 'flex',
}) => {
  const dials = useDialKit('06 · Message rail', {
    railWidth: [36, 24, 56, 2],
    /** Vertical distance between ticks. */
    pitch: [RAIL_ROW_HEIGHT, 10, 28, 1],
    tickOpen: [20, 10, 36, 1],
    tickRest: [12, 6, 24, 1],
    /** Width of the tick under the pointer; its neighbours fall off from it. */
    tickHoverMax: [32, 16, 48, 2],
    tickThickness: [2, 1, 4, 0.5],
    cardWidth: [288, 200, 360, 8],
  }, { id: 'cl-06', persist: true });
  const tickSizes = { open: dials.tickOpen, rest: dials.tickRest, hoverMax: dials.tickHoverMax };
  const ordered = useMemo(() => [...messages].reverse(), [messages]);
  const selectedIndex = ordered.findIndex((m) => m.messageId === selectedMessageId);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = pointerIndex ?? focusIndex;
  const tabStop = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : ordered.length - 1);

  useEffect(() => {
    if (activeIndex !== null) setNow(Date.now());
  }, [activeIndex]);

  const focusTick = (index: number) => {
    const next = Math.max(0, Math.min(ordered.length - 1, index));
    tickRefs.current[next]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: ordered.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      focusTick(moves[event.key]);
    }
  };

  const active = activeIndex !== null ? ordered[activeIndex] : undefined;
  const activeCount = active ? annotationCounts?.get(active.messageId) ?? 0 : 0;
  const activeTime = active ? formatRelativeTime(active.timestamp, now) : null;

  return (
    <nav
      aria-label="Recent assistant messages"
      className={`relative z-panel shrink-0 flex-col justify-center ${className}`}
      style={{ width: dials.railWidth }}
      onPointerLeave={() => setPointerIndex(null)}
    >
      <div className="relative py-1.5">
        {ordered.map((message, index) => {
          const count = annotationCounts?.get(message.messageId) ?? 0;
          const selected = index === selectedIndex;
          const lit = index === activeIndex;
          const preview = railPreview(message.text);
          return (
            <button
              key={message.messageId}
              ref={(el) => { tickRefs.current[index] = el; }}
              type="button"
              tabIndex={index === tabStop ? 0 : -1}
              aria-current={selected ? 'true' : undefined}
              aria-label={count > 0 ? `${preview}, ${count} annotation${count === 1 ? '' : 's'}` : preview}
              onPointerEnter={() => setPointerIndex(index)}
              onFocus={() => setFocusIndex(index)}
              onBlur={() => setFocusIndex(null)}
              onClick={() => onSelect(message.messageId)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="flex w-full items-center justify-end rounded-[5px] p-0 px-1 outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary/55"
              style={{ height: dials.pitch }}
            >
              {count > 0 && !selected && (
                <span aria-hidden="true" className="mr-1.25 size-1 shrink-0 rounded-full bg-primary/85" />
              )}
              <span
                aria-hidden="true"
                className={`block rounded-full transition-[width] duration-150 motion-reduce:transition-none ${
                  selected ? 'bg-primary' : lit ? 'bg-foreground/90' : 'bg-muted-foreground/60'
                }`}
                style={{
                  width: railTickWidth(index, activeIndex, selectedIndex, tickSizes),
                  height: dials.tickThickness,
                }}
              />
            </button>
          );
        })}

        {active && activeIndex !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-2xl border border-border bg-popover px-3.5 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.8)]"
            style={{
              right: dials.railWidth + 8,
              width: dials.cardWidth,
              top: 6 + activeIndex * dials.pitch + dials.pitch / 2 - 34,
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid size-4.5 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
                <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 17l6-6-6-6" />
                  <path d="M12 19h8" />
                </svg>
              </span>
              <span className="text-2xs text-muted-foreground">Assistant</span>
              {activeTime && <span className="ml-auto text-2xs text-muted-foreground/60">{activeTime}</span>}
            </div>
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
              {railPreview(active.text)}
            </p>
            {(activeIndex === selectedIndex || activeCount > 0) && (
              <div className="mt-2 flex items-center gap-2">
                {activeIndex === selectedIndex && (
                  <span className="rounded-full bg-primary/12 px-1.5 py-px text-3xs font-medium text-primary">Open</span>
                )}
                {activeCount > 0 && (
                  <span className="text-3xs text-muted-foreground">
                    {activeCount} annotation{activeCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
```

## 4. `packages/ui/components/Viewer.tsx`

- Line 39: delete `import { MessagesIcon } from './icons/MessagesIcon';`
- Line 132: delete the `messagePickerInfo?: …` prop.
- Line 335: delete `messagePickerInfo,` from the destructured props.
- Lines 794–808: delete the `{messagePickerInfo && (<button …>…</button>)}` block.

## 5. `packages/editor/App.tsx`

1. Imports: after line 58 (`SidebarContainer` import) add
   ```ts
   import { MessageRail } from '@hypermark/ui/components/MessageRail';
   ```
2. Delete the `messagePickerInfo={…}` prop on the `<Viewer>` element, lines 2564–2574.
3. Directly after the document area's closing `</OverlayScrollArea>` (~line 2582), before the `{/* Right panel region …` comment, add:
   ```tsx
          {/* Message rail - recent assistant messages, in the gutter between
              the document and the annotations panel. Replaces the Messages
              sidebar tab and the "Message N of M" button. */}
          {annotateSource === 'message' && recentMessages.length > 1 && wideModeType === null && (
            <MessageRail
              className="hidden lg:flex"
              messages={recentMessages}
              selectedMessageId={selectedMessageId}
              onSelect={handleSelectMessage}
              annotationCounts={activeMessageAnnotationCounts}
            />
          )}
   ```

## Do not

- Do not touch `SidebarContainer`, `SidebarTabs`, `MessagesBrowser` or `useSidebar` (specs 05 and 07).
- Do not change how a message is selected (`handleSelectMessage`) or how counts are computed.

## Completion

- `bun test packages/ui/utils/messageRail.test.ts` green.
- `rg -n "messagePickerInfo" packages --glob '!**/dist/**'` → nothing.
- `bun run typecheck && bun run typecheck:editors` green.
- Run `hypermark annotate-last` in a session with several assistant messages, window at least 1024px wide:
  - a column of ticks sits between the document and the annotations panel, vertically centred; the newest is at the bottom and the open one is long and blue;
  - hovering grows the nearby ticks and shows the card to the left over the document; clicking a tick switches the message;
  - Tab onto the rail, arrow keys move the ring and the card, Enter opens;
  - the DialKit panel shows a **06 · Message rail** section, and `railWidth`, `pitch`, the three tick sizes, `tickThickness` and `cardWidth` all change the rail in place;
  - there is no "Message N of M" button above the document.
