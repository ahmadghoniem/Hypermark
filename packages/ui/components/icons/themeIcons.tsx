import React from 'react';
import { Sun, Moon, Monitor } from '@phosphor-icons/react';

/**
 * Shared theme-mode icons (Sun / Moon / System).
 *
 * Several components render the same theme picker (ThemeTab,
 * historically MobileMenu). They used to inline hand-rolled SVGs
 * independently, which meant any tweak to a glyph had to be hunted down
 * across files. Centralizing them here keeps the iconography consistent.
 * The SVG bodies were migrated to Phosphor (spec 03 step 5); the exported
 * component names and their `className`-only prop signature are unchanged
 * so ThemeTab does not need to change.
 *
 * Each icon takes an optional `className` so callers control sizing —
 * the dropdown segmented controls use w-3.5, the settings tab uses w-3.
 * Weight is fixed at Phosphor's default `regular` here to match the rest of
 * the app (see the ui-package IconContext.Provider default).
 */

export interface IconProps {
  className?: string;
}

export const SunIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Sun className={className} weight="regular" />
);

export const MoonIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Moon className={className} weight="regular" />
);

export const SystemIcon: React.FC<IconProps> = ({ className = 'size-3.5' }) => (
  <Monitor className={className} weight="regular" />
);
