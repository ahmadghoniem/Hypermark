import React from 'react';

/**
 * Icons for the header's own controls.
 *
 * Header icon buttons render these glyphs directly. Callers pass
 * `className` to size them: the header uses w-4, a menu row w-3.5.
 */

export interface HeaderIconProps {
  className?: string;
}

export const ShortcutsIcon: React.FC<HeaderIconProps> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h.01M11 9h.01M15 9h.01M17 9h.01M7 12h.01M11 12h.01M15 12h.01M17 12h.01M9 15h6" />
  </svg>
);
