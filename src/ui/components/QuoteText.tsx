import React from 'react';

/**
 * The composer's quoted text, which signals a copy (Ctrl/Cmd+C with nothing
 * selected in the field) with a light sweep across it. `flash` is a counter:
 * each copy bumps it, which remounts the text and restarts the sweep; the
 * owner resets it to 0 from `onDone`.
 */

interface QuoteTextProps {
  children: React.ReactNode;
  flash: number;
  onDone: () => void;
  className?: string;
}

export const QuoteText: React.FC<QuoteTextProps> = ({ children, flash, onDone, className }) => (
  <span className={`flex min-w-0 ${className ?? ''}`}>
    <span
      key={flash}
      className={`min-w-0 truncate ${flash ? 'copy-signal' : ''}`}
      onAnimationEnd={onDone}
    >
      {children}
    </span>
    <span className="sr-only" aria-live="polite">{flash ? 'Copied' : ''}</span>
  </span>
);
