/**
 * Maps a Hypermark colour theme onto the Shiki theme that renders code
 * fences in it.
 *
 * Names on the right are Shiki themes: the `pierre-*` ones come from
 * `@pierre/theme`, the rest from Shiki's bundled themes.
 */

/**
 * Retained theme IDs -> Shiki theme name, per mode.
 * Trimmed to the seven retained palettes.
 * `null` = this palette has no counterpart in that mode and falls back to the Pierre default.
 */
export const SHIKI_THEME_MAP: Record<string, { dark: string | null; light: string | null }> = {
  'pierre': { dark: 'pierre-dark', light: 'pierre-light' },
  // Stated explicitly rather than reached by falling out of the map. It does
  // render in Pierre's syntax themes, but syntax must be palette
  // DATA for every supported palette/mode, not a value produced by a generic
  // lookup miss -- and a key mapping to nothing breaks this map's own invariant.
  'hypermark': { dark: 'pierre-dark', light: 'pierre-light' },
  'catppuccin': { dark: 'catppuccin-mocha', light: 'catppuccin-latte' },
  'github': { dark: 'github-dark', light: 'github-light' },
  'ayu-dark': { dark: 'ayu-dark', light: null },
  'one-dark-pro': { dark: 'one-dark-pro', light: null },
  'tokyo-night': { dark: 'tokyo-night', light: null },
};

/**
 * The fallback pair. Anything the map does not cover (every palette with no
 * counterpart in the active mode) renders in these.
 */
export const DEFAULT_SYNTAX_THEME = { dark: 'pierre-dark', light: 'pierre-light' } as const;

/**
 * The palette's own theme pair, or `undefined` when the palette has no
 * counterpart in `mode` and the caller should use `DEFAULT_SYNTAX_THEME`.
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
 * Markdown fences render one mode at a time, so they want a resolved name.
 * A mode-restricted palette in its unsupported half recovers to Pierre Light.
 */
export function resolveFenceTheme(colorTheme: string, mode: 'dark' | 'light'): string {
  return resolveSyntaxTheme(colorTheme, mode)?.[mode] ?? DEFAULT_SYNTAX_THEME[mode];
}
