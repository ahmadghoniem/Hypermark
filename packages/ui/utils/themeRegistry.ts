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
 * The SEVEN retained palette IDs in Hypermark (Spec 03 locked scope).
 * pierre (default & recovery), plannotator, catppuccin, github,
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
    id: 'plannotator',
    name: 'Plannotator',
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

// User-supplied custom themes support
const userThemes = new Map<string, ThemeInfo>();

export function registerUserTheme(theme: ThemeInfo): void {
  userThemes.set(theme.id, theme);
}

export function unregisterUserTheme(themeId: string): void {
  userThemes.delete(themeId);
}

export function getUserThemes(): ThemeInfo[] {
  return Array.from(userThemes.values());
}

export function getAllThemes(): ThemeInfo[] {
  return [...BUILT_IN_THEMES, ...userThemes.values()];
}

/** Return the explicit mode a palette cannot render, if any. */
export function getUnsupportedMode(themeId: string): 'light' | 'dark' | null {
  const theme = BUILT_IN_THEMES.find(({ id }) => id === themeId) ?? userThemes.get(themeId);
  if (theme?.modeSupport === 'dark-only') return 'light';
  if (theme?.modeSupport === 'light-only') return 'dark';
  return null;
}

/**
 * Return whether a palette can honor a mode choice without coercion.
 *
 * @deprecated Every mode is always selectable now that a palette is assigned to
 * one half of a light/dark pair: a palette that cannot render a mode simply
 * never occupies that half. Use {@link themeSupportsHalf} to ask whether a
 * palette may be ASSIGNED to a half. Kept for published consumers.
 */
export function isThemeModeAvailable(themeId: string, mode: Mode): boolean {
  return mode === 'system' || getUnsupportedMode(themeId) !== mode;
}

/**
 * Keep System intact while coercing an unsupported explicit mode.
 *
 * @deprecated Modes are no longer coerced. Assign the palette to the half it
 * supports ({@link themeSupportsHalf}) and let {@link resolveThemeMode} handle
 * rendering. Kept for published consumers.
 */
export function normalizeThemeMode(themeId: string, mode: Mode): Mode {
  const unsupportedMode = getUnsupportedMode(themeId);
  if (mode === 'system' || mode !== unsupportedMode) return mode;
  return unsupportedMode === 'light' ? 'dark' : 'light';
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
  return typeof themeId === 'string' && (BUILT_IN_THEMES.some(({ id }) => id === themeId) || userThemes.has(themeId));
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
   here before the config store resolves, so a host embedding @plannotator/ui
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

// --- Resolved Theme Descriptors (Spec 03 Step 2) -----------------------------
//
// For every supported palette/mode, define these seven semantic groups explicitly:
//   1. chrome/tree
//   2. diff bridge
//   3. syntax
//   4. terminal/ANSI
//   5. focus
//   6. selection
//   7. status/annotation (including success, warning, and destructive)
//
// Seven explicit palette descriptors plus a small shared bridge is the WHOLE design.

export interface ThemeChromeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  border: string;
  input: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
}

export interface ThemeDiffBridgeTokens {
  diffsBg: string;
  diffsFg: string;
  diffsAddBase: string;
  diffsDeleteBase: string;
  separator: string;
}

export interface ThemeSyntaxTokens {
  syntaxTheme: string;
  diffSyntaxTheme?: { dark: string; light: string };
}

