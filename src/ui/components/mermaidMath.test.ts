import { describe, expect, test } from 'bun:test';
import { extractDiagramMath, lineBox, withMathWidths } from './mermaidMath';

const OPEN = String.fromCharCode(0x2045);
const CLOSE = String.fromCharCode(0x2046);

describe('extractDiagramMath', () => {
  test('swaps each $$ expression for a numbered placeholder', () => {
    const math = extractDiagramMath('flowchart LR\n  A["Area $$\\pi r^2$$"] --> B["$$ x $$ and $$y$$"]');
    expect(math.tex).toEqual(['\\pi r^2', 'x', 'y']);
    expect(math.source).toBe(`flowchart LR\n  A["Area ${OPEN}0${CLOSE}"] --> B["${OPEN}1${CLOSE} and ${OPEN}2${CLOSE}"]`);
  });

  test('leaves a diagram without math alone', () => {
    const source = 'flowchart LR\n  A["costs $5"] --> B';
    expect(extractDiagramMath(source)).toEqual({ source, tex: [] });
  });
});

describe('withMathWidths', () => {
  const base = { width: (text: string, size: number) => text.length * size };
  const measurer = withMathWidths(base, (index, fontSize) => ({ width: (index + 1) * 10 * fontSize, height: fontSize }));

  test('counts each placeholder at its math width and the rest as text', () => {
    expect(measurer.width(`ab ${OPEN}0${CLOSE} c${OPEN}1${CLOSE}`, 2, 0)).toBe(3 * 2 + 10 * 2 + 2 * 2 + 20 * 2);
  });

  test('measures text without placeholders as the base does', () => {
    expect(measurer.width('plain', 3, 0)).toBe(15);
  });
});

describe('lineBox', () => {
  test('centers a middle-anchored line on its x and its middle', () => {
    expect(lineBox({ x: 0, y: 5.6, anchor: 'middle', fontSize: 16, width: 40, mathHeight: 10 })).toEqual({
      x: -20,
      y: -12,
      width: 40,
      height: 24,
    });
  });

  test('grows to fit math taller than the line', () => {
    const box = lineBox({ x: 10, y: 5.6, anchor: 'start', fontSize: 16, width: 40, mathHeight: 40 });
    expect(box).toEqual({ x: 10, y: -20, width: 40, height: 40 });
  });
});
