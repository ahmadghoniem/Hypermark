import { parseThemeMode, type Mode } from '../components/themeModes';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}

export interface ThemeInfo {
  id: string;
  name: string;
  builtIn: boolean;
  modeSupport: 'both' | 'dark-only' | 'light-only';
  syntaxHighlighting?: boolean;
  colors: {
    dark?: ThemeColors;
    light?: ThemeColors;
  };
}

/**
 * The SEVEN retained palette IDs in Hypermark.
 * pierre (default & recovery), hypermark, catppuccin, github,
 * ayu-dark (dark-only), one-dark-pro (dark-only), tokyo-night (dark-only).
 */
export const BUILT_IN_THEMES: ThemeInfo[] = [
  {
    id: 'pierre',
    name: 'Pierre',
    builtIn: true,
    modeSupport: 'both',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#009fff', secondary: '#19283c', accent: '#009fff', background: '#0a0a0a', foreground: '#fafafa' },
      light: { primary: '#009fff', secondary: '#dfebff', accent: '#009fff', background: '#ffffff', foreground: '#0a0a0a' },
    },
  },
  {
    id: 'hypermark',
    name: 'Hypermark',
    builtIn: true,
    modeSupport: 'both',
    syntaxHighlighting: false,
    colors: {
      dark: { primary: 'oklch(0.75 0.18 280)', secondary: 'oklch(0.65 0.15 180)', accent: 'oklch(0.70 0.20 60)', background: 'oklch(0.15 0.02 260)', foreground: 'oklch(0.90 0.01 260)' },
      light: { primary: 'oklch(0.50 0.25 280)', secondary: 'oklch(0.50 0.18 180)', accent: 'oklch(0.60 0.22 50)', background: 'oklch(0.97 0.005 260)', foreground: 'oklch(0.18 0.02 260)' },
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    builtIn: true,
    modeSupport: 'both',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#89b4fa', secondary: '#45475a', accent: '#f5c2e7', background: '#1e1e2e', foreground: '#cdd6f4' },
      light: { primary: '#1e66f5', secondary: '#ccd0da', accent: '#ea76cb', background: '#eff1f5', foreground: '#4c4f69' },
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    builtIn: true,
    modeSupport: 'both',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#58a6ff', secondary: '#2f363d', accent: '#79b8ff', background: '#24292e', foreground: '#e1e4e8' },
      light: { primary: '#0366d6', secondary: '#f6f8fa', accent: '#0366d6', background: '#ffffff', foreground: '#24292e' },
    },
  },
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    builtIn: true,
    modeSupport: 'dark-only',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#e6b450', secondary: '#0b0e14', accent: '#73b8ff', background: '#10141c', foreground: '#bfbdb6' },
    },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    builtIn: true,
    modeSupport: 'dark-only',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#61afef', secondary: '#21252b', accent: '#c678dd', background: '#282c34', foreground: '#abb2bf' },
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    builtIn: true,
    modeSupport: 'dark-only',
    syntaxHighlighting: true,
    colors: {
      dark: { primary: '#7aa2f7', secondary: '#414868', accent: '#7dcfff', background: '#24283b', foreground: '#c0caf5' },
    },
  },
];

/** Return the explicit mode a palette cannot render, if any. */
export function getUnsupportedMode(themeId: string): 'light' | 'dark' | null {
  const theme = BUILT_IN_THEMES.find(({ id }) => id === themeId);
  if (theme?.modeSupport === 'dark-only') return 'light';
  if (theme?.modeSupport === 'light-only') return 'dark';
  return null;
}

/** Resolve the mode a palette actually renders. */
export function resolveThemeMode(
  themeId: string,
  preferredMode: 'light' | 'dark',
): 'light' | 'dark' {
  const unsupportedMode = getUnsupportedMode(themeId);
  if (preferredMode !== unsupportedMode) return preferredMode;
  return unsupportedMode === 'light' ? 'dark' : 'light';
}

// --- Light/dark theme pairs -------------------------------------------------

/** Which half of a light/dark pair a palette is assigned to. */
export type ThemeHalf = 'light' | 'dark';

