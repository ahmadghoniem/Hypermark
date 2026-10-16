/**
 * Quick Labels — preset annotation labels for one-click feedback
 *
 * Labels are stored in cookies (same pattern as other settings)
 * so they persist across different port-based sessions.
 */

import { storage } from './storage';

export interface QuickLabel {
  id: string;     // kebab-case identifier e.g. "needs-tests"
  emoji: string;  // single emoji e.g. "🧪", or '' for a label that carries none
  text: string;   // display text e.g. "Needs tests"
}

/**
 * The text a quick label writes into an annotation: "🧪 Needs tests", or just
 * "Agreed" for a label with no emoji. Every call site that used to inline
 * `${emoji} ${text}` goes through here so an empty emoji cannot leave a
 * leading space in the stored annotation text.
 */
export function formatQuickLabel(label: QuickLabel): string {
  return label.emoji ? `${label.emoji} ${label.text}` : label.text;
}

/**
 * The positive label the default set opens with. Ordinary in every way — it
 * can be renamed, reordered and deleted like any other.
 *
 * It carries no emoji: it reads as a plain verdict on the selection, not as a
 * reaction to it.
 */
export const AGREED_LABEL: QuickLabel = {
  id: 'agreed',
  emoji: '',
  text: 'Agreed',
};

/**
 * The labels floating above an anchored composer. One click saves a comment
 * with the label's text. Agreed comes first.
 * These are only the starting point: the settings popover writes the whole
 * list, and a stored list replaces this one outright.
 */
export const DEFAULT_QUICK_LABELS: QuickLabel[] = [
  AGREED_LABEL,
  { id: 'needs-explanation', emoji: '', text: 'Needs explanation' },
  { id: 'verify-this', emoji: '', text: 'Verify this' },
  { id: 'give-an-example', emoji: '', text: 'Give an example' },
  { id: 'out-of-scope', emoji: '', text: 'Out of scope' },
  { id: 'needs-tests', emoji: '', text: 'Needs tests' },
];

const STORAGE_KEY_QUICK_LABELS = 'hypermark-quick-labels';
/** Cookies hold ~4KB; these caps keep the list well inside that. */
export const QUICK_LABEL_MAX_COUNT = 24;

/** kebab-case id derived from the text, made unique against `taken`. */
export function quickLabelId(text: string, taken: readonly string[]): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'label';
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Parses stored JSON, dropping anything malformed. */
export function parseQuickLabels(raw: string | null): QuickLabel[] {
  if (!raw) return DEFAULT_QUICK_LABELS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_LABELS;
    const labels = parsed
      .filter((l): l is QuickLabel =>
        !!l && typeof l === 'object'
        && typeof (l as QuickLabel).id === 'string'
        && typeof (l as QuickLabel).text === 'string')
      .slice(0, QUICK_LABEL_MAX_COUNT)
      .map((l) => ({
        id: l.id,
        emoji: typeof l.emoji === 'string' ? l.emoji : '',
        text: l.text.slice(0, 60),
      }));
    return labels;
  } catch {
    return DEFAULT_QUICK_LABELS;
  }
}

export function getQuickLabels(): QuickLabel[] {
  return parseQuickLabels(storage.getItem(STORAGE_KEY_QUICK_LABELS));
}

const quickLabelListeners = new Set<() => void>();

/** Persists the whole list, capped at what a cookie holds. */
export function saveQuickLabels(labels: readonly QuickLabel[]): void {
  const capped = labels.slice(0, QUICK_LABEL_MAX_COUNT);
  storage.setItem(STORAGE_KEY_QUICK_LABELS, JSON.stringify(capped));
  for (const listener of quickLabelListeners) listener();
}

/** Subscribe to saves, so every open composer re-reads the list. */
export function subscribeQuickLabels(listener: () => void): () => void {
  quickLabelListeners.add(listener);
  return () => quickLabelListeners.delete(listener);
}
