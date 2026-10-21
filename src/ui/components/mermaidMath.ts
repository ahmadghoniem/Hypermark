// `$$…$$` math in Mermaid labels, typeset with KaTeX inside Pele's SVG.
//
// Each `$$…$$` is swapped for a placeholder before Pele lays the diagram out,
// and Pele measures the placeholder at the width of the typeset math. After
// rendering, each label line holding a placeholder is replaced with a
// `foreignObject` that draws the line's text and the KaTeX HTML in place.

import { render as renderDiagram, type RenderOptions, type TextMeasurer } from 'pele';
import { loadMathRenderer, renderMathToHtml } from '../utils/math';

// Quill brackets: Pele keeps them in label text (it drops private-use
// characters), and Mermaid source has no use for them.
const OPEN = String.fromCharCode(0x2045);
const CLOSE = String.fromCharCode(0x2046);
const PLACEHOLDER = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');
const HAS_PLACEHOLDER = new RegExp(`${OPEN}\\d+${CLOSE}`);
const MATH = /\$\$([\s\S]+?)\$\$/g;

/** Pele's line height and the baseline's offset below the line's middle, in ems. */
const LINE_HEIGHT = 1.5;
const BASELINE_DROP = 0.35;
/** Pele's default label size, set on the root `<svg>`. */
const DEFAULT_FONT_SIZE = 16;
/** Math is measured once at this size and scaled for each label size. */
const MEASURE_SIZE = 100;

/** Pele's `Style` flags for `TextMeasurer.width`. */
const BOLD = 1;
const ITALIC = 2;
const MONO = 4;

export interface DiagramMath {
  /** The diagram source with each `$$…$$` replaced by a placeholder. */
  source: string;
  /** The TeX of each placeholder, by index. */
  tex: string[];
}

export function extractDiagramMath(source: string): DiagramMath {
  const tex: string[] = [];
  const replaced = source.replace(MATH, (_match, body: string) => {
    tex.push(body.trim());
    return `${OPEN}${tex.length - 1}${CLOSE}`;
  });
  return { source: replaced, tex };
}

export interface MathBox {
  width: number;
  height: number;
}

/** Text widths from `base`, with each placeholder counted at its math's width. */
export function withMathWidths(
  base: TextMeasurer,
  mathBox: (index: number, fontSize: number) => MathBox,
): TextMeasurer {
  return {
    width(text, size, style) {
      let width = 0;
      let last = 0;
      for (const match of text.matchAll(PLACEHOLDER)) {
        width += base.width(text.slice(last, match.index), size, style);
        width += mathBox(Number(match[1]), size).width;
        last = match.index + match[0].length;
      }
      return width + base.width(text.slice(last), size, style);
    },
  };
}

/** The box a label line takes, from its `<text>` position and anchor. */
export function lineBox(line: {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  fontSize: number;
  width: number;
  mathHeight: number;
}): { x: number; y: number; width: number; height: number } {
  const height = Math.max(line.fontSize * LINE_HEIGHT, line.mathHeight);
  const middle = line.y - line.fontSize * BASELINE_DROP;
  const x = line.anchor === 'middle' ? line.x - line.width / 2 : line.anchor === 'end' ? line.x - line.width : line.x;
  return { x, y: middle - height / 2, width: line.width, height };
}

function canvasMeasurer(fontFamily: string, monoFamily: string): TextMeasurer {
  const context = document.createElement('canvas').getContext('2d');
  return {
    width(text, size, style) {
      if (!text) return 0;
      if (!context) return text.length * size * 0.55;
      const family = style & MONO ? monoFamily : fontFamily;
      context.font = `${style & ITALIC ? 'italic ' : ''}${style & BOLD ? 'bold ' : ''}${size}px ${family}`;
      return context.measureText(text).width;
    },
  };
}

