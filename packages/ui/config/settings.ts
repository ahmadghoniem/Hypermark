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

import {
  isAnnotateAgentTerminalSide,
  type AnnotateAgentTerminalSide,
} from '@hypermark/core/agent-terminal';
import type { DiffLineBgIntensity } from '@hypermark/core/config-types';
import { isFaviconStyle, type FaviconStyle } from '@hypermark/core/favicon';
import { storage } from '../utils/storage';
import { generateIdentity } from '../utils/generateIdentity';
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

const DIFF_LINE_BG_INTENSITY_VALUES = ['subtle', 'normal', 'strong'] as const;
function isDiffLineBgIntensity(v: unknown): v is DiffLineBgIntensity {
  return typeof v === 'string' && (DIFF_LINE_BG_INTENSITY_VALUES as readonly string[]).includes(v);
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
  displayName: {
    defaultValue: () => generateIdentity(),
    fromCookie: () => storage.getItem('hypermark-identity') || undefined,
    toCookie: (v: string) => storage.setItem('hypermark-identity', v),
    serverKey: 'displayName',
    fromServer: (sc: Record<string, unknown>) =>
      typeof sc.displayName === 'string' && sc.displayName ? sc.displayName : undefined,
    toServer: (v: string) => ({ displayName: v }),
  },

  /**
   * Appearance: the mode plus the palette assigned to each half of the pair.
   * Stored as one value because the three fields are only meaningful together —
   * `mode: system` picks between `light` and `dark` at render time.
   *
   * Cookies: `hypermark-theme` (mode) joined by
   * `hypermark-light-theme` / `hypermark-dark-theme`.
   *
   * Server: round-trips through `theme` in ~/.hypermark/config.json exactly
   * like `diffOptions` does, so the choice survives the random port each hook
   * invocation runs on.
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
  faviconStyle: {
    defaultValue: 'classic' as FaviconStyle,
    fromCookie: () => {
      const v = storage.getItem('hypermark-favicon');
      return isFaviconStyle(v) ? v : undefined;
    },
    toCookie: (v: FaviconStyle) => storage.setItem('hypermark-favicon', v),
    serverKey: 'favicon',
    fromServer: (sc: Record<string, unknown>) => {
      const v = sc.favicon;
      return isFaviconStyle(v) ? v : undefined;
    },
    toServer: (v: FaviconStyle) => ({ favicon: v }),
  },

  // --- Diff display options (namespaced under diffOptions in config.json) ---

  // Which left-panel view a code review OPENS in. 'sections' = the git-status
  // view (Committed/Changes/Untracked); 'tree' = the classic file tree.
  // Cookie-only. Written ONLY by Settings and the first-run setup dialog —
  // the in-review header toggle is session-scoped and never writes this
  // (looking at another view mid-review must not silently change the default).
  //
  // Deliberately NOT a value here: 'commits'. The Commits view is session-only
  // and never the opening view — a review always opens on files. A
  // previously-persisted 'commits' cookie is treated as unset.
  reviewPanelView: {
    defaultValue: 'sections' as 'sections' | 'tree',
    fromCookie: () => {
      const v = storage.getItem('hypermark-review-panel-view');
      return v === 'tree' || v === 'sections' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-review-panel-view', v),
    serverKey: undefined, fromServer: undefined, toServer: undefined,
  },

  // The view the user last SELECTED via the in-review header toggle. Layered
  // between the session state and the persisted reviewPanelView default, so a
  // new session opens on what the user was actually using. Cookie-only.
  // null = no last-used recorded (fall through to reviewPanelView).
  //
  // 'commits' is never recorded here for the same reason reviewPanelView
  // rejects it: the Commits view is session-only and never an opening view.
  reviewPanelViewLastUsed: {
    defaultValue: null as 'sections' | 'tree' | null,
    fromCookie: () => {
      const v = storage.getItem('hypermark-review-panel-view-last-used');
      return v === 'tree' || v === 'sections' ? v : undefined;
    },
    toCookie: (v: 'sections' | 'tree' | null) => {
      // The null default seeds through here on first load — "unrecorded" has
      // no cookie representation, so write nothing.
      if (v === 'sections' || v === 'tree') {
        storage.setItem('hypermark-review-panel-view-last-used', v);
      }
    },
    serverKey: undefined, fromServer: undefined, toServer: undefined,
  },

  // Compact left-panel preferences. These are deliberately cookie-only: they
  // shape the local file-list chrome without changing review semantics or the
  // repository state, and should follow the reviewer across review sessions.
  reviewShowViewedControls: {
    defaultValue: true as boolean,
    fromCookie: () => {
      const value = storage.getItem('hypermark-review-show-viewed-controls');
      return value === 'true' ? true : value === 'false' ? false : undefined;
    },
    toCookie: (value: boolean) =>
      storage.setItem('hypermark-review-show-viewed-controls', String(value)),
    serverKey: undefined, fromServer: undefined, toServer: undefined,
  },

  // Mark a file viewed when the reviewer scrolls past it or moves on to
  // another file. Cookie-only like the other review-chrome preferences: it
  // shapes how the local file list checks itself off and changes no review
  // semantics (viewed gates nothing on submit).
  reviewAutoViewed: {
    defaultValue: true as boolean,
    fromCookie: () => {
      const value = storage.getItem('hypermark-review-auto-viewed');
      return value === 'true' ? true : value === 'false' ? false : undefined;
    },
    toCookie: (value: boolean) =>
      storage.setItem('hypermark-review-auto-viewed', String(value)),
    serverKey: undefined, fromServer: undefined, toServer: undefined,
  },

  defaultDiffType: {
    defaultValue: 'since-base' as 'since-base' | 'local-vs-remote' | 'uncommitted' | 'unstaged' | 'staged' | 'merge-base' | 'all',
    fromCookie: () => {
      const v = storage.getItem('hypermark-default-diff-type');
      if (v === 'branch') return 'merge-base' as const;
      return v === 'since-base' || v === 'local-vs-remote' || v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-default-diff-type', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.defaultDiffType;
      if (v === 'branch') return 'merge-base' as const;
      return v === 'since-base' || v === 'local-vs-remote' || v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { defaultDiffType: v } }),
  },

  diffStyle: {
    defaultValue: 'split' as 'split' | 'unified',
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-style') ?? storage.getItem('review-diff-style');
      return v === 'split' || v === 'unified' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-diff-style', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.diffStyle;
      return v === 'split' || v === 'unified' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { diffStyle: v } }),
  },

  diffOverflow: {
    defaultValue: 'scroll' as 'scroll' | 'wrap',
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-overflow');
      return v === 'scroll' || v === 'wrap' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-diff-overflow', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.overflow;
      return v === 'scroll' || v === 'wrap' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { overflow: v } }),
  },

  diffIndicators: {
    defaultValue: 'bars' as 'bars' | 'classic' | 'none',
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-indicators');
      return v === 'bars' || v === 'classic' || v === 'none' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-diff-indicators', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.diffIndicators;
      return v === 'bars' || v === 'classic' || v === 'none' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { diffIndicators: v } }),
  },

  diffLineDiffType: {
    defaultValue: 'word-alt' as 'word-alt' | 'word' | 'char' | 'none',
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-line-diff-type');
      return v === 'word-alt' || v === 'word' || v === 'char' || v === 'none' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('hypermark-diff-line-diff-type', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.lineDiffType;
      return v === 'word-alt' || v === 'word' || v === 'char' || v === 'none' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { lineDiffType: v } }),
  },

  diffShowLineNumbers: {
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-show-line-numbers');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('hypermark-diff-show-line-numbers', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.showLineNumbers;
      return typeof v === 'boolean' ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { showLineNumbers: v } }),
  },

  diffShowBackground: {
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-show-background');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('hypermark-diff-show-background', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.showDiffBackground;
      return typeof v === 'boolean' ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { showDiffBackground: v } }),
  },

  diffFontFamily: {
    defaultValue: '' as string, // empty = theme default
    fromCookie: () => storage.getItem('hypermark-diff-font-family') || undefined,
    toCookie: (v: string) => storage.setItem('hypermark-diff-font-family', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.fontFamily;
      return typeof v === 'string' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { fontFamily: v } }),
  },

  diffHideWhitespace: {
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-hide-whitespace');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('hypermark-diff-hide-whitespace', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.hideWhitespace;
      return typeof v === 'boolean' ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { hideWhitespace: v } }),
  },

  diffExpandUnchanged: {
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-expand-unchanged');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('hypermark-diff-expand-unchanged', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.expandUnchanged;
      return typeof v === 'boolean' ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { expandUnchanged: v } }),
  },

  diffFontSize: {
    defaultValue: '' as string, // empty = theme default
    fromCookie: () => storage.getItem('hypermark-diff-font-size') || undefined,
    toCookie: (v: string) => storage.setItem('hypermark-diff-font-size', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.fontSize;
      return typeof v === 'string' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { fontSize: v } }),
  },
  diffTabSize: {
    defaultValue: 2 as number,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-tab-size');
      const n = v ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n >= 1 && n <= 8 ? n : undefined;
    },
    toCookie: (v: number) => storage.setItem('hypermark-diff-tab-size', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.tabSize;
      return typeof v === 'number' && v >= 1 && v <= 8 ? v : undefined;
    },
    toServer: (v: number) => ({ diffOptions: { tabSize: v } }),
  },
  diffLineBgIntensity: {
    defaultValue: 'subtle' as DiffLineBgIntensity,
    fromCookie: () => {
      const v = storage.getItem('hypermark-diff-line-bg-intensity');
      return isDiffLineBgIntensity(v) ? v : undefined;
    },
    toCookie: (v: DiffLineBgIntensity) =>
      storage.setItem('hypermark-diff-line-bg-intensity', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.lineBgIntensity;
      return isDiffLineBgIntensity(v) ? v : undefined;
    },
    toServer: (v: DiffLineBgIntensity) => ({ diffOptions: { lineBgIntensity: v } }),
  /**
   * Where the annotate-mode Agent TUI docks: 'left' (where it always docked),
   * 'right', or 'hidden' (no slot until the user opens it for the session).
   *
   * Server-synced so the placement survives the random port every annotate
   * session runs on — a cookie alone is per-origin, and each invocation is a
   * new origin, so a cookie-only preference is effectively per-session.
   *
   * The cookie key is the pre-registry one, so a user who already picked a
   * side keeps it across the upgrade.
   */
  agentTerminalSide: {
    defaultValue: 'left' as AnnotateAgentTerminalSide,
    fromCookie: () => {
      const v = storage.getItem('hypermark-annotate-agent-terminal-side');
      return isAnnotateAgentTerminalSide(v) ? v : undefined;
    },
    toCookie: (v: AnnotateAgentTerminalSide) =>
      storage.setItem('hypermark-annotate-agent-terminal-side', v),
    serverKey: 'agentTerminalSide',
    fromServer: (sc: Record<string, unknown>) =>
      isAnnotateAgentTerminalSide(sc.agentTerminalSide) ? sc.agentTerminalSide : undefined,
    toServer: (v: AnnotateAgentTerminalSide) => ({ agentTerminalSide: v }),
  },
  /**
   * Which agent the annotate-mode Agent TUI preselects. Empty string = no
   * choice recorded yet, in which case the first available agent wins.
   * Server-synced for the same reason as the placement above.
   */
  agentTerminalDefaultAgent: {
    defaultValue: '' as string,
    fromCookie: () =>
      storage.getItem('hypermark-annotate-agent-terminal-default') || undefined,
    toCookie: (v: string) => {
      if (v) storage.setItem('hypermark-annotate-agent-terminal-default', v);
      else storage.removeItem('hypermark-annotate-agent-terminal-default');
    },
    serverKey: 'agentTerminalDefaultAgent',
    fromServer: (sc: Record<string, unknown>) =>
      typeof sc.agentTerminalDefaultAgent === 'string' && sc.agentTerminalDefaultAgent
        ? sc.agentTerminalDefaultAgent
        : undefined,
    toServer: (v: string) => ({ agentTerminalDefaultAgent: v }),
  },
  /* SettingDef<any>, not <unknown>: consumers compile this shipped source under
     their own strictFunctionTypes, where a narrow `toCookie: (v: string) => void`
     is contravariantly incompatible with `(value: unknown) => void`. */
} satisfies Record<string, SettingDef<any>>;

export type SettingsMap = typeof SETTINGS;
export type SettingName = keyof SettingsMap;
