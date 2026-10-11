import React from 'react';
import { Monitor01, Moon01, Sun } from '@untitledui/icons';

/**
 * Shared theme-mode icons (Sun / Moon / System).
 *
 * Several components render the same theme picker (ThemeTab,
 * historically MobileMenu). They used to inline hand-rolled SVGs
 * independently, which meant any tweak to a glyph had to be hunted down
 * across files. Centralizing them here keeps the iconography consistent.
 * The glyphs come from Untitled UI; the exported
 * component names and their `className`-only prop signature are unchanged
 * so ThemeTab does not need to change.
 *
 * Each icon takes an optional `className` so callers control sizing —
 * the dropdown segmented controls use w-3.5, the settings tab uses w-3.
 */

export interface IconProps {
  className?: string;
}

export const SunIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Sun className={className} />
);

export const MoonIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Moon01 className={className} />
);

export const SystemIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Monitor01 className={className} />
);