export interface ThemeTerminalTokens {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  selectionInactiveBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemeFocusTokens {
  ring: string;
  focusBorder: string;
  focusHighlight: string;
}

export interface ThemeSelectionTokens {
  selectionBackground: string;
  selectionForeground: string;
  selectionInactiveBackground: string;
}

export interface ThemeStatusTokens {
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  destructive: string;
  destructiveForeground: string;
}

export interface ModeDescriptorDefinition {
  chrome: ThemeChromeTokens;
  diffBridge: ThemeDiffBridgeTokens;
  syntax: ThemeSyntaxTokens;
  terminal: ThemeTerminalTokens;
  focus: ThemeFocusTokens;
  selection: ThemeSelectionTokens;
  status: ThemeStatusTokens;
}

export interface ResolvedModeDescriptor extends ModeDescriptorDefinition {
  paletteId: string;
  mode: 'dark' | 'light';
}

export interface ResolvedThemeDescriptor extends ResolvedModeDescriptor {
  requestedMode: Mode;
  resolvedMode: 'dark' | 'light';
  colorTheme: string;
  pair: ThemePair;
  light: ResolvedModeDescriptor;
  dark: ResolvedModeDescriptor;
}

export type PaletteId =
  | 'pierre'
  | 'plannotator'
  | 'catppuccin'
  | 'github'
  | 'ayu-dark'
  | 'one-dark-pro'
  | 'tokyo-night';

export interface PaletteDescriptor {
  id: PaletteId;
  name: string;
  builtIn: true;
  modeSupport: 'both' | 'dark-only';
  syntaxHighlighting: boolean;
  modes: {
    dark: ModeDescriptorDefinition;
    light?: ModeDescriptorDefinition;
  };
}

export const PIERRE_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'pierre',
  name: 'Pierre',
  builtIn: true,
  modeSupport: 'both',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: '#171717',
        cardForeground: '#fafafa',
        popover: '#171717',
        popoverForeground: '#fafafa',
        border: '#262626',
        input: '#171717',
        muted: '#1d1d1d',
        mutedForeground: '#a3a3a3',
        primary: '#009fff',
        primaryForeground: '#0a0a0a',
        secondary: '#19283c',
        secondaryForeground: '#fafafa',
        accent: '#009fff',
        accentForeground: '#0a0a0a',
      },
      diffBridge: {
        diffsBg: '#0a0a0a',
        diffsFg: '#fafafa',
        diffsAddBase: '#07c480',
        diffsDeleteBase: '#ff2e3f',
        separator: '#262626',
      },
      syntax: {
        syntaxTheme: 'pierre-dark',
        diffSyntaxTheme: { dark: 'pierre-dark', light: 'pierre-light' },
      },
      terminal: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        cursor: '#009fff',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#19283c',
        selectionForeground: '#fafafa',
        selectionInactiveBackground: '#171717',
        black: '#0a0a0a',
        red: '#ff2e3f',
        green: '#07c480',
        yellow: '#ffca00',
        blue: '#009fff',
        magenta: '#c678dd',
        cyan: '#00d4ff',
        white: '#fafafa',
        brightBlack: '#737373',
        brightRed: '#ff6e7b',
        brightGreen: '#40e5a3',
        brightYellow: '#ffd633',
        brightBlue: '#40b8ff',
        brightMagenta: '#d89bf0',
        brightCyan: '#4de0ff',
        brightWhite: '#ffffff',
      },
      focus: {
        ring: '#009fff',
        focusBorder: '#009fff',
        focusHighlight: '#009fff',
      },
      selection: {
        selectionBackground: '#19283c',
        selectionForeground: '#fafafa',
        selectionInactiveBackground: '#19283c73',
      },
      status: {
        success: '#07c480',
        successForeground: '#0a0a0a',
        warning: '#ffca00',
        warningForeground: '#0a0a0a',
        destructive: '#ff2e3f',
        destructiveForeground: '#fafafa',
      },
    },
    light: {
      chrome: {
        background: '#ffffff',
        foreground: '#0a0a0a',
        card: '#f5f5f5',
        cardForeground: '#0a0a0a',
        popover: '#f5f5f5',
        popoverForeground: '#0a0a0a',
        border: '#e5e5e5',
        input: '#f5f5f5',
        muted: '#e5e5e5',
        mutedForeground: '#737373',
        primary: '#009fff',
        primaryForeground: '#ffffff',
        secondary: '#dfebff',
        secondaryForeground: '#0a0a0a',
        accent: '#009fff',
        accentForeground: '#ffffff',
      },
      diffBridge: {
        diffsBg: '#ffffff',
        diffsFg: '#0a0a0a',
        diffsAddBase: '#18a46c',
        diffsDeleteBase: '#d52c36',
        separator: '#e5e5e5',
      },
      syntax: {
        syntaxTheme: 'pierre-light',
        diffSyntaxTheme: { dark: 'pierre-dark', light: 'pierre-light' },
      },
      terminal: {
        background: '#ffffff',
        foreground: '#0a0a0a',
        cursor: '#009fff',
        cursorAccent: '#ffffff',
        selectionBackground: '#dfebff',
        selectionForeground: '#0a0a0a',
        selectionInactiveBackground: '#e5e5e5',
        black: '#0a0a0a',
        red: '#d52c36',
        green: '#18a46c',
        yellow: '#d5a910',
        blue: '#009fff',
        magenta: '#a855f7',
        cyan: '#0284c7',
        white: '#f5f5f5',
        brightBlack: '#737373',
        brightRed: '#e5484d',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#38bdf8',
        brightMagenta: '#c084fc',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff',
      },
      focus: {
        ring: '#009fff',
        focusBorder: '#009fff',
        focusHighlight: '#009fff',
      },
      selection: {
        selectionBackground: '#dfebff',
        selectionForeground: '#0a0a0a',
        selectionInactiveBackground: '#dfebff73',
      },
      status: {
        success: '#18a46c',
        successForeground: '#ffffff',
        warning: '#d5a910',
        warningForeground: '#0a0a0a',
        destructive: '#d52c36',
        destructiveForeground: '#ffffff',
      },
    },
  },
};

