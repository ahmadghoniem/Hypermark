/**
 * Build-time stub for `shiki/wasm`.
 *
 * The fence highlighter (`src/ui/utils/codeHighlight.ts`) passes Shiki's
 * JavaScript regex engine to `createHighlighter`, so the Oniguruma engine never
 * runs. Shiki's bundled entry still reaches `import("shiki/wasm")`, so the
 * bundler keeps that edge and inlines
 * `@shikijs/engine-oniguruma/wasm-inlined` — a ~622 KB base64 blob — into the
 * single-file HTML build.
 *
 * Aliasing `shiki/wasm` to this module drops that payload. The JS regex engine
 * and the WASM engine were verified to produce identical tokens, so nothing
 * about the rendered output changes; the only thing that changes is that
 * opting into the WASM engine now fails loudly instead of silently costing
 * every user a megabyte of dead bytes.
 *
 * Wired through `resolve.alias` (NOT a plugin) on purpose: `resolve.alias` is
 * shared with Vite's worker build, `plugins` are not.
 */

function unavailable(): never {
  throw new Error(
    "shiki/wasm is not bundled by Hypermark: the Oniguruma engine is stubbed out " +
      "in favour of Shiki's JavaScript regex engine. " +
      'Remove the `shiki/wasm` alias in the app vite config to re-enable it.',
  );
}

export default unavailable;
