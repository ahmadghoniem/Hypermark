import React, { useId } from 'react';

/** One wave period of the squiggle, in px. */
const PERIOD = 12;

const Wave: React.FC = () => {
  const id = useId();
  return (
    <svg aria-hidden="true" className="h-1.5 min-w-0 flex-1 text-muted-foreground/50">
      <defs>
        <pattern id={id} width={PERIOD} height="6" patternUnits="userSpaceOnUse">
          <path
            d={`M0 3 q${PERIOD / 4} -2.5 ${PERIOD / 2} 0 t${PERIOD / 2} 0`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

/**
 * Drawn under a message that a compaction followed: a squiggle across the
 * document's width with "Conversation compacted" in its middle.
 */
export const CompactionSquiggle: React.FC<{ maxWidth?: number }> = ({ maxWidth }) => (
  <div
    role="note"
    className="mt-6 flex w-full items-center gap-3"
    style={maxWidth ? { maxWidth } : undefined}
  >
    <Wave />
    <span className="shrink-0 text-caption text-muted-foreground">Conversation compacted</span>
    <Wave />
  </div>
);
