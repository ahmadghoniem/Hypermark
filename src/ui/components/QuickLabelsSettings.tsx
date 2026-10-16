import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/ui/fluid/components/button';
import { ScrollArea } from '@/ui/fluid/components/scroll-area';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import { popupViewportClass } from '@/ui/fluid/lib/popup';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { useQuickLabels } from '../hooks/useQuickLabels';
import {
  QUICK_LABEL_MAX_COUNT,
  quickLabelId,
  type QuickLabel,
} from '../utils/quickLabels';

import { Edit02, Plus, Tag01, XClose } from '@untitledui/icons';
type Draft = { id?: string; text: string };

export const QuickLabelsButton: React.FC = () => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [labels, save] = useQuickLabels();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
    const id = draft.id ?? quickLabelId(draft.text, labels.map((l) => l.id));
    const newLabel: QuickLabel = { id, emoji: '', text };
    const next = draft.id
      ? labels.map((l) => (l.id === draft.id ? newLabel : l))
      : [...labels, newLabel];
    save(next);
    setDraft(null);
    setError(null);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setDraft(null); setError(null); } }}>
      <Tooltip content="Quick labels" side="bottom">
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-compact" active={open} aria-label="Quick labels" />
          }
        >
          <Tag01 className="size-4" />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="bottom" align="end" className="w-72 p-0">
        {draft === null ? (
          <div>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <span className="text-caption font-semibold">Quick labels</span>
            </div>

            <ScrollArea className="max-h-64 min-h-0" viewportClassName={popupViewportClass}>
            <div ref={listRef} className="p-1.5 space-y-0.5">
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
                    className={`group/row flex items-center gap-2 px-2 py-1 rounded-md text-caption ${
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
                    <span className="min-w-0 truncate text-foreground flex-1">{label.text}</span>
                    <div className="flex items-center gap-0.5">
                      <Tooltip content="Edit label" side="top">
                        <Button
                          variant="ghost"
                          size="icon-compact"
                          onClick={() => {
                            setError(null);
                            setDraft({
                              id: label.id,
                              text: label.text,
                            });
                          }}
                          className="size-5 min-w-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity [&_svg]:size-3"
                          aria-label="Edit label"
                        >
                          <Edit02 />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete label" side="top">
                        <Button
                          variant="ghost"
                          size="icon-compact"
                          onClick={() => save(labels.filter((l) => l.id !== label.id))}
                          className="size-5 min-w-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-destructive [&_svg]:size-3"
                          aria-label="Delete label"
                        >
                          <XClose />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}

              {labels.length === 0 && (
                <div className="px-2 py-3 text-micro text-muted-foreground text-center">
                  No labels yet. Add one to see it above the composer.
                </div>
              )}
            </div>
            </ScrollArea>

            <div className="p-1.5 border-t border-border/50">
              <Button
                variant="ghost"
                size="compact"
                leadingIcon={Plus}
                className="w-full"
                onClick={() => {
                  setError(null);
                  setDraft({ text: '' });
                }}
              >
                Add label
              </Button>
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
              <label className="block text-micro font-semibold text-muted-foreground mb-1">
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
                className="w-full rounded-md border border-border bg-muted/40 px-2 py-1 text-caption text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {error && <div className="text-micro text-destructive">{error}</div>}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
              <Button
                variant="ghost"
                size="compact"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="compact" onClick={handleSave}>
                Save
              </Button>
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
