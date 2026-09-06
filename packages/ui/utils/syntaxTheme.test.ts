import { describe, expect, test } from 'bun:test';
import {
  SHIKI_THEME_MAP,
  DEFAULT_SYNTAX_THEME,
  resolveSyntaxTheme,
  resolveFenceTheme,
} from './syntaxTheme';

describe('SHIKI_THEME_MAP', () => {
  test('contains entries for all seven retained palettes', () => {
    const keys = Object.keys(SHIKI_THEME_MAP).sort();
    expect(keys).toEqual([
      'ayu-dark',
      'catppuccin',
      'github',
      'one-dark-pro',
      'pierre',
      'plannotator',
      'tokyo-night',
    ]);
  });

  test('dark-only palettes have light: null in SHIKI_THEME_MAP', () => {
    expect(SHIKI_THEME_MAP['ayu-dark']?.light).toBeNull();
    expect(SHIKI_THEME_MAP['one-dark-pro']?.light).toBeNull();
    expect(SHIKI_THEME_MAP['tokyo-night']?.light).toBeNull();
  });

  test('both-mode palettes with syntax themes map both dark and light', () => {
    expect(SHIKI_THEME_MAP['pierre']).toEqual({
      dark: 'pierre-dark',
      light: 'pierre-light',
    });
    expect(SHIKI_THEME_MAP['catppuccin']).toEqual({
      dark: 'catppuccin-mocha',
      light: 'catppuccin-latte',
    });
    expect(SHIKI_THEME_MAP['github']).toEqual({
      dark: 'github-dark',
      light: 'github-light',
    });
  });

  test('DEFAULT_SYNTAX_THEME pins Pierre stock defaults', () => {
    expect(DEFAULT_SYNTAX_THEME).toEqual({
      dark: 'pierre-dark',
      light: 'pierre-light',
    });
  });
});

describe('resolveSyntaxTheme', () => {
  test('resolves customized syntax theme pair for diff viewer', () => {
    expect(resolveSyntaxTheme('catppuccin', 'dark')).toEqual({
      dark: 'catppuccin-mocha',
      light: 'catppuccin-latte',
    });
    expect(resolveSyntaxTheme('github', 'light')).toEqual({
      dark: 'github-dark',
      light: 'github-light',
    });
    expect(resolveSyntaxTheme('pierre', 'dark')).toEqual({
      dark: 'pierre-dark',
      light: 'pierre-light',
    });
  });

  test('names Pierre\x27s syntax themes explicitly for plannotator', () => {
    // Plannotator does render in Pierre's syntax themes, but it says so as
    // palette DATA rather than reaching them by falling out of the map: spec 03
    // requires syntax to be explicit for every supported palette and mode, and
    // a key present in the map but resolving to nothing is not a mapping.
    expect(resolveSyntaxTheme('plannotator', 'dark')).toEqual({
      dark: 'pierre-dark',
      light: 'pierre-light',
    });
    expect(resolveSyntaxTheme('plannotator', 'light')).toEqual({
      dark: 'pierre-dark',
      light: 'pierre-light',
    });
  });

  test('returns undefined for dark-only palettes when in light mode', () => {
    expect(resolveSyntaxTheme('ayu-dark', 'light')).toBeUndefined();
    expect(resolveSyntaxTheme('one-dark-pro', 'light')).toBeUndefined();
    expect(resolveSyntaxTheme('tokyo-night', 'light')).toBeUndefined();
  });

  test('returns undefined for unknown or removed palettes', () => {
    expect(resolveSyntaxTheme('dracula', 'dark')).toBeUndefined();
    expect(resolveSyntaxTheme('nord', 'light')).toBeUndefined();
    expect(resolveSyntaxTheme('unknown', 'dark')).toBeUndefined();
  });
});

describe('resolveFenceTheme', () => {
  test('resolves concrete Shiki theme name per mode', () => {
    expect(resolveFenceTheme('pierre', 'dark')).toBe('pierre-dark');
    expect(resolveFenceTheme('pierre', 'light')).toBe('pierre-light');
    expect(resolveFenceTheme('catppuccin', 'dark')).toBe('catppuccin-mocha');
    expect(resolveFenceTheme('catppuccin', 'light')).toBe('catppuccin-latte');
    expect(resolveFenceTheme('github', 'dark')).toBe('github-dark');
    expect(resolveFenceTheme('github', 'light')).toBe('github-light');
    expect(resolveFenceTheme('ayu-dark', 'dark')).toBe('ayu-dark');
    expect(resolveFenceTheme('one-dark-pro', 'dark')).toBe('one-dark-pro');
    expect(resolveFenceTheme('tokyo-night', 'dark')).toBe('tokyo-night');
  });

  test('falls back to Pierre defaults for plannotator', () => {
    expect(resolveFenceTheme('plannotator', 'dark')).toBe(DEFAULT_SYNTAX_THEME.dark);
    expect(resolveFenceTheme('plannotator', 'light')).toBe(DEFAULT_SYNTAX_THEME.light);
  });

  test('dark-only palettes in light mode fall back to Pierre Light', () => {
    expect(resolveFenceTheme('ayu-dark', 'light')).toBe('pierre-light');
    expect(resolveFenceTheme('one-dark-pro', 'light')).toBe('pierre-light');
    expect(resolveFenceTheme('tokyo-night', 'light')).toBe('pierre-light');
  });

  test('unknown or removed palettes fall back to Pierre defaults', () => {
    expect(resolveFenceTheme('dracula', 'dark')).toBe('pierre-dark');
    expect(resolveFenceTheme('nord', 'light')).toBe('pierre-light');
    expect(resolveFenceTheme('corrupted', 'dark')).toBe('pierre-dark');
  });
});
