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

/**
 * The labels floating above an anchored composer. One click saves a comment
 * with the label's text and tip. Agreed comes first and carries no tip.
 */
export const COMPOSER_QUICK_LABELS: QuickLabel[] = [
  AGREED_LABEL,
  { id: 'needs-explanation', emoji: '', text: 'Needs explanation', color: 'yellow', tip: 'Explain the reasoning behind this before going further.' },
  { id: 'verify-this', emoji: '', text: 'Verify this', color: 'orange', tip: 'This seems like an assumption. Verify by reading the actual code before proceeding.' },
  { id: 'give-an-example', emoji: '', text: 'Give an example', color: 'cyan', tip: 'This is too abstract. Show a before/after, a sample input/output, or a specific scenario so I can see how this actually works.' },
  { id: 'out-of-scope', emoji: '', text: 'Out of scope', color: 'red', tip: 'This is not part of the current task. Remove it and stay focused on what was actually requested.' },
  { id: 'needs-tests', emoji: '', text: 'Needs tests', color: 'blue' },
];
