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