/** Typesets each expression off-screen in the label font, once fonts have loaded. */
async function measureMath(html: string[], fontFamily: string): Promise<MathBox[]> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;font-family:${fontFamily};font-size:${MEASURE_SIZE}px;line-height:1;white-space:nowrap`;
  const spans = html.map((markup) => {
    const span = document.createElement('span');
    span.style.display = 'inline-block';
    span.innerHTML = markup;
    host.appendChild(span);
    return span;
  });
  document.body.appendChild(host);
  try {
    // Laying the math out starts KaTeX's font loads; measure once they land.
    void host.offsetWidth;
    await document.fonts?.ready;
    return spans.map((span) => {
      const rect = span.getBoundingClientRect();
      return { width: rect.width / MEASURE_SIZE, height: rect.height / MEASURE_SIZE };
    });
  } finally {
    host.remove();
  }
}

function inherited(el: Element, name: string, skip?: string): string | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const value = node.getAttribute(name);
    if (value && value !== skip) return value;
  }
  return null;
}

/** Replaces each label line holding a placeholder with a `foreignObject` drawing it. */
function placeMath(svg: string, html: string[], boxes: MathBox[], measurer: TextMeasurer): string {
  const template = document.createElement('template');
  template.innerHTML = svg;
  const root = template.content.querySelector('svg');
  if (!root) return svg;

  const lines = Array.from(root.querySelectorAll('text, tspan')).filter(
    (el) => el.querySelector('tspan') === null && HAS_PLACEHOLDER.test(el.textContent ?? ''),
  );

  for (const line of lines) {
    const text = line.tagName.toLowerCase() === 'tspan' ? line.closest('text') : line;
    if (!text?.parentNode) continue;

    const content = line.textContent ?? '';
    const fontSize = Number.parseFloat(inherited(line, 'font-size') ?? '') || DEFAULT_FONT_SIZE;
    const weight = inherited(line, 'font-weight');
    const bold = weight === 'bold' || Number(weight) >= 600;
    const anchorAttr = inherited(line, 'text-anchor');
    const anchor = anchorAttr === 'middle' || anchorAttr === 'end' ? anchorAttr : 'start';
    const indexes = Array.from(content.matchAll(PLACEHOLDER), (match) => Number(match[1]));
    const box = lineBox({
      x: Number.parseFloat(line.getAttribute('x') ?? text.getAttribute('x') ?? '0') || 0,
      y: Number.parseFloat(line.getAttribute('y') ?? text.getAttribute('y') ?? '0') || 0,
      anchor,
      fontSize,
      width: measurer.width(content, fontSize, bold ? BOLD : 0),
      mathHeight: Math.max(0, ...indexes.map((i) => (boxes[i]?.height ?? 0) * fontSize)),
    });

    const object = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    object.setAttribute('x', `${box.x}`);
    object.setAttribute('y', `${box.y}`);
    object.setAttribute('width', `${box.width}`);
    object.setAttribute('height', `${box.height}`);
    object.setAttribute('overflow', 'visible');
    const transform = text.getAttribute('transform');
    if (transform) object.setAttribute('transform', transform);

    const div = document.createElement('div');
    const justify = anchor === 'middle' ? 'center' : anchor === 'end' ? 'flex-end' : 'flex-start';
    const color = inherited(line, 'fill', 'none');
    div.style.cssText = `display:flex;align-items:center;justify-content:${justify};height:100%;white-space:pre;font-size:${fontSize}px;line-height:1${bold ? ';font-weight:bold' : ''}${color ? `;color:${color}` : ''}`;
    let last = 0;
    for (const match of content.matchAll(PLACEHOLDER)) {
      if (match.index > last) div.appendChild(document.createTextNode(content.slice(last, match.index)));
      const math = document.createElement('span');
      math.innerHTML = html[Number(match[1])] ?? '';
      div.appendChild(math);
      last = match.index + match[0].length;
    }
    if (last < content.length) div.appendChild(document.createTextNode(content.slice(last)));
    object.appendChild(div);

    text.parentNode.insertBefore(object, text);
    if (line === text) text.remove();
    else {
      line.remove();
      if (!text.querySelector('tspan')) text.remove();
    }
  }
  return template.innerHTML;
}

/**
 * Renders a diagram whose labels hold `$$…$$` math. Waits for KaTeX and its
 * fonts, so the math is measured at its real width.
 */
export async function renderDiagramWithMath(
  math: DiagramMath,
  options: RenderOptions & { fontFamily: string },
): Promise<string> {
  const renderer = await loadMathRenderer();
  const html = math.tex.map((tex) => renderMathToHtml(tex, false, renderer) ?? '');
  const boxes = await measureMath(html, options.fontFamily);
  const mono = getComputedStyle(document.body).getPropertyValue('--font-mono').trim() || 'monospace';
  const measurer = withMathWidths(canvasMeasurer(options.fontFamily, mono), (index, fontSize) => ({
    width: (boxes[index]?.width ?? 0) * fontSize,
    height: (boxes[index]?.height ?? 0) * fontSize,
  }));
  const { svg } = renderDiagram(math.source, { ...options, measurer });
  return placeMath(svg, html, boxes, measurer);
}