/** A user's full appearance choice: which mode, and a palette for each half. */
export interface ThemePair {
  mode: Mode;
  light: string;
  dark: string;
}

/**
 * The palette every fresh install starts on, in both halves, and the recovery
 * palette whenever saved preferences are corrupt or removed.
 */
export const DEFAULT_COLOR_THEME = 'pierre';

export const DEFAULT_THEME_PAIR: ThemePair = {
  mode: 'dark',
  light: DEFAULT_COLOR_THEME,
  dark: DEFAULT_COLOR_THEME,
};

/** Return whether a palette is registered. */
export function isKnownTheme(themeId: unknown): themeId is string {
  return typeof themeId === 'string' && BUILT_IN_THEMES.some(({ id }) => id === themeId);
}

/** Return whether a palette can occupy one half of the pair. */
export function themeSupportsHalf(themeId: string, half: ThemeHalf): boolean {
  if (!isKnownTheme(themeId)) return false;
  return getUnsupportedMode(themeId) !== half;
}

/** The palettes assignable to one half — `both` palettes appear in each. */
export function themesForHalf(themes: ThemeInfo[], half: ThemeHalf): ThemeInfo[] {
  return themes.filter(({ id }) => themeSupportsHalf(id, half));
}

/**
 * Seed a pair from the single palette older versions persisted. A `both`
 * palette takes over both halves; a mode-restricted one takes the half it
 * supports and the other half falls back to the default palette.
 */
export function seedThemePair(colorThemeId: unknown, mode: Mode): ThemePair {
  const id = isKnownTheme(colorThemeId) ? colorThemeId : DEFAULT_COLOR_THEME;
  return {
    mode,
    light: themeSupportsHalf(id, 'light') ? id : DEFAULT_COLOR_THEME,
    dark: themeSupportsHalf(id, 'dark') ? id : DEFAULT_COLOR_THEME,
  };
}

/**
 * Repair an untrusted pair (cookie, config.json, or an older release) so every
 * half holds a registered palette that can actually render it.
 *
 * Recovery rules:
 * - A corrupt, unknown, or removed saved palette ID recovers to Pierre.
 * - Recovery is PER LIGHT/DARK HALF. A saved pair with a valid dark half and an
 *   invalid light half recovers ONLY the light half, and does not reset the other
 *   half or any unrelated preference.
 * - A mode-restricted palette (ayu-dark, one-dark-pro, tokyo-night) recovers only
 *   its unsupported half, to Pierre Light. Never invent light tokens for a dark-only palette.
 */
export function normalizeThemePair(
  input: Partial<Record<keyof ThemePair, unknown>> | undefined,
  fallback: ThemePair = DEFAULT_THEME_PAIR,
): ThemePair {
  const half = (key: ThemeHalf): string => {
    const candidate = input?.[key];
    if (isKnownTheme(candidate) && themeSupportsHalf(candidate, key)) return candidate;
    return themeSupportsHalf(fallback[key], key) ? fallback[key] : DEFAULT_COLOR_THEME;
  };
  return {
    mode: parseThemeMode(input?.mode, fallback.mode),
    light: half('light'),
    dark: half('dark'),
  };
}

/** The palette a pair renders for the mode the user is actually seeing. */
export function resolvePairTheme(pair: ThemePair, preferredMode: ThemeHalf): string {
  const candidate = pair[preferredMode];
  if (isKnownTheme(candidate) && themeSupportsHalf(candidate, preferredMode)) {
    return candidate;
  }
  return DEFAULT_COLOR_THEME;
}

/* The pair a fresh install starts from. ThemeProvider installs its own props
   here before the config store resolves, so a host embedding @hypermark/ui
   keeps its `defaultTheme` / `defaultColorTheme` defaults. */
let defaultThemePair: ThemePair = DEFAULT_THEME_PAIR;

export function setDefaultThemePair(pair: ThemePair): void {
  defaultThemePair = pair;
}

export function getDefaultThemePair(): ThemePair {
  return defaultThemePair;
}

export function resetDefaultThemePair(): void {
  defaultThemePair = DEFAULT_THEME_PAIR;
}
