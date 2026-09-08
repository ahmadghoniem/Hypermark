import { describe, expect, test } from 'bun:test';

import {
  codeBlockClassName,
  CODE_BLOCK_CLASS,
  applyHighlight,
  highlightToHtml,
  __resetCodeHighlightCacheForTests,
} from './codeHighlight';
import { resolveFenceTheme, resolveSyntaxTheme, DEFAULT_SYNTAX_THEME, SHIKI_THEME_MAP } from './syntaxTheme';

const hasDom = typeof document !== 'undefined';

describe('code block class', () => {
  test('carries the structural class and the language hook', () => {
    expect(codeBlockClassName('rust')).toBe(`${CODE_BLOCK_CLASS} font-mono language-rust`);
  });

  test('omits the language hook for language-less fences', () => {
    expect(codeBlockClassName()).toBe(`${CODE_BLOCK_CLASS} font-mono`);
    expect(codeBlockClassName(undefined)).not.toContain('language-');
  });
});

describe('fence theme resolution', () => {
  test('matches the theme the diff pane resolves, per mode', () => {
    expect(resolveFenceTheme('one-dark-pro', 'dark')).toBe('one-dark-pro');
    expect(resolveFenceTheme('github', 'light')).toBe('github-light');
    expect(resolveFenceTheme('catppuccin', 'dark')).toBe('catppuccin-mocha');
    expect(resolveFenceTheme('catppuccin', 'light')).toBe('catppuccin-latte');
  });

  test('falls back to the Pierre defaults for palettes outside the map', () => {
    // A palette id the map does not carry -- a removed built-in, or a
    // user-supplied theme -- renders in exactly what @pierre/diffs uses when
    // handed no theme at all.
    expect(resolveSyntaxTheme('kanagawa-wave', 'dark')).toBeUndefined();
    expect(resolveFenceTheme('kanagawa-wave', 'dark')).toBe(DEFAULT_SYNTAX_THEME.dark);
    expect(resolveFenceTheme('kanagawa-wave', 'light')).toBe(DEFAULT_SYNTAX_THEME.light);

    // Hypermark now names Pierre's syntax themes explicitly, so it resolves
    // to the same pair by data rather than by lookup miss.
    expect(resolveFenceTheme('hypermark', 'dark')).toBe(DEFAULT_SYNTAX_THEME.dark);
    expect(resolveFenceTheme('hypermark', 'light')).toBe(DEFAULT_SYNTAX_THEME.light);
  });

  test('falls back per mode when a palette only defines one side', () => {
    // tokyo-night is dark-only; its light mode must still resolve to something.
    expect(SHIKI_THEME_MAP['tokyo-night']?.light).toBeNull();
    expect(resolveFenceTheme('tokyo-night', 'dark')).toBe('tokyo-night');
    expect(resolveFenceTheme('tokyo-night', 'light')).toBe(DEFAULT_SYNTAX_THEME.light);
  });

  test('every mapped theme name is non-empty', () => {
    for (const [palette, pair] of Object.entries(SHIKI_THEME_MAP)) {
      expect(pair.dark ?? pair.light, `${palette} maps to nothing`).toBeTruthy();
    }
  });
});

describe('highlightToHtml', () => {
  test('returns null until a grammar is attached, so callers render plain', () => {
    // The attachment cache is MODULE state shared with every other test file in
    // this bun process, and any file that renders a typescript fence attaches
    // that grammar for good. Reset it so this test asserts the pre-attachment
    // CONTRACT rather than whichever files happened to run first.
    __resetCodeHighlightCacheForTests();
    expect(highlightToHtml('const x = 1', 'typescript', 'pierre-dark')).toBeNull();
  });
});

describe.if(hasDom)('applyHighlight', () => {
  test('language-less fences render as plain text, never guessed (#1212)', () => {
    const el = document.createElement('code');
    applyHighlight(el, 'plain <b>text</b> & more', undefined, 'pierre-dark');
    expect(el.textContent).toBe('plain <b>text</b> & more');
    // Escaped into text nodes, not parsed as markup.
    expect(el.querySelector('b')).toBeNull();
    expect(el.children.length).toBe(0);
  });

  test('writes the exact source immediately so there is no layout shift', () => {
    const el = document.createElement('code');
    const code = 'fn main() {\n    println!("hi");\n}';
    applyHighlight(el, code, 'rust', 'pierre-dark');
    // The highlighter is cold here, so the synchronous result is the plain
    // source at its final size; the highlighted swap lands later.
    expect(el.textContent).toBe(code);
  });
});