export const PLANNOTATOR_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'plannotator',
  name: 'Plannotator',
  builtIn: true,
  modeSupport: 'both',
  syntaxHighlighting: false,
  modes: {
    dark: {
      chrome: {
        background: 'oklch(0.15 0.02 260)',
        foreground: 'oklch(0.90 0.01 260)',
        card: 'oklch(0.22 0.02 260)',
        cardForeground: 'oklch(0.90 0.01 260)',
        popover: 'oklch(0.28 0.025 260)',
        popoverForeground: 'oklch(0.90 0.01 260)',
        border: 'oklch(0.35 0.02 260)',
        input: 'oklch(0.26 0.02 260)',
        muted: 'oklch(0.26 0.02 260)',
        mutedForeground: 'oklch(0.72 0.02 260)',
        primary: 'oklch(0.75 0.18 280)',
        primaryForeground: 'oklch(0.15 0.02 260)',
        secondary: 'oklch(0.65 0.15 180)',
        secondaryForeground: 'oklch(0.15 0.02 260)',
        accent: 'oklch(0.70 0.20 60)',
        accentForeground: 'oklch(0.15 0.02 260)',
      },
      diffBridge: {
        diffsBg: 'oklch(0.15 0.02 260)',
        diffsFg: 'oklch(0.90 0.01 260)',
        diffsAddBase: 'oklch(0.72 0.17 150)',
        diffsDeleteBase: 'oklch(0.65 0.20 25)',
        separator: 'oklch(0.35 0.02 260)',
      },
      syntax: {
        syntaxTheme: 'pierre-dark',
      },
      terminal: {
        background: '#11131d',
        foreground: '#e8e6f0',
        cursor: '#c084fc',
        cursorAccent: '#11131d',
        selectionBackground: '#4c1d95',
        selectionForeground: '#fbf7ff',
        selectionInactiveBackground: '#2e3142',
        black: '#11131d',
        red: '#ff6b7a',
        green: '#5ee09d',
        yellow: '#f5c451',
        blue: '#9f8cff',
        magenta: '#d78cff',
        cyan: '#47d5c8',
        white: '#d9d7e5',
        brightBlack: '#6f7387',
        brightRed: '#ff8a95',
        brightGreen: '#7ef0b6',
        brightYellow: '#ffd979',
        brightBlue: '#b8a7ff',
        brightMagenta: '#e5b2ff',
        brightCyan: '#73eadf',
        brightWhite: '#fbf7ff',
      },
      focus: {
        ring: 'oklch(0.75 0.18 280)',
        focusBorder: 'oklch(0.70 0.20 200)',
        focusHighlight: 'oklch(0.70 0.20 200)',
      },
      selection: {
        selectionBackground: '#4c1d95',
        selectionForeground: '#fbf7ff',
        selectionInactiveBackground: '#2e3142',
      },
      status: {
        success: 'oklch(0.72 0.17 150)',
        successForeground: 'oklch(0.15 0.02 260)',
        warning: 'oklch(0.75 0.15 85)',
        warningForeground: 'oklch(0.20 0.02 260)',
        destructive: 'oklch(0.65 0.20 25)',
        destructiveForeground: 'oklch(0.98 0 0)',
      },
    },
    light: {
      chrome: {
        background: 'oklch(0.97 0.005 260)',
        foreground: 'oklch(0.18 0.02 260)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.18 0.02 260)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.18 0.02 260)',
        border: 'oklch(0.88 0.01 260)',
        input: 'oklch(0.92 0.01 260)',
        muted: 'oklch(0.92 0.01 260)',
        mutedForeground: 'oklch(0.40 0.02 260)',
        primary: 'oklch(0.50 0.25 280)',
        primaryForeground: 'oklch(1 0 0)',
        secondary: 'oklch(0.50 0.18 180)',
        secondaryForeground: 'oklch(1 0 0)',
        accent: 'oklch(0.60 0.22 50)',
        accentForeground: 'oklch(0.18 0.02 260)',
      },
      diffBridge: {
        diffsBg: 'oklch(0.97 0.005 260)',
        diffsFg: 'oklch(0.18 0.02 260)',
        diffsAddBase: 'oklch(0.45 0.20 150)',
        diffsDeleteBase: 'oklch(0.50 0.25 25)',
        separator: 'oklch(0.88 0.01 260)',
      },
      syntax: {
        syntaxTheme: 'pierre-light',
      },
      terminal: {
        background: '#f6f5fb',
        foreground: '#29263a',
        cursor: '#7c3aed',
        cursorAccent: '#f6f5fb',
        selectionBackground: '#ddd6fe',
        selectionForeground: '#25133f',
        selectionInactiveBackground: '#e5e1ef',
        black: '#29263a',
        red: '#c02635',
        green: '#15803d',
        yellow: '#a16207',
        blue: '#6d28d9',
        magenta: '#a21caf',
        cyan: '#0f766e',
        white: '#f6f5fb',
        brightBlack: '#706b81',
        brightRed: '#e11d48',
        brightGreen: '#16a34a',
        brightYellow: '#ca8a04',
        brightBlue: '#7c3aed',
        brightMagenta: '#c026d3',
        brightCyan: '#0d9488',
        brightWhite: '#ffffff',
      },
      focus: {
        ring: 'oklch(0.50 0.25 280)',
        focusBorder: 'oklch(0.50 0.25 280)',
        focusHighlight: 'oklch(0.50 0.25 280)',
      },
      selection: {
        selectionBackground: '#ddd6fe',
        selectionForeground: '#25133f',
        selectionInactiveBackground: '#e5e1ef',
      },
      status: {
        success: 'oklch(0.45 0.20 150)',
        successForeground: 'oklch(1 0 0)',
        warning: 'oklch(0.55 0.18 85)',
        warningForeground: 'oklch(0.18 0.02 260)',
        destructive: 'oklch(0.50 0.25 25)',
        destructiveForeground: 'oklch(1 0 0)',
      },
    },
  },
};

