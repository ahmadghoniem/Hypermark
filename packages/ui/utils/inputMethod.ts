import { storage } from './storage';
import type { InputMethod } from '../types';

const STORAGE_KEY = 'hypermark-input-method';
const HTML_STORAGE_KEY = 'hypermark-input-method-html';
const DEFAULT_METHOD: InputMethod = 'drag';
/**
 * HTML sessions open on Select like every other surface; Pinpoint is one Alt-tap
 * away (`useInputMethodSwitch`).
 */
const DEFAULT_HTML_METHOD: InputMethod = 'drag';

/** Which document surface the input method applies to. */
export type InputMethodSurface = 'markdown' | 'html';

function parseInputMethod(value: unknown): InputMethod | null {
  return value === 'drag' || value === 'pinpoint' ? value : null;
}

/**
 * The HTML preference is stored as a plain method string.
 * Legacy records stored as JSON `{ m, savedAt }` are still supported.
 */
function parseHtmlRecord(raw: string | null): InputMethod | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return parseInputMethod(record.m);
    }
    return parseInputMethod(parsed);
  } catch {
    return parseInputMethod(raw);
  }
}

/**
 * Pure resolution logic (exported for tests).
 *
 * Persistence decision: the two surfaces keep SEPARATE preferences. The legacy
 * shared key was only ever written from markdown sessions, so honoring it for
 * HTML would let a markdown-era "drag" choice silently suppress the HTML
 * preference. HTML sessions therefore read/write their own key: first run
 * defaults to Select, and an explicit switch made inside an HTML session wins on
 * later HTML sessions.
 */
export function resolveInputMethod(
  surface: InputMethodSurface,
  savedShared: string | null,
  savedHtml: string | null,
): InputMethod {
  if (surface === 'html') {
    return parseHtmlRecord(savedHtml) ?? DEFAULT_HTML_METHOD;
  }
  return parseInputMethod(savedShared) ?? DEFAULT_METHOD;
}

export function getInputMethod(surface: InputMethodSurface = 'markdown'): InputMethod {
  return resolveInputMethod(
    surface,
    storage.getItem(STORAGE_KEY),
    storage.getItem(HTML_STORAGE_KEY),
  );
}

export function saveInputMethod(
  method: InputMethod,
  surface: InputMethodSurface = 'markdown',
): void {
  if (surface === 'html') {
    storage.setItem(HTML_STORAGE_KEY, method);
    return;
  }
  storage.setItem(STORAGE_KEY, method);
}
