import React from 'react';

import { CheckCircle, Circle } from '@untitledui/icons';
/**
 * Shared list-item marker used by both the main Viewer and the plan-diff
 * clean view. Renders the appropriate glyph(s) for a list item given its
 * level, ordered flag, display index, and checkbox state.
 *
 * Rendering rules:
 *   - Ordered items render `${orderedIndex}.` with tabular-nums so digit
 *     widths stay stable across e.g. `9.` → `10.`.
 *   - Checkbox items render the circle / checkmark SVG.
 *   - Ordered + checkbox renders BOTH: numeral first, checkbox second
 *     (matches GitHub's `1. [ ] task` rendering).
 *   - Plain bullets fall back to `•` / `◦` / `▪` by level.
 *
 * Interactivity is opt-in: the Viewer passes `interactive` + `onToggle`
 * for click-to-toggle checkboxes; the diff view leaves both undefined.
 */
interface ListMarkerProps {
  level: number;
  ordered?: boolean;
  orderedIndex?: number | null;
  checked?: boolean; // undefined = not a checkbox
  interactive?: boolean;
  onToggle?: () => void;
}

const BULLET_BY_LEVEL = ['\u2022', '\u2022', '\u2022'];

export const ListMarker: React.FC<ListMarkerProps> = ({
  level,
  ordered,
  orderedIndex,
  checked,
  interactive,
  onToggle,
}) => {
  const isCheckbox = checked !== undefined;
  const showNumeral = !!ordered && orderedIndex != null;
  const bullet = BULLET_BY_LEVEL[Math.min(level, BULLET_BY_LEVEL.length - 1)];

  const handleClick = interactive && onToggle
    ? (e: React.MouseEvent) => { e.stopPropagation(); onToggle(); }
    : undefined;

  return (
    <span
      className={`annotation-exclude select-none shrink-0 self-start flex items-center gap-1${interactive ? ' cursor-pointer' : ''}`}
      onClick={handleClick}
      role={interactive ? 'checkbox' : undefined}
      aria-checked={interactive ? checked : undefined}
    >
      {showNumeral && (
        <span className="text-sm/relaxed text-primary/60 tabular-nums text-right" style={{ minWidth: '1.5rem' }}>
          {orderedIndex}.
        </span>
      )}
      {isCheckbox ? (
        checked ? (
          <CheckCircle className="size-4 text-success mt-0.75" strokeWidth={2.5} />
        ) : (
          <Circle className={`size-4 text-muted-foreground/50 mt-0.75${interactive ? ' hover:text-muted-foreground transition-colors' : ''}`} />
        )
      ) : !showNumeral ? (
        <span className="text-primary/60">{bullet}</span>
      ) : null}
    </span>
  );
};
