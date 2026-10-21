import React, { useEffect, useMemo, useRef, useState } from 'react';
/** A recent assistant message offered by annotate-last. */
export interface PickerMessage {
  messageId: string;
  text: string;
  timestamp?: string;
  /** A compaction comes between this message and the next newer one. */
  compactedAfter?: boolean;
  /** Short or status-only: the rail leaves it out unless it's open. */
  hidden?: boolean;
}
import {
  compactionMarkIds,
  createWheelStepper,
  formatRelativeTime,
  railPreview,
  railTickWidth,
} from '../utils/messageRail';

import { Terminal } from '@untitledui/icons';
const RAIL_WIDTH = 36;
const PITCH = 16;
const TICK_SIZES = { open: 20, rest: 12, hoverMax: 32 };
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
 * the left, over the document; a click opens the message. Focus from a click
 * doesn't hold the card open, so it goes away once the pointer leaves. The
 * wheel over the rail opens the previous or next message, one per notch, and
 * the card glides along with it; the page doesn't scroll. Messages the server marks
 * `hidden` (short or status-only) are left out, except the open one; with
 * fewer than two ticks left the rail draws nothing. The first shown message
 * after a compaction says so in its preview card and its label.
 */
export const MessageRail: React.FC<MessageRailProps> = ({
  messages,
  selectedMessageId,
  onSelect,
  annotationCounts,
  className = 'flex',
}) => {
  const ordered = useMemo(
    () => [...messages].reverse().filter((m) => m.messageId === selectedMessageId || !m.hidden),
    [messages, selectedMessageId],
  );
  const compactedIds = useMemo(() => {
    const shown = new Set(ordered.map((m) => m.messageId));
    return compactionMarkIds([...messages].reverse(), (id) => shown.has(id));
  }, [messages, ordered]);
  const drawn = ordered.length >= 2;
  const selectedIndex = ordered.findIndex((m) => m.messageId === selectedMessageId);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const navRef = useRef<HTMLElement>(null);
  // What the wheel listener, attached once the rail is drawn, steps from.
  const latest = useRef({ ordered, selectedIndex, onSelect });
  useEffect(() => {
    latest.current = { ordered, selectedIndex, onSelect };
  });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const stepWheel = createWheelStepper();
    // Non-passive, so the wheel over the rail doesn't scroll the page.
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const direction = stepWheel(e);
      const { ordered: list, selectedIndex: from, onSelect: open } = latest.current;
      const next = Math.max(0, Math.min(list.length - 1, (from >= 0 ? from : list.length - 1) + direction));
      if (direction === 0 || next === from) return;
      setPointerIndex(next);
      open(list[next].messageId);
    };
    nav.addEventListener('wheel', handleWheel, { passive: false });
    return () => nav.removeEventListener('wheel', handleWheel);
  }, [drawn]);

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

  if (!drawn) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Recent assistant messages"
      className={`relative z-panel shrink-0 flex-col justify-center ${className}`}
      style={{ width: RAIL_WIDTH }}
      onPointerLeave={() => setPointerIndex(null)}
    >
      <div className="relative py-1.5">
        {ordered.map((message, index) => {
          const count = annotationCounts?.get(message.messageId) ?? 0;
          const selected = index === selectedIndex;
          const lit = index === activeIndex;
          const compacted = compactedIds.has(message.messageId);
          const preview = railPreview(message.text);
          const label = compacted ? `${preview}, after a compaction` : preview;
          return (
            <button
              key={message.messageId}
              ref={(el) => { tickRefs.current[index] = el; }}
              type="button"
              tabIndex={index === tabStop ? 0 : -1}
              aria-current={selected ? 'true' : undefined}
              aria-label={count > 0 ? `${label}, ${count} annotation${count === 1 ? '' : 's'}` : label}
              onPointerEnter={() => setPointerIndex(index)}
              onFocus={(e) => setFocusIndex(e.currentTarget.matches(':focus-visible') ? index : null)}
              onBlur={() => setFocusIndex(null)}
              onClick={() => onSelect(message.messageId)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="flex w-full items-center justify-end rounded-[5px] p-0 px-1 outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary/55"
              style={{ height: PITCH }}
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
                  width: railTickWidth(index, activeIndex, selectedIndex, TICK_SIZES),
                  height: 2.5,
                }}
              />
            </button>
          );
        })}

        {active && activeIndex !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-2xl border border-border bg-popover px-3.5 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.8)] transition-[top] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{
              right: RAIL_WIDTH + 8,
              width: 288,
              top: 6 + activeIndex * PITCH + PITCH / 2 - 34,
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid size-4.5 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
                <Terminal className="size-2.5" strokeWidth={2.5} />
              </span>
              <span className="text-micro text-muted-foreground">
                Assistant{compactedIds.has(active.messageId) ? ' · after a compaction' : ''}
              </span>
              <span className="ml-auto flex items-center gap-2 text-micro text-muted-foreground/60">
                {activeCount > 0 && (
                  <span>{activeCount} annotation{activeCount === 1 ? '' : 's'}</span>
                )}
                {activeTime && <span>{activeTime}</span>}
              </span>
            </div>
            <p className="line-clamp-2 text-body font-semibold text-foreground">
              {railPreview(active.text)}
            </p>
          </div>
        )}
      </div>
    </nav>
  );
};
