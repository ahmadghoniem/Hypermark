import React from 'react';
import { useDialKit } from 'dialkit';

/**
 * The composer's quoted text, which signals a copy (Ctrl/Cmd+C with nothing
 * selected in the field) by animating in place. `flash` is a counter: each
 * copy bumps it, which remounts the text and restarts the animation; the
 * owner resets it to 0 from `onDone`. The signal is picked in the dials panel.
 */

const SIGNALS = ['sweep', 'slow', 'success', 'flash', 'swap'] as const;
type CopySignal = (typeof SIGNALS)[number];

interface QuoteTextProps {
  children: React.ReactNode;
  flash: number;
  onDone: () => void;
  className?: string;
}

export const QuoteText: React.FC<QuoteTextProps> = ({ children, flash, onDone, className }) => {
  const dials = useDialKit('08 · Copy signal', {
    signal: {
      type: 'select',
      options: [
        { value: 'sweep', label: 'sweep · default' },
        { value: 'slow', label: 'slow wide sweep' },
        { value: 'success', label: 'green sweep · rec' },
        { value: 'flash', label: 'brighten and fade' },
        { value: 'swap', label: 'swap to "Copied"' },
      ],
      default: 'sweep',
    },
  }, { id: 'cl-08', persist: true });
  const signal: CopySignal = (SIGNALS as readonly string[]).includes(dials.signal)
    ? (dials.signal as CopySignal)
    : 'sweep';

  return (
    <span className={`grid min-w-0 grid-cols-[minmax(0,1fr)] ${className ?? ''}`}>
      <span
        key={flash}
        className={`col-start-1 row-start-1 truncate ${flash ? `copy-signal copy-signal-${signal}` : ''}`}
        onAnimationEnd={onDone}
      >
        {children}
      </span>
      {flash > 0 && signal === 'swap' && (
        <span key={`copied-${flash}`} aria-hidden="true" className="copy-swap-label col-start-1 row-start-1 truncate text-success">
          Copied ✓
        </span>
      )}
      <span className="sr-only" aria-live="polite">{flash ? 'Copied' : ''}</span>
    </span>
  );
};
