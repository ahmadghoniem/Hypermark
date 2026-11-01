/**
 * Settings registry — declares all config settings and their resolution rules.
 *
 * Each SettingDef describes:
 *   - defaultValue: fallback (can be a lazy factory for expensive defaults)
 *   - fromCookie/toCookie: serialization to/from cookie storage
 *   - serverKey + fromServer/toServer: opt-in sync to ~/.hypermark/config.json
 *
 * Add new settings here. Cookie-only settings omit serverKey.
 */

import { storage } from '../utils/storage';
import {
  getDefaultThemePair,
  normalizeThemePair,
  type ThemePair,
} from '../utils/themeRegistry';

const MODE_COOKIE = 'hypermark-theme';
const LIGHT_THEME_COOKIE = 'hypermark-light-theme';
const DARK_THEME_COOKIE = 'hypermark-dark-theme';

/**
 * Persist a pair to its cookies without touching the server.
 */
export function writeThemePairCookies(pair: ThemePair): void {
  storage.setItem(MODE_COOKIE, pair.mode);
  storage.setItem(LIGHT_THEME_COOKIE, pair.light);
  storage.setItem(DARK_THEME_COOKIE, pair.dark);
}

/**
 * Read the persisted pair. Returns undefined only when the user has never expressed a
 * theme preference at all — ThemeProvider reads that as "my props decide".
 */
export function readThemePairCookies(): ThemePair | undefined {
  const mode = storage.getItem(MODE_COOKIE);
  const light = storage.getItem(LIGHT_THEME_COOKIE);
  const dark = storage.getItem(DARK_THEME_COOKIE);
  if (!mode && !light && !dark) return undefined;
  return normalizeThemePair({ mode, light, dark }, getDefaultThemePair());
}

export interface SettingDef<T> {
  defaultValue: T | (() => T);
  fromCookie: () => T | undefined;
  toCookie: (value: T) => void;
  /** If set, this setting syncs to server via POST /api/config */
  serverKey?: string;
  fromServer?: (serverConfig: Record<string, unknown>) => T | undefined;
  toServer?: (value: T) => Record<string, unknown>;
}

/** Typed registry of persisted UI settings and their storage codecs. */
export const SETTINGS = {
  /**
   * Appearance: the mode plus the palette assigned to each half of the pair.
   * Stored as one value because the three fields are only meaningful together —
   * `mode: system` picks between `light` and `dark` at render time.
   *
   * Cookies: `hypermark-theme` (mode) joined by
   * `hypermark-light-theme` / `hypermark-dark-theme`.
   *
   * Server: round-trips through `theme` in ~/.hypermark/config.json, so the
   * choice survives the random port each session runs on.
   */
  themePair: {
    defaultValue: () => getDefaultThemePair(),
    fromCookie: () => readThemePairCookies(),
    toCookie: (v: ThemePair) => writeThemePairCookies(v),
    serverKey: 'theme',
    fromServer: (sc: Record<string, unknown>) => {
      const theme = sc.theme as Record<string, unknown> | undefined;
      if (!theme || typeof theme !== 'object') return undefined;
      if (theme.mode === undefined && theme.light === undefined && theme.dark === undefined) return undefined;
      return normalizeThemePair(theme, getDefaultThemePair());
    },
    toServer: (v: ThemePair) => ({ theme: { mode: v.mode, light: v.light, dark: v.dark } }),
  },
  /* SettingDef<any>, not <unknown>: consumers compile this shipped source under
     their own strictFunctionTypes, where a narrow `toCookie: (v: string) => void`
     is contravariantly incompatible with `(value: unknown) => void`. */
} satisfies Record<string, SettingDef<any>>;

export type SettingsMap = typeof SETTINGS;
export type SettingName = keyof SettingsMap;
