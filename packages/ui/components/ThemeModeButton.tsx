import React from 'react';
import { ActionMenu } from './ActionMenu';
import { useTheme } from './ThemeProvider';
import { THEME_MODES } from './themeModes';

/**
 * Theme switcher as a header control rather than a row inside the Options
 * menu. The trigger shows the mode that is currently active, so the header
 * itself reports the theme; the popover is just the three-way picker that
 * used to live under Options → Theme.
 *
 * Wide headers only. Compact touch shells have a single 44px slot in their
 * header and keep the picker as menu rows, so this takes no compact variant.
 */
export const ThemeModeButton: React.FC = () => {
  const { mode, setMode } = useTheme();
  const ActiveIcon = (THEME_MODES.find(m => m.id === mode) ?? THEME_MODES[0]).Icon;

  return (
    <ActionMenu
      panelClassName="absolute top-full right-0 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-xl z-[70]"
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
      {({ closeMenu }) => (
        <div className="flex flex-col gap-0.5">
          {THEME_MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                closeMenu();
                setMode(id);
              }}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                mode === id
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </ActionMenu>
  );
};
