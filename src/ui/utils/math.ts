/**
 * Math renderer slot.
 *
 * `MathBlock` and inline math read their renderer from this module instead of
 * importing `katex` statically, so a route-split bundle does not carry
 * KaTeX in every document read. The slot is SYNCHRONOUS: when it is filled
 * before the first render (which is what `./math-eager` does, and what every
 * Hypermark entry imports) the typeset HTML is in the DOM on the first
 * commit, exactly as it was when the import was static. When it is empty the
 * components render the same wrapper element with the TeX source as text,
 * call `loadMathRenderer()`, and re-render typeset once it resolves.
 *
 * This module has no static import of `katex`: `loadMathRenderer()` reaches it
 * through a dynamic `import('katex')`, which a chunking bundler turns into a
 * lazy chunk and Hypermark's single-file builds inline (the eager entry keeps
 * it in the entry either way).
 */

import type { KatexOptions } from 'katex';

/** The subset of KaTeX's API the renderer needs. `katex` itself satisfies it. */
export interface MathRenderer {
  renderToString(tex: string, options?: KatexOptions): string;
}

let renderer: MathRenderer | null = null;
let pending: Promise<MathRenderer> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Current renderer, or `null` while none is registered. Safe to call during render. */
export function getMathRenderer(): MathRenderer | null {
  return renderer;
}

/** Register a renderer synchronously (what `./math-eager` does with `katex`). */
export function setMathRenderer(next: MathRenderer): void {
  if (renderer === next) return;
  renderer = next;
  notify();
}

/** Subscribe to slot changes. Shaped for `useSyncExternalStore`. */
export function subscribeMathRenderer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Load and register the renderer. Idempotent: a filled slot resolves at once,
 * a load in flight is shared, and a rejected load is dropped so the next call
 * retries instead of failing forever on a transient chunk error.
 */
export function loadMathRenderer(): Promise<MathRenderer> {
  if (renderer) return Promise.resolve(renderer);
  if (!pending) {
    const attempt = import('katex').then((m) => m.default).then(
      (loaded) => {
        setMathRenderer(loaded);
        return loaded;
      },
      (err: unknown) => {
        if (pending === attempt) pending = null;
        throw err;
      },
    );
    pending = attempt;
  }
  return pending;
}

export const normalizeMathTex = (tex: string): string => tex.trim();

/**
 * Render TeX with the pinned option set. `throwOnError: false` and
 * `trust: false` are a deliberate security pin applied to EVERY renderer,
 * including one registered through `setMathRenderer`: a registered module never widens what
 * document-supplied TeX may do. Returns `null` while no renderer is
 * registered so callers can fall back to the text placeholder.
 */
export function renderMathToHtml(
  tex: string,
  displayMode: boolean,
  activeRenderer: MathRenderer | null = renderer,
): string | null {
  if (!activeRenderer) return null;
  return activeRenderer.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: 'warn',
    trust: false,
    output: 'html',
  });
}
