import { describe, expect, test } from 'bun:test';
import {
  BUILT_IN_THEMES,
  DEFAULT_COLOR_THEME,
  DEFAULT_THEME_PAIR,
  PALETTE_DESCRIPTORS,
  ThemeInfo,
  getUnsupportedMode,
  isKnownTheme,
  themeSupportsHalf,
  themesForHalf,
  normalizeThemePair,
  seedThemePair,
  resolvePairTheme,
  resolveModeDescriptor,
  resolveThemeDescriptor,
  getTerminalTheme,
  registerUserTheme,
  unregisterUserTheme,
} from './themeRegistry';

describe('BUILT_IN_THEMES', () => {
  test('contains exactly the seven retained palette IDs from Spec 03', () => {
    const ids = BUILT_IN_THEMES.map(t => t.id);
    expect(ids).toEqual([
      'pierre',
      'hypermark',
      'catppuccin',
      'github',
      'ayu-dark',
      'one-dark-pro',
      'tokyo-night',
    ]);
  });

  test('default and recovery palette is pierre', () => {
    expect(DEFAULT_COLOR_THEME).toBe('pierre');
    expect(DEFAULT_THEME_PAIR).toEqual({
      mode: 'dark',
      light: 'pierre',
      dark: 'pierre',
    });
  });

  test('mode support matches spec authority: 4 both, 3 dark-only', () => {
    const supportMap = Object.fromEntries(BUILT_IN_THEMES.map(t => [t.id, t.modeSupport]));
    expect(supportMap['pierre']).toBe('both');
    expect(supportMap['hypermark']).toBe('both');
    expect(supportMap['catppuccin']).toBe('both');
    expect(supportMap['github']).toBe('both');
    expect(supportMap['ayu-dark']).toBe('dark-only');
    expect(supportMap['one-dark-pro']).toBe('dark-only');
    expect(supportMap['tokyo-night']).toBe('dark-only');
  });

  test('never invents light tokens for dark-only palettes', () => {
    const darkOnly = BUILT_IN_THEMES.filter(t => t.modeSupport === 'dark-only');
    for (const theme of darkOnly) {
      expect(theme.colors.dark).toBeDefined();
      expect(theme.colors.light).toBeUndefined();
    }
  });

  test('both-mode palettes provide both dark and light swatches', () => {
    const both = BUILT_IN_THEMES.filter(t => t.modeSupport === 'both');
    for (const theme of both) {
      expect(theme.colors.dark).toBeDefined();
      expect(theme.colors.light).toBeDefined();
    }
  });
});

describe('themeSupportsHalf and themesForHalf', () => {
  test('both-mode palettes support both halves', () => {
    for (const id of ['pierre', 'hypermark', 'catppuccin', 'github']) {
      expect(themeSupportsHalf(id, 'light')).toBe(true);
      expect(themeSupportsHalf(id, 'dark')).toBe(true);
    }
  });

  test('dark-only palettes support dark half but NOT light half', () => {
    for (const id of ['ayu-dark', 'one-dark-pro', 'tokyo-night']) {
      expect(themeSupportsHalf(id, 'dark')).toBe(true);
      expect(themeSupportsHalf(id, 'light')).toBe(false);
    }
  });

  test('unknown themes support neither half', () => {
    expect(themeSupportsHalf('dracula', 'dark')).toBe(false);
    expect(themeSupportsHalf('nord', 'light')).toBe(false);
    expect(themeSupportsHalf('corrupt-palette', 'dark')).toBe(false);
  });

  test('themesForHalf filters correctly: 4 for light, 7 for dark', () => {
    const lightThemes = themesForHalf(BUILT_IN_THEMES, 'light');
    const darkThemes = themesForHalf(BUILT_IN_THEMES, 'dark');

    expect(lightThemes.map(t => t.id)).toEqual(['pierre', 'hypermark', 'catppuccin', 'github']);
    expect(darkThemes.map(t => t.id)).toEqual([
      'pierre',
      'hypermark',
      'catppuccin',
      'github',
      'ayu-dark',
      'one-dark-pro',
      'tokyo-night',
    ]);
  });
});

