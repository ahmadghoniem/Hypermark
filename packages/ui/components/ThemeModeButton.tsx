import React, { useState } from 'react';
import { ActionMenu } from './ActionMenu';
import { useTheme } from './ThemeProvider';
import { THEME_MODES, type Mode } from './themeModes';
import { themesForHalf, DEFAULT_COLOR_THEME, type ThemeHalf } from '../utils/themeRegistry';

const SEGMENTED_MODES: { id: Mode; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className = 'size-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ArrowLeftIcon: React.FC<{ className?: string }> = ({ className = 'size-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'size-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ThemePickerPanel: React.FC<{ closeMenu: () => void }> = () => {
  const {
    mode,
    setMode,
    lightTheme,
    darkTheme,
    setHalfTheme,
    availableThemes,
  } = useTheme();

  const [activeHalf, setActiveHalf] = useState<ThemeHalf | null>(null);

  const nameOf = (id: string) => availableThemes.find((t) => t.id === id)?.name ?? id;

  if (activeHalf !== null) {
    const themes = themesForHalf(availableThemes, activeHalf);
    const currentThemeId = activeHalf === 'light' ? lightTheme : darkTheme;
    const title = activeHalf === 'light' ? 'Light themes' : 'Dark themes';

    return (
      <div className="flex flex-col gap-1.5 p-1">
        <div className="flex items-center gap-1.5 px-1 pb-1.5 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveHalf(null)}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeftIcon className="size-3.5" />
          </button>
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
          {themes.map((theme) => {
            const isSelected = currentThemeId === theme.id;
            const colors = theme.colors[activeHalf];
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setHalfTheme(activeHalf, theme.id)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                  isSelected
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {colors && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[colors.primary, colors.secondary, colors.accent, colors.background, colors.foreground].map((color, i) => (
                        <span
                          key={i}
                          className="size-2 rounded-full border border-border/50"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="truncate">{theme.name}</span>
                </div>
                {isSelected && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-1">
      {/* Three-way segmented row across the top: Auto, Light, Dark */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
        {SEGMENTED_MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row per half showing assigned theme name + drill-in chevron */}
      <div className="space-y-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => setActiveHalf('light')}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left group"
        >
          <span className="text-muted-foreground">Light theme</span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <span>{nameOf(lightTheme)}</span>
            <ChevronRightIcon className="size-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveHalf('dark')}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left group"
        >
          <span className="text-muted-foreground">Dark theme</span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <span>{nameOf(darkTheme)}</span>
            <ChevronRightIcon className="size-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
          </span>
        </button>
      </div>

      <div className="my-0.5 border-t border-border" />

      {/* Muted "Reset to default themes" action */}
      <button
        type="button"
        onClick={() => {
          setHalfTheme('light', DEFAULT_COLOR_THEME);
          setHalfTheme('dark', DEFAULT_COLOR_THEME);
        }}
        className="w-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        Reset to default themes
      </button>
    </div>
  );
};

export const ThemeModeButton: React.FC = () => {
  const { mode } = useTheme();
  const ActiveIcon = (THEME_MODES.find(m => m.id === mode) ?? THEME_MODES[0]).Icon;

  return (
    <ActionMenu
      panelClassName="absolute top-full right-0 mt-1 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl z-[70]"
      renderTrigger={({ isOpen, toggleMenu }) => (
        <button
          type="button"
          onClick={toggleMenu}
          className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
            isOpen
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Theme"
          aria-label="Theme"
          aria-expanded={isOpen}
        >
          <ActiveIcon />
        </button>
      )}
    >
      {({ closeMenu }) => <ThemePickerPanel closeMenu={closeMenu} />}
    </ActionMenu>
  );
};
