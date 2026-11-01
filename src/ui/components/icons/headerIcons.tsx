import React from 'react';

import { Keyboard01 } from '@untitledui/icons';
/**
 * Icons for the header's own controls.
 *
 * Header icon buttons render these glyphs directly. Callers pass
 * `className` to size them: the header uses w-4, a menu row w-3.5.
 */

export interface HeaderIconProps {
  className?: string;
}

export const ShortcutsIcon: React.FC<HeaderIconProps> = ({ className = 'size-3.5' }) => (
  <Keyboard01 className={className} />
);