export const CATPPUCCIN_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'catppuccin',
  name: 'Catppuccin',
  builtIn: true,
  modeSupport: 'both',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        card: '#313244',
        cardForeground: '#cdd6f4',
        popover: '#313244',
        popoverForeground: '#cdd6f4',
        border: '#585b70',
        input: '#313244',
        muted: '#45475a',
        mutedForeground: '#a6adc8',
        primary: '#89b4fa',
        primaryForeground: '#1e1e2e',
        secondary: '#45475a',
        secondaryForeground: '#cdd6f4',
        accent: '#f5c2e7',
        accentForeground: '#1e1e2e',
      },
      diffBridge: {
        diffsBg: '#1e1e2e',
        diffsFg: '#cdd6f4',
        diffsAddBase: '#a6e3a1',
        diffsDeleteBase: '#f38ba8',
        separator: '#45475a',
      },
      syntax: {
        syntaxTheme: 'catppuccin-mocha',
        diffSyntaxTheme: { dark: 'catppuccin-mocha', light: 'catppuccin-latte' },
      },
      terminal: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e',
        selectionBackground: '#585b70',
        selectionForeground: '#cdd6f4',
        selectionInactiveBackground: '#45475a',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      focus: {
        ring: '#89b4fa',
        focusBorder: '#94e2d5',
        focusHighlight: '#94e2d5',
      },
      selection: {
        selectionBackground: '#585b70',
        selectionForeground: '#cdd6f4',
        selectionInactiveBackground: '#45475a',
      },
      status: {
        success: '#a6e3a1',
        successForeground: '#1e1e2e',
        warning: '#f9e2af',
        warningForeground: '#1e1e2e',
        destructive: '#f38ba8',
        destructiveForeground: '#1e1e2e',
      },
    },
    light: {
      chrome: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        card: '#e6e9ef',
        cardForeground: '#4c4f69',
        popover: '#e6e9ef',
        popoverForeground: '#4c4f69',
        border: '#acb0be',
        input: '#ccd0da',
        muted: '#ccd0da',
        mutedForeground: '#6c6f85',
        primary: '#1e66f5',
        primaryForeground: '#eff1f5',
        secondary: '#ccd0da',
        secondaryForeground: '#4c4f69',
        accent: '#ea76cb',
        accentForeground: '#eff1f5',
      },
      diffBridge: {
        diffsBg: '#eff1f5',
        diffsFg: '#4c4f69',
        diffsAddBase: '#40a02b',
        diffsDeleteBase: '#d20f39',
        separator: '#ccd0da',
      },
      syntax: {
        syntaxTheme: 'catppuccin-latte',
        diffSyntaxTheme: { dark: 'catppuccin-mocha', light: 'catppuccin-latte' },
      },
      terminal: {
        background: '#eff1f5',
        foreground: '#4c4f69',
        cursor: '#dc8a78',
        cursorAccent: '#eff1f5',
        selectionBackground: '#bcc0cc',
        selectionForeground: '#4c4f69',
        selectionInactiveBackground: '#ccd0da',
        black: '#5c5f77',
        red: '#d20f39',
        green: '#40a02b',
        yellow: '#df8e1d',
        blue: '#1e66f5',
        magenta: '#ea76cb',
        cyan: '#179299',
        white: '#acb0be',
        brightBlack: '#6c6f85',
        brightRed: '#d20f39',
        brightGreen: '#40a02b',
        brightYellow: '#df8e1d',
        brightBlue: '#1e66f5',
        brightMagenta: '#ea76cb',
        brightCyan: '#179299',
        brightWhite: '#bcc0cc',
      },
      focus: {
        ring: '#1e66f5',
        focusBorder: '#179299',
        focusHighlight: '#179299',
      },
      selection: {
        selectionBackground: '#bcc0cc',
        selectionForeground: '#4c4f69',
        selectionInactiveBackground: '#ccd0da',
      },
      status: {
        success: '#40a02b',
        successForeground: '#eff1f5',
        warning: '#df8e1d',
        warningForeground: '#eff1f5',
        destructive: '#d20f39',
        destructiveForeground: '#eff1f5',
      },
    },
  },
};

