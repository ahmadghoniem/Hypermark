import type { Plugin } from 'vite';

/**
 * Keeps only the woff2 source in KaTeX's `@font-face` rules.
 *
 * `katex.min.css` lists every font as woff2, woff and ttf. The single-file
 * build inlines each `url()` as base64, so all three formats ship (about
 * 1.1 MB more than woff2 alone), though every current browser takes woff2.
 * This drops the woff and ttf entries before Vite resolves the URLs, so they
 * are never read or inlined. Runs after Tailwind has inlined the `@import`.
 */
export function katexWoff2Only(): Plugin {
  const fallback = /,\s*url\(\s*["']?[^)"']*KaTeX_[^)"']*\.(?:woff|ttf)["']?\s*\)\s*format\(\s*["']?(?:woff|truetype)["']?\s*\)/g;
  return {
    name: 'hypermark:katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css(?:$|\?)/.test(id) || !code.includes('KaTeX_')) return null;
      const out = code.replace(fallback, '');
      return out === code ? null : { code: out, map: null };
    },
  };
}