describe('recovery in normalizeThemePair', () => {
  test('a corrupt, unknown, or removed saved palette ID recovers to Pierre', () => {
    const recovered = normalizeThemePair({
      mode: 'dark',
      light: 'dracula',
      dark: 'nord',
    });
    expect(recovered).toEqual({
      mode: 'dark',
      light: 'pierre',
      dark: 'pierre',
    });
  });

  test('recovery is per light/dark half without resetting valid halves or preferences', () => {
    // Valid dark, invalid light: ONLY light recovers to Pierre
    const validDark = normalizeThemePair({
      mode: 'system',
      light: 'removed-light-theme',
      dark: 'github',
    });
    expect(validDark).toEqual({
      mode: 'system',
      light: 'pierre',
      dark: 'github',
    });

    // Valid light, invalid dark: ONLY dark recovers to Pierre
    const validLight = normalizeThemePair({
      mode: 'light',
      light: 'catppuccin',
      dark: 'removed-dark-theme',
    });
    expect(validLight).toEqual({
      mode: 'light',
      light: 'catppuccin',
      dark: 'pierre',
    });
  });

  test('mode-restricted palettes in light half recover only that half to Pierre Light', () => {
    for (const darkOnlyId of ['ayu-dark', 'one-dark-pro', 'tokyo-night']) {
      const recovered = normalizeThemePair({
        mode: 'system',
        light: darkOnlyId,
        dark: darkOnlyId,
      });
      expect(recovered.light).toBe('pierre');
      expect(recovered.dark).toBe(darkOnlyId);
      expect(recovered.mode).toBe('system');
    }
  });

  test('corrupt mode recovers to fallback mode without altering valid halves', () => {
    const recovered = normalizeThemePair({
      mode: 'sepia' as any,
      light: 'catppuccin',
      dark: 'ayu-dark',
    });
    expect(recovered).toEqual({
      mode: 'dark',
      light: 'catppuccin',
      dark: 'ayu-dark',
    });
  });
});

describe('seedThemePair', () => {
  test('seeds both halves from a both-mode palette', () => {
    expect(seedThemePair('catppuccin', 'system')).toEqual({
      mode: 'system',
      light: 'catppuccin',
      dark: 'catppuccin',
    });
  });

  test('seeds dark half from dark-only palette and recovers light half to Pierre', () => {
    expect(seedThemePair('ayu-dark', 'dark')).toEqual({
      mode: 'dark',
      light: 'pierre',
      dark: 'ayu-dark',
    });
    expect(seedThemePair('tokyo-night', 'system')).toEqual({
      mode: 'system',
      light: 'pierre',
      dark: 'tokyo-night',
    });
  });

  test('seeds unknown palette to Pierre in both halves', () => {
    expect(seedThemePair('corrupted', 'light')).toEqual({
      mode: 'light',
      light: 'pierre',
      dark: 'pierre',
    });
  });
});

describe('user-supplied themes support', () => {
  test('registers and unregisters custom user themes', () => {
    const customTheme: ThemeInfo = {
      id: 'custom-solar',
      name: 'Custom Solar',
      builtIn: false,
      modeSupport: 'both',
      colors: {
        dark: { primary: '#fff', secondary: '#000', accent: '#f00', background: '#111', foreground: '#eee' },
        light: { primary: '#000', secondary: '#fff', accent: '#f00', background: '#eee', foreground: '#111' },
      },
    };

    expect(isKnownTheme('custom-solar')).toBe(false);
    registerUserTheme(customTheme);
    expect(isKnownTheme('custom-solar')).toBe(true);
    expect(themeSupportsHalf('custom-solar', 'light')).toBe(true);
    expect(themeSupportsHalf('custom-solar', 'dark')).toBe(true);

    unregisterUserTheme('custom-solar');
    expect(isKnownTheme('custom-solar')).toBe(false);
  });
});

