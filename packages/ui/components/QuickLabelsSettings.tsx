import React, { useCallback, useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { useQuickLabels } from '../hooks/useQuickLabels';
import {
  QUICK_LABEL_COLORS,
  QUICK_LABEL_MAX_COUNT,
  QUICK_LABEL_MAX_TIP,
  quickLabelId,
  type QuickLabel,
} from '../utils/quickLabels';

const DOT_CLASS: Record<string, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  orange: 'bg-orange-400',
  cyan: 'bg-cyan-400',
  red: 'bg-destructive',
  blue: 'bg-primary',
};

type Draft = { id?: string; text: string; tip: string; color: string };

export const QuickLabelsButton: React.FC = () => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [labels, save] = useQuickLabels();
  const [error, setError] = useState<string | null>(null);

  const moveLabel = (fromIdx: number, toIdx: number) => {
    const next = [...labels];
    const [removed] = next.splice(fromIdx, 1);
    if (removed) {
      next.splice(toIdx, 0, removed);
      save(next);
    }
  };

  // Drag-to-reorder from the grip on the left of each row. The rows are a
  // uniform height, so the target index is the travel divided by that height
  // — no per-row hit testing, and it keeps working while the pointer is
  // outside the list.
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; offset: number; pitch: number } | null>(null);
  // True for the one frame that commits the new order. The rows land in their
  // new DOM slots and lose their transforms in the same paint, which is exactly
  // where they already are — but with `transition-transform` still on, the
  // browser animates that transform back to zero and every row appears to jump.
  const [settling, setSettling] = useState(false);

  const beginReorder = useCallback((index: number, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement).closest('[data-label-row]');
    // Pitch is the row plus the 2px `space-y-0.5` gap: the distance a row
    // travels when it swaps with its neighbour.
    const pitch = (row?.getBoundingClientRect().height || 26) + 2;
    const startY = event.clientY;
    const count = labels.length;
    let to = index;

    const move = (e: PointerEvent) => {
      const offset = e.clientY - startY;
      to = Math.max(0, Math.min(count - 1, index + Math.round(offset / pitch)));
      // The grabbed row tracks the pointer 1:1; the rest slide by one pitch.
      setDrag({ from: index, to, offset, pitch });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (to !== index) {
        setSettling(true);
        moveLabel(index, to);
        requestAnimationFrame(() => setSettling(false));
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels]);

  /** Keyboard parity for the grip, which replaced the move buttons. */
  const gripKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      moveLabel(index, index - 1);
    } else if (e.key === 'ArrowDown' && index < labels.length - 1) {
      e.preventDefault();
      moveLabel(index, index + 1);
    }
  };

  const handleSave = () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      setError('Give the label a name.');
      return;
    }
    const isNew = !draft.id;
    if (isNew && labels.length >= QUICK_LABEL_MAX_COUNT) {
      setError('That is as many labels as fit.');
      return;
    }
    const tip = draft.tip.trim();
    const id = draft.id ?? quickLabelId(draft.text, labels.map((l) => l.id));
    const newLabel: QuickLabel = {
      id,
      emoji: '',
      text,
      color: draft.color,
      ...(tip ? { tip } : {}),
    };
    const next = draft.id
      ? labels.map((l) => (l.id === draft.id ? newLabel : l))
      : [...labels, newLabel];
    save(next);
    setDraft(null);
    setError(null);
  };

  return (
    <Popover onOpenChange={(open) => { if (!open) { setDraft(null); setError(null); } }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
            title="Quick labels"
            aria-label="Quick labels"
          />
        }
      >
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth={2.5} />
        </svg>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-0">
        {draft === null ? (
          <div>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <span className="text-xs font-semibold">Quick labels</span>
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
              {labels.map((label, index) => {
                const lifted = drag?.from === index;
                // The grabbed row follows the pointer; the rows it passes slide
                // one pitch the other way, so the list reads as its new order
                // and no empty slot opens up behind it.
                const shift = drag && !lifted
                  ? (drag.from < index && index <= drag.to ? -1
                    : drag.from > index && index >= drag.to ? 1 : 0)
                  : 0;
                const offset = lifted && drag ? drag.offset : shift * (drag?.pitch ?? 0);

                return (
                  <div
                    key={label.id}
                    data-label-row="true"
                    style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
                    className={`group/row flex items-center gap-2 px-2 py-1 rounded-md text-xs ${
                      lifted
                        ? 'relative z-1 bg-popover shadow-[0_4px_12px_-4px_rgb(0_0_0/0.45)] ring-1 ring-border'
                        : `hover:bg-muted/50 ${settling ? '' : 'transition-transform'} ${drag ? '' : 'transition-colors'}`
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => beginReorder(index, e)}
                      onKeyDown={gripKeyDown(index)}
                      title="Drag to reorder"
                      aria-label={`Reorder ${label.text}`}
                      className="-ml-1 size-5 shrink-0 grid place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 touch-none cursor-grab active:cursor-grabbing"
                    >
                      <GripDots />
                    </button>
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${DOT_CLASS[label.color] ?? 'bg-primary'}`}
                    />
                    <span className="min-w-0 truncate text-foreground flex-1">{label.text}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setDraft({
                            id: label.id,
                            text: label.text,
                            tip: label.tip ?? '',
                            color: label.color,
                          });
                        }}
                        className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
                        title="Edit label"
                        aria-label="Edit label"
                      >
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => save(labels.filter((l) => l.id !== label.id))}
                        className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
                        title="Delete label"
                        aria-label="Delete label"
                      >
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {labels.length === 0 && (
                <div className="px-2 py-3 text-2xs text-muted-foreground text-center">
                  No labels yet. Add one to see it above the composer.
                </div>
              )}
            </div>

            <div className="p-1.5 border-t border-border/50">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setDraft({ text: '', tip: '', color: 'blue' });
                }}
                className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add label
              </button>
            </div>
          </div>
        ) : (
          <div
            className="p-3 space-y-3"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(null);
                setError(null);
              }
            }}
          >
            <div>
              <label className="block text-2xs font-medium text-muted-foreground mb-1">
                Text
              </label>
              <input
                type="text"
                autoFocus
                maxLength={60}
                value={draft.text}
                onChange={(e) => {
                  setDraft({ ...draft, text: e.target.value });
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                placeholder="e.g. Needs tests"
                className="w-full rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-muted-foreground mb-1">
                Tip
              </label>
              <textarea
                rows={2}
                maxLength={QUICK_LABEL_MAX_TIP}
                value={draft.tip}
                onChange={(e) => {
                  setDraft({ ...draft, tip: e.target.value });
                  setError(null);
                }}
                placeholder="Cover this with..."
                className="w-full resize-none rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center justify-between text-3xs text-muted-foreground mt-0.5">
                <span>Sent to the agent with the comment.</span>
                <span>{QUICK_LABEL_MAX_TIP - draft.tip.length}</span>
              </div>
            </div>

            <div>
              <span className="block text-2xs font-medium text-muted-foreground mb-1.5">Dot</span>
              <div className="flex items-center gap-2">
                {QUICK_LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={`size-4 rounded-full ${DOT_CLASS[c] ?? 'bg-primary'} transition-all ${
                      draft.color === c
                        ? 'ring-2 ring-foreground ring-offset-2 ring-offset-popover'
                        : 'opacity-80 hover:opacity-100 hover:scale-110'
                    }`}
                    aria-label={c}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {error && <div className="text-2xs text-destructive">{error}</div>}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                className="px-2.5 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** Six dots in two columns: the conventional reorder grip. */
const GripDots: React.FC = () => (
  <svg className="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="5" r="1.75" />
    <circle cx="15" cy="5" r="1.75" />
    <circle cx="9" cy="12" r="1.75" />
    <circle cx="15" cy="12" r="1.75" />
    <circle cx="9" cy="19" r="1.75" />
    <circle cx="15" cy="19" r="1.75" />
  </svg>
);