export const GITHUB_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'github',
  name: 'GitHub',
  builtIn: true,
  modeSupport: 'both',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#24292e',
        foreground: '#e1e4e8',
        card: '#1f2428',
        cardForeground: '#e1e4e8',
        popover: '#1f2428',
        popoverForeground: '#e1e4e8',
        border: '#1b1f23',
        input: '#2f363d',
        muted: '#2f363d',
        mutedForeground: '#6a737d',
        primary: '#58a6ff',
        primaryForeground: '#24292e',
        secondary: '#2f363d',
        secondaryForeground: '#d1d5da',
        accent: '#79b8ff',
        accentForeground: '#24292e',
      },
      diffBridge: {
        diffsBg: '#24292e',
        diffsFg: '#e1e4e8',
        diffsAddBase: '#28a745',
        diffsDeleteBase: '#f97583',
        separator: '#1b1f23',
      },
      syntax: {
        syntaxTheme: 'github-dark',
        diffSyntaxTheme: { dark: 'github-dark', light: 'github-light' },
      },
      terminal: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#30363d',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      focus: {
        ring: '#58a6ff',
        focusBorder: '#58a6ff',
        focusHighlight: '#58a6ff',
      },
      selection: {
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#30363d',
      },
      status: {
        success: '#28a745',
        successForeground: '#24292e',
        warning: '#ffea7f',
        warningForeground: '#24292e',
        destructive: '#f97583',
        destructiveForeground: '#24292e',
      },
    },
    light: {
      chrome: {
        background: '#ffffff',
        foreground: '#24292e',
        card: '#f6f8fa',
        cardForeground: '#24292e',
        popover: '#f6f8fa',
        popoverForeground: '#24292e',
        border: '#e1e4e8',
        input: '#fafbfc',
        muted: '#fafbfc',
        mutedForeground: '#6a737d',
        primary: '#0366d6',
        primaryForeground: '#ffffff',
        secondary: '#f6f8fa',
        secondaryForeground: '#586069',
        accent: '#0366d6',
        accentForeground: '#ffffff',
      },
      diffBridge: {
        diffsBg: '#ffffff',
        diffsFg: '#24292e',
        diffsAddBase: '#28a745',
        diffsDeleteBase: '#cb2431',
        separator: '#e1e4e8',
      },
      syntax: {
        syntaxTheme: 'github-light',
        diffSyntaxTheme: { dark: 'github-dark', light: 'github-light' },
      },
      terminal: {
        background: '#ffffff',
        foreground: '#24292f',
        cursor: '#0969da',
        cursorAccent: '#ffffff',
        selectionBackground: '#b6e3ff',
        selectionForeground: '#24292f',
        selectionInactiveBackground: '#d0d7de',
        black: '#24292f',
        red: '#cf222e',
        green: '#116329',
        yellow: '#4d2d00',
        blue: '#0969da',
        magenta: '#8250df',
        cyan: '#1b7c83',
        white: '#6e7781',
        brightBlack: '#57606a',
        brightRed: '#a40e26',
        brightGreen: '#1a7f37',
        brightYellow: '#9a6700',
        brightBlue: '#218bff',
        brightMagenta: '#a475f9',
        brightCyan: '#3192aa',
        brightWhite: '#8c959f',
      },
      focus: {
        ring: '#2188ff',
        focusBorder: '#2188ff',
        focusHighlight: '#2188ff',
      },
      selection: {
        selectionBackground: '#b6e3ff',
        selectionForeground: '#24292f',
        selectionInactiveBackground: '#d0d7de',
      },
      status: {
        success: '#28a745',
        successForeground: '#ffffff',
        warning: '#f9c513',
        warningForeground: '#24292e',
        destructive: '#cb2431',
        destructiveForeground: '#ffffff',
      },
    },
  },
};

