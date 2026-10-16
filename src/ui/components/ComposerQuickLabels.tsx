import React from 'react';

export interface Suggestion {
  /** The part still to type, drawn after the text. */
  rest: string;
  /** The full completion Tab puts in the field. */
  label: string;
}

/**
 * The rest of the first label the text is a prefix of (the first label when
 * the field is empty), ignoring case. Nothing once the text is a whole label,
 * so an accepted label stays put.
 */
export function suggestionFor(text: string, labels: readonly string[]): Suggestion | null {
  const lower = text.toLowerCase();
  const match = labels.find((l) => l.length > text.length && l.toLowerCase().startsWith(lower));
  return match ? { rest: match.slice(text.length), label: match } : null;
}

/**
 * Quick labels have no chips: the field offers them as a ghost completion
 * that Tab accepts. This draws the typed text, invisible, so the rest lines up
 * right after it, then the Tab key. It sits over the text field and must use
 * the same font, padding and wrapping (`textClassName`).
 */
export const ComposerGhostCompletion: React.FC<{
  text: string;
  suggestion: Suggestion;
  id: string;
  textClassName: string;
}> = ({ text, suggestion, id, textClassName }) => (
  <>
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap wrap-break-word ${textClassName}`}>
      <span className="invisible">{text}</span>
      <span className="text-muted-foreground">{suggestion.rest}</span>
      <kbd className="ml-1.5 inline-flex h-4 -translate-y-px items-center rounded-[5px] border border-border bg-background px-1 align-middle font-sans text-micro text-muted-foreground">
        Tab
      </kbd>
    </div>
    <span id={id} className="sr-only">
      Press Tab for {suggestion.label}
    </span>
  </>
);