describe('explicit palette descriptors (all 7 semantic groups)', () => {
  const REQUIRED_GROUPS = [
    'chrome',
    'diffBridge',
    'syntax',
    'terminal',
    'focus',
    'selection',
    'status',
  ] as const;

  test('every palette descriptor defines all seven semantic groups in dark mode', () => {
    for (const [id, descriptor] of Object.entries(PALETTE_DESCRIPTORS)) {
      expect(descriptor.modes.dark).toBeDefined();
      for (const group of REQUIRED_GROUPS) {
        expect(descriptor.modes.dark[group], `${id} dark.${group} must be defined`).toBeDefined();
      }
    }
  });

  test('both-mode palettes define all seven semantic groups in light mode', () => {
    for (const id of ['pierre', 'hypermark', 'catppuccin', 'github'] as const) {
      const descriptor = PALETTE_DESCRIPTORS[id];
      expect(descriptor.modes.light).toBeDefined();
      for (const group of REQUIRED_GROUPS) {
        expect(descriptor.modes.light![group], `${id} light.${group} must be defined`).toBeDefined();
      }
    }
  });

  test('dark-only palettes do NOT define light mode in their descriptors', () => {
    for (const id of ['ayu-dark', 'one-dark-pro', 'tokyo-night'] as const) {
      const descriptor = PALETTE_DESCRIPTORS[id];
      expect(descriptor.modes.light).toBeUndefined();
    }
  });

  test('terminal ANSI palette defines all 16 colors + shell tokens', () => {
    for (const descriptor of Object.values(PALETTE_DESCRIPTORS)) {
      const term = descriptor.modes.dark.terminal;
      expect(term.black).toBeTruthy();
      expect(term.red).toBeTruthy();
      expect(term.green).toBeTruthy();
      expect(term.yellow).toBeTruthy();
      expect(term.blue).toBeTruthy();
      expect(term.magenta).toBeTruthy();
      expect(term.cyan).toBeTruthy();
      expect(term.white).toBeTruthy();
      expect(term.brightBlack).toBeTruthy();
      expect(term.brightRed).toBeTruthy();
      expect(term.brightGreen).toBeTruthy();
      expect(term.brightYellow).toBeTruthy();
      expect(term.brightBlue).toBeTruthy();
      expect(term.brightMagenta).toBeTruthy();
      expect(term.brightCyan).toBeTruthy();
      expect(term.brightWhite).toBeTruthy();
      expect(term.background).toBeTruthy();
      expect(term.foreground).toBeTruthy();
      expect(term.cursor).toBeTruthy();
      expect(term.selectionBackground).toBeTruthy();
    }
  });
});

describe('resolveModeDescriptor', () => {
  test('resolves supported palette and mode directly', () => {
    const catppuccinDark = resolveModeDescriptor('catppuccin', 'dark');
    expect(catppuccinDark.paletteId).toBe('catppuccin');
    expect(catppuccinDark.mode).toBe('dark');
    expect(catppuccinDark.chrome.background).toBe('#1e1e2e');
    expect(catppuccinDark.syntax.syntaxTheme).toBe('catppuccin-mocha');

    const catppuccinLight = resolveModeDescriptor('catppuccin', 'light');
    expect(catppuccinLight.paletteId).toBe('catppuccin');
    expect(catppuccinLight.mode).toBe('light');
    expect(catppuccinLight.chrome.background).toBe('#eff1f5');
    expect(catppuccinLight.syntax.syntaxTheme).toBe('catppuccin-latte');
  });

  test('recovers dark-only palette in light mode to Pierre Light', () => {
    for (const id of ['ayu-dark', 'one-dark-pro', 'tokyo-night']) {
      const recovered = resolveModeDescriptor(id, 'light');
      expect(recovered.paletteId).toBe('pierre');
      expect(recovered.mode).toBe('light');
      expect(recovered.chrome.background).toBe('#ffffff');
      expect(recovered.syntax.syntaxTheme).toBe('pierre-light');
    }
  });

  test('recovers unknown or removed palette to Pierre in the requested mode', () => {
    const darkRec = resolveModeDescriptor('unknown-palette', 'dark');
    expect(darkRec.paletteId).toBe('pierre');
    expect(darkRec.mode).toBe('dark');
    expect(darkRec.chrome.background).toBe('#0a0a0a');

    const lightRec = resolveModeDescriptor('unknown-palette', 'light');
    expect(lightRec.paletteId).toBe('pierre');
    expect(lightRec.mode).toBe('light');
    expect(lightRec.chrome.background).toBe('#ffffff');
  });
});