export const AYU_DARK_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'ayu-dark',
  name: 'Ayu Dark',
  builtIn: true,
  modeSupport: 'dark-only',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#10141c',
        foreground: '#bfbdb6',
        card: '#141821',
        cardForeground: '#bfbdb6',
        popover: '#141821',
        popoverForeground: '#bfbdb6',
        border: '#1b1f29',
        input: '#10141c',
        muted: '#141821',
        mutedForeground: '#6c7380',
        primary: '#e6b450',
        primaryForeground: '#805600',
        secondary: '#0d1017',
        secondaryForeground: '#bfbdb6',
        accent: '#73b8ff',
        accentForeground: '#10141c',
      },
      diffBridge: {
        diffsBg: '#10141c',
        diffsFg: '#bfbdb6',
        diffsAddBase: '#70bf56',
        diffsDeleteBase: '#d95757',
        separator: '#1b1f29',
      },
      syntax: {
        syntaxTheme: 'ayu-dark',
        diffSyntaxTheme: { dark: 'ayu-dark', light: 'pierre-light' },
      },
      terminal: {
        background: '#10141c',
        foreground: '#bfbdb6',
        cursor: '#e6b450',
        cursorAccent: '#10141c',
        selectionBackground: '#273747',
        selectionForeground: '#bfbdb6',
        selectionInactiveBackground: '#1b1f29',
        black: '#0d1017',
        red: '#d95757',
        green: '#70bf56',
        yellow: '#e6b450',
        blue: '#73b8ff',
        magenta: '#d2a6ff',
        cyan: '#95e6cb',
        white: '#bfbdb6',
        brightBlack: '#6c7380',
        brightRed: '#e67e7e',
        brightGreen: '#98d982',
        brightYellow: '#f0c878',
        brightBlue: '#99cbff',
        brightMagenta: '#dfbeff',
        brightCyan: '#bbf0df',
        brightWhite: '#ffffff',
      },
      focus: {
        ring: '#e6b450',
        focusBorder: '#e6b450',
        focusHighlight: '#e6b450',
      },
      selection: {
        selectionBackground: '#273747',
        selectionForeground: '#bfbdb6',
        selectionInactiveBackground: '#1b1f29',
      },
      status: {
        success: '#70bf56',
        successForeground: '#10141c',
        warning: '#fdb04c',
        warningForeground: '#10141c',
        destructive: '#d95757',
        destructiveForeground: '#10141c',
      },
    },
  },
};

