/**
 * Quick Labels — preset annotation labels for one-click feedback
 *
 * Labels are stored in cookies (same pattern as other settings)
 * so they persist across different port-based sessions.
 */

export interface QuickLabel {
  id: string;     // kebab-case identifier e.g. "needs-tests"
  emoji: string;  // single emoji e.g. "🧪", or '' for a label that carries none
  text: string;   // display text e.g. "Needs tests"
  color: string;  // key into LABEL_COLOR_MAP
  tip?: string;   // optional instruction injected into feedback for the agent
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

/** Inline styles for label colors (avoids Tailwind dynamic class purging) */
export const LABEL_COLOR_MAP: Record<string, { bg: string; text: string; darkText: string }> = {
  blue:   { bg: 'rgba(59,130,246,0.15)',  text: '#2563eb', darkText: '#60a5fa' },
  red:    { bg: 'rgba(239,68,68,0.15)',   text: '#dc2626', darkText: '#f87171' },
  orange: { bg: 'rgba(249,115,22,0.15)',  text: '#ea580c', darkText: '#fb923c' },
  yellow: { bg: 'rgba(234,179,8,0.15)',   text: '#ca8a04', darkText: '#facc15' },
  purple: { bg: 'rgba(147,51,234,0.15)',  text: '#9333ea', darkText: '#a78bfa' },
  teal:   { bg: 'rgba(20,184,166,0.15)',  text: '#0d9488', darkText: '#2dd4bf' },
  pink:   { bg: 'rgba(236,72,153,0.15)',  text: '#db2777', darkText: '#f472b6' },
  green:  { bg: 'rgba(34,197,94,0.15)',   text: '#16a34a', darkText: '#4ade80' },
  cyan:   { bg: 'rgba(8,145,178,0.15)',   text: '#0891b2', darkText: '#22d3ee' },
  amber:  { bg: 'rgba(180,83,9,0.15)',    text: '#b45309', darkText: '#fbbf24' },
};

/**
 * The hardcoded one-click positive label behind the selection toolbar's and
 * the composer's "Agreed" action. Deliberately NOT part of the configurable
 * set: it is the ONLY label comment-only surfaces (HTML / live-app) may
 * emit — their restricted handlers filter on this id.
 *
 * It carries no emoji: it reads as a plain verdict on the selection, not as a
 * reaction to it.
 */
export const AGREED_LABEL: QuickLabel = {
  id: 'agreed',
  emoji: '',
  text: 'Agreed',
  color: 'green',
};

/** Get color styles for a label, respecting dark mode */
export function getLabelColors(color: string): { bg: string; text: string } {
  const colors = LABEL_COLOR_MAP[color];
  if (!colors) return { bg: 'rgba(128,128,128,0.15)', text: '#666' };
  const isDark = document.documentElement.classList.contains('dark');
  return { bg: colors.bg, text: isDark ? colors.darkText : colors.text };
}

