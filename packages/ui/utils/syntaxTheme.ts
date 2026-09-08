/**
 * Maps a Hypermark / Hypermark colour theme onto the Shiki theme that renders code in it.
 *
 * This used to live in `packages/review-editor/hooks/usePierreTheme.ts` and only
 * served the diff pane. It moved here so the plan/annotate editor's markdown
 * fences resolve the SAME theme the diff pane resolves, which is what makes a
 * fenced code block and a diff hunk finally look like they belong to the same
 * app. `usePierreTheme` re-exports both symbols, so the review editor's imports
 * are unchanged.
 *
 * Names on the right are resolved by `@pierre/diffs` — the `pierre-*` ones come
 * from `@pierre/theme`, the rest from `@shikijs/themes`. Both registries are
 * already bundled (Pierre pulls in Shiki's full bundle), so consuming them here
 * costs no additional bytes.
 */

/**
 * Retained theme IDs -> Shiki theme name, per mode.
 * Trimmed to the seven retained palettes (Spec 03 locked scope).
 * `null` = this palette has no counterpart in that mode and falls back to the Pierre default.
 */
export const SHIKI_THEME_MAP: Record<string, { dark: string | null; light: string | null }> = {
  'pierre': { dark: 'pierre-dark', light: 'pierre-light' },
  // Stated explicitly rather than reached by falling out of the map. It does
  // render in Pierre's syntax themes, but spec 03 wants syntax to be palette
  // DATA for every supported palette/mode, not a value produced by a generic
  // lookup miss -- and a key mapping to nothing breaks this map's own invariant.
  'plannotator': { dark: 'pierre-dark', light: 'pierre-light' },
  'catppuccin': { dark: 'catppuccin-mocha', light: 'catppuccin-latte' },
  'github': { dark: 'github-dark', light: 'github-light' },
  'ayu-dark': { dark: 'ayu-dark', light: null },
  'one-dark-pro': { dark: 'one-dark-pro', light: null },
  'tokyo-night': { dark: 'tokyo-night', light: null },
};

/**
 * `@pierre/diffs`' own `DEFAULT_THEMES`. Anything the map does not cover (the
 * Hypermark default palette, plus every palette with no counterpart in the
 * active mode) renders in these, which is exactly what the diff pane does when
 * `resolveSyntaxTheme` returns `undefined`.
 */
export const DEFAULT_SYNTAX_THEME = { dark: 'pierre-dark', light: 'pierre-light' } as const;

/**
 * The theme pair to hand `@pierre/diffs`, or `undefined` to let it use its own
 * defaults. Returning `undefined` (rather than the default pair) is deliberate:
 * it keeps the diff pane's prop identity stable for palettes that never
 * customised it.
 */
export function resolveSyntaxTheme(
  colorTheme: string,
  mode: 'dark' | 'light',
): { dark: string; light: string } | undefined {
  const map = SHIKI_THEME_MAP[colorTheme];
  if (!map || !map[mode]) return undefined;
  return { dark: map.dark || DEFAULT_SYNTAX_THEME.dark, light: map.light || DEFAULT_SYNTAX_THEME.light };
}

/**
 * The single concrete Shiki theme name for the palette currently on screen.
 * Markdown fences render one mode at a time, so unlike the diff pane (which
 * hands Pierre a dark/light pair and lets CSS pick) they want a resolved name.
 * A mode-restricted palette in its unsupported half recovers to Pierre Light.
 */
export function resolveFenceTheme(colorTheme: string, mode: 'dark' | 'light'): string {
  return resolveSyntaxTheme(colorTheme, mode)?.[mode] ?? DEFAULT_SYNTAX_THEME[mode];
}
