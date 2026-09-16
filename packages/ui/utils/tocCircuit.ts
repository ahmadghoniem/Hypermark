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