export const ONE_DARK_PRO_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'one-dark-pro',
  name: 'One Dark Pro',
  builtIn: true,
  modeSupport: 'dark-only',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#282c34',
        foreground: '#abb2bf',
        card: '#21252b',
        cardForeground: '#abb2bf',
        popover: '#21252b',
        popoverForeground: '#abb2bf',
        border: '#3e4452',
        input: '#1d1f23',
        muted: '#1d1f23',
        mutedForeground: '#5c6370',
        primary: '#61afef',
        primaryForeground: '#282c34',
        secondary: '#21252b',
        secondaryForeground: '#abb2bf',
        accent: '#c678dd',
        accentForeground: '#282c34',
      },
      diffBridge: {
        diffsBg: '#282c34',
        diffsFg: '#abb2bf',
        diffsAddBase: '#98c379',
        diffsDeleteBase: '#e06c75',
        separator: '#3e4452',
      },
      syntax: {
        syntaxTheme: 'one-dark-pro',
        diffSyntaxTheme: { dark: 'one-dark-pro', light: 'pierre-light' },
      },
      terminal: {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#528bff',
        cursorAccent: '#282c34',
        selectionBackground: '#3e4451',
        selectionForeground: '#abb2bf',
        selectionInactiveBackground: '#353b45',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      focus: {
        ring: '#528bff',
        focusBorder: '#528bff',
        focusHighlight: '#528bff',
      },
      selection: {
        selectionBackground: '#3e4451',
        selectionForeground: '#abb2bf',
        selectionInactiveBackground: '#353b45',
      },
      status: {
        success: '#98c379',
        successForeground: '#282c34',
        warning: '#e5c07b',
        warningForeground: '#282c34',
        destructive: '#e06c75',
        destructiveForeground: '#282c34',
      },
    },
  },
};

export const TOKYO_NIGHT_PALETTE_DESCRIPTOR: PaletteDescriptor = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  builtIn: true,
  modeSupport: 'dark-only',
  syntaxHighlighting: true,
  modes: {
    dark: {
      chrome: {
        background: '#24283b',
        foreground: '#c0caf5',
        card: '#1d202f',
        cardForeground: '#c0caf5',
        popover: '#1d202f',
        popoverForeground: '#c0caf5',
        border: '#414868',
        input: '#343a52',
        muted: '#343a52',
        mutedForeground: '#787c99',
        primary: '#7aa2f7',
        primaryForeground: '#1d202f',
        secondary: '#414868',
        secondaryForeground: '#c0caf5',
        accent: '#7dcfff',
        accentForeground: '#1d202f',
      },
      diffBridge: {
        diffsBg: '#24283b',
        diffsFg: '#c0caf5',
        diffsAddBase: '#9ece6a',
        diffsDeleteBase: '#f7768e',
        separator: '#414868',
      },
      syntax: {
        syntaxTheme: 'tokyo-night',
        diffSyntaxTheme: { dark: 'tokyo-night', light: 'pierre-light' },
      },
      terminal: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        selectionInactiveBackground: '#292e42',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      focus: {
        ring: '#7aa2f7',
        focusBorder: '#7dcfff',
        focusHighlight: '#7dcfff',
      },
      selection: {
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        selectionInactiveBackground: '#292e42',
      },
      status: {
        success: '#9ece6a',
        successForeground: '#1d202f',
        warning: '#e0af68',
        warningForeground: '#1d202f',
        destructive: '#f7768e',
        destructiveForeground: '#1d202f',
      },
    },
  },
};