describe('resolveThemeDescriptor (atomic resolution)', () => {
  test('commits atomically for dark mode', () => {
    const desc = resolveThemeDescriptor({ mode: 'dark', light: 'github', dark: 'ayu-dark' });
    expect(desc.requestedMode).toBe('dark');
    expect(desc.resolvedMode).toBe('dark');
    expect(desc.colorTheme).toBe('ayu-dark');
    expect(desc.paletteId).toBe('ayu-dark');
    expect(desc.chrome.background).toBe('#10141c');
    expect(desc.syntax.syntaxTheme).toBe('ayu-dark');
    // Also exposes light and dark half descriptors atomically
    expect(desc.light.paletteId).toBe('github');
    expect(desc.light.mode).toBe('light');
    expect(desc.dark.paletteId).toBe('ayu-dark');
    expect(desc.dark.mode).toBe('dark');
  });

  test('commits atomically for light mode', () => {
    const desc = resolveThemeDescriptor({ mode: 'light', light: 'catppuccin', dark: 'one-dark-pro' });
    expect(desc.requestedMode).toBe('light');
    expect(desc.resolvedMode).toBe('light');
    expect(desc.colorTheme).toBe('catppuccin');
    expect(desc.paletteId).toBe('catppuccin');
    expect(desc.chrome.background).toBe('#eff1f5');
    expect(desc.syntax.syntaxTheme).toBe('catppuccin-latte');
  });

  test('commits atomically for system mode following preferredMode', () => {
    const descDark = resolveThemeDescriptor(
      { mode: 'system', light: 'github', dark: 'catppuccin' },
      'dark',
    );
    expect(descDark.requestedMode).toBe('system');
    expect(descDark.resolvedMode).toBe('dark');
    expect(descDark.colorTheme).toBe('catppuccin');

    const descLight = resolveThemeDescriptor(
      { mode: 'system', light: 'github', dark: 'catppuccin' },
      'light',
    );
    expect(descLight.requestedMode).toBe('system');
    expect(descLight.resolvedMode).toBe('light');
    expect(descLight.colorTheme).toBe('github');
  });

  test('recovers corrupt preferences atomically without intermediate state', () => {
    const desc = resolveThemeDescriptor({
      mode: 'system',
      light: 'corrupted-theme',
      dark: 'another-corrupted',
    }, 'dark');
    expect(desc.pair).toEqual({
      mode: 'system',
      light: 'pierre',
      dark: 'pierre',
    });
    expect(desc.colorTheme).toBe('pierre');
    expect(desc.paletteId).toBe('pierre');
    expect(desc.resolvedMode).toBe('dark');
  });
});

describe('getTerminalTheme', () => {
  test('extracts synchronous terminal tokens from descriptor', () => {
    const desc = resolveThemeDescriptor({ mode: 'dark', light: 'pierre', dark: 'catppuccin' });
    const term = getTerminalTheme(desc);
    expect(term.background).toBe('#1e1e2e');
    expect(term.cursor).toBe('#f5e0dc');
    expect(term.selectionBackground).toBe('#585b70');
  });
});
