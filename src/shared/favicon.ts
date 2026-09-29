export type FaviconStyle = 'classic';

export function isFaviconStyle(value: unknown): value is FaviconStyle {
  return value === 'classic';
}

/**
 * Exact historical pre-Totman dark-navy favicon SVG with gold highlight.
 * Byte-identical to the FAVICON_SVG that shipped at 5b91c543^.
 * Source SHA-256: 27d33cff3d4515801f48e1cbaceec777ba802a7d341b22b2c0444d82b303cb49
 */
export const CLASSIC_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#070b14"/>
  <rect x="12" y="28" width="40" height="14" rx="3" fill="#E0BA55" opacity="0.35"/>
  <text x="32" y="46" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="42" fill="white">P</text>
</svg>`;

export const CLASSIC_FAVICON_DATA_URL = `data:image/svg+xml;base64,${btoa(CLASSIC_FAVICON_SVG)}`;

/**
 * Return the data URL for a given favicon style.
 *
 * Classic is the sole offered style.
 */
export function faviconDataUrl(_style?: FaviconStyle): string {
  return CLASSIC_FAVICON_DATA_URL;
}
