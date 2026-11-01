import { describe, expect, test } from 'bun:test';
import {
  BUILT_IN_THEMES,
  DEFAULT_COLOR_THEME,
  DEFAULT_THEME_PAIR,
  getUnsupportedMode,
  isKnownTheme,
  themeSupportsHalf,
  themesForHalf,
  normalizeThemePair,
  seedThemePair,
  resolvePairTheme,
} from './themeRegistry';

describe('BUILT_IN_THEMES', () => {
  test('contains exactly the seven retained palette IDs', () => {
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