export const PALETTE_DESCRIPTORS: Record<PaletteId, PaletteDescriptor> = {
  'pierre': PIERRE_PALETTE_DESCRIPTOR,
  'plannotator': PLANNOTATOR_PALETTE_DESCRIPTOR,
  'catppuccin': CATPPUCCIN_PALETTE_DESCRIPTOR,
  'github': GITHUB_PALETTE_DESCRIPTOR,
  'ayu-dark': AYU_DARK_PALETTE_DESCRIPTOR,
  'one-dark-pro': ONE_DARK_PRO_PALETTE_DESCRIPTOR,
  'tokyo-night': TOKYO_NIGHT_PALETTE_DESCRIPTOR,
};

// --- Shared Bridge Engine ----------------------------------------------------

/**
 * Resolve the explicit mode descriptor for a palette and mode.
 *
 * Recovery behavior:
 * - A corrupt, unknown, or removed saved palette ID recovers to Pierre in that mode.
 * - A mode-restricted palette (ayu-dark, one-dark-pro, tokyo-night) requested in
 *   its unsupported half (light) recovers ONLY that half, to Pierre Light.
 */
export function resolveModeDescriptor(
  paletteId: string,
  mode: 'dark' | 'light',
): ResolvedModeDescriptor {
  const descriptor = (PALETTE_DESCRIPTORS as Record<string, PaletteDescriptor | undefined>)[paletteId];
  if (!descriptor) {
    // Unknown or removed palette recovers to Pierre
    return {
      paletteId: 'pierre',
      mode,
      ...PIERRE_PALETTE_DESCRIPTOR.modes[mode]!,
    };
  }

  const modeDef = descriptor.modes[mode];
  if (!modeDef) {
    // Unsupported mode for a mode-restricted palette recovers only that half, to Pierre Light
    return {
      paletteId: 'pierre',
      mode,
      ...PIERRE_PALETTE_DESCRIPTOR.modes[mode]!,
    };
  }

  return {
    paletteId: descriptor.id,
    mode,
    ...modeDef,
  };
}

/** Read system preference synchronously */
function getSystemIsLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;
}

/**
 * Replace scattered palette/mode/syntax/chrome/terminal/focus/selection/status resolution
 * with ONE validated resolved theme descriptor that commits ATOMICALLY for light, dark,
 * and system.
 */
export function resolveThemeDescriptor(
  pairInput?: Partial<ThemePair>,
  preferredMode?: 'dark' | 'light',
): ResolvedThemeDescriptor {
  const pair = normalizeThemePair(pairInput);
  const sysMode = preferredMode ?? (getSystemIsLight() ? 'light' : 'dark');
  const resolvedMode: 'dark' | 'light' = pair.mode === 'system' ? sysMode : (pair.mode as 'dark' | 'light');
  const colorTheme = resolvePairTheme(pair, resolvedMode);

  const activeModeDescriptor = resolveModeDescriptor(colorTheme, resolvedMode);
  const lightDescriptor = resolveModeDescriptor(pair.light, 'light');
  const darkDescriptor = resolveModeDescriptor(pair.dark, 'dark');

  return {
    ...activeModeDescriptor,
    requestedMode: pair.mode,
    resolvedMode,
    colorTheme,
    pair,
    light: lightDescriptor,
    dark: darkDescriptor,
  };
}

/**
 * Synchronously commit the resolved theme descriptor to the document element,
 * keeping existing non-theme classes intact.
 */
export function applyThemeDescriptor(descriptor: ResolvedThemeDescriptor): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const themeClass = `theme-${descriptor.paletteId}`;
  const wantLight = descriptor.resolvedMode === 'light';

  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith('theme-')) el.classList.remove(cls);
  }
  if (wantLight) {
    el.classList.add('light');
  } else {
    el.classList.remove('light');
  }
  el.classList.add(themeClass);
}

/**
 * Get the terminal theme object directly from the resolved descriptor,
 * eliminating asynchronous computed-style and requestAnimationFrame probing.
 */
export function getTerminalTheme(descriptor: ResolvedModeDescriptor | ResolvedThemeDescriptor): ThemeTerminalTokens {
  return descriptor.terminal;
}
