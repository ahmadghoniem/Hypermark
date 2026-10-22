/**
 * The user's appearance choice: a palette for the light half, a palette for
 * the dark half, and which of them the mode selects. `system` follows the OS,
 * so the two halves swap with `prefers-color-scheme`.
 */
export interface ThemeConfig {
  mode?: 'light' | 'dark' | 'system';
  light?: string;
  dark?: string;
}
