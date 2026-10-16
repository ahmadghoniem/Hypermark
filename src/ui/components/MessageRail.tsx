import React, { useEffect, useMemo, useRef, useState } from 'react';
/** A recent assistant message offered by annotate-last. */
export interface PickerMessage {
  messageId: string;
  text: string;
  timestamp?: string;
}
import {
  createWheelStepper,
  formatRelativeTime,
  isShortMessage,
  railPreview,
  railTickWidth,
} from '../utils/messageRail';

import { Eye, EyeOff, Terminal } from '@untitledui/icons';
import { Button } from '../fluid/components/button';
import { Tooltip } from '../fluid/components/tooltip';
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
  /** Whether short messages are shown, as dimmed ticks. */
  showShort?: boolean;
  /**
   * Turns on hiding short messages (see `isShortMessage`), with an eye
   * under the ticks. Without it every message is shown as before.
   */
  onShowShortChange?: (show: boolean) => void;
}

/**
 * Tick-mark rail of recent assistant messages, oldest at the top. Hover or
 * keyboard focus grows the ticks near the pointer and shows a preview card to
 * the left, over the document; a click opens the message. Focus from a click
 * doesn't hold the card open, so it goes away once the pointer leaves. The
 * wheel over the rail opens the previous or next message, one per notch, and
 * the card follows it; the page doesn't scroll. One-line messages can be
 * hidden; the open message never is.
 */
export const MessageRail: React.FC<MessageRailProps> = ({
  messages,
  selectedMessageId,
  onSelect,
  annotationCounts,
  className = 'flex',
  showShort = false,
  onShowShortChange,
}) => {
  const ToggleIcon = showShort ? EyeOff : Eye;
  const shortIds = useMemo(() => new Set(
    onShowShortChange
      ? messages.filter((m) => m.messageId !== selectedMessageId && isShortMessage(m.text)).map((m) => m.messageId)
      : [],
  ), [messages, selectedMessageId, onShowShortChange]);
  const toggleLabel = showShort
    ? 'Hide short messages'
    : `Show ${shortIds.size} short message${shortIds.size === 1 ? '' : 's'}`;
  const ordered = useMemo(
    () => [...messages].reverse().filter((m) => showShort || !shortIds.has(m.messageId)),
    [messages, shortIds, showShort],
  );
  const selectedIndex = ordered.findIndex((m) => m.messageId === selectedMessageId);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const navRef = useRef<HTMLElement>(null);
  // What the wheel listener, attached once, steps from.
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
  }, []);

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
          const dim = shortIds.has(message.messageId);
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
                  selected ? 'bg-primary' : lit ? 'bg-foreground/90' : dim ? 'bg-muted-foreground/25' : 'bg-muted-foreground/60'
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
            className="pointer-events-none absolute rounded-2xl border border-border bg-popover px-3.5 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.8)]"
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
              <span className="text-micro text-muted-foreground">Assistant</span>
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

      {shortIds.size > 0 && (
        <Tooltip side="left" content={toggleLabel}>
          <Button
            variant="ghost"
            size="icon-compact"
            aria-pressed={showShort}
            aria-label={toggleLabel}
            onClick={() => onShowShortChange?.(!showShort)}
            className="mt-1 self-end"
          >
            <ToggleIcon />
          </Button>
        </Tooltip>
      )}
    </nav>
  );
};
