import React from 'react';
import {
  formatShortcutBindingTokens,
  getShortcutRegistryForMode,
  listRegistryShortcutSections,
  type ShortcutEntry,
  type ShortcutSurfaceMode,
} from '../shortcuts';

/* ─── Key cap component ─── */

const Kbd: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <kbd
    className={`inline-flex items-center justify-center h-5.5 ${
      wide ? 'min-w-5.5 px-1.5' : 'min-w-5.5'
    } rounded bg-muted border border-border/60 border-b-2 text-[11px] font-mono leading-none text-foreground/80 shadow-sm`}
  >
    {children}
  </kbd>
);

/* ─── Key combo renderer ─── */

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="inline-flex items-center gap-0.5">
    {keys.map((k, i) => (
      <Kbd key={i} wide={k.length > 1}>{k}</Kbd>
    ))}
  </span>
);

/**
 * Every binding for one action, alternatives separated by "or".
 *
 * The registry allows several bindings per action (`J` or `ArrowDown`), which
 * the old hand-typed table had no way to express and so silently dropped.
 */
const Bindings: React.FC<{ bindings: string[] }> = ({ bindings }) => (
  <span className="inline-flex items-center gap-1.5">
    {bindings.map((binding, i) => (
      <React.Fragment key={binding}>
        {i > 0 && <span className="text-[10px] text-muted-foreground/50">or</span>}
        <Keys keys={formatShortcutBindingTokens(binding)} />
      </React.Fragment>
    ))}
  </span>
);

/* ─── Shortcut row ─── */

const ShortcutRow: React.FC<{ shortcut: ShortcutEntry }> = ({ shortcut }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <span className="text-xs text-muted-foreground">
      {shortcut.description}
      {shortcut.hint && (
        <span className="relative group ml-1 inline-flex">
          <span className="inline-flex items-center justify-center size-3.5 rounded-full text-[9px] font-medium bg-muted-foreground/15 text-muted-foreground/60 cursor-default">?</span>
          <span className="absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 rounded bg-foreground text-background text-[11px] leading-snug w-80 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg z-50">
            {shortcut.hint}
          </span>
        </span>
      )}
    </span>
    <Bindings bindings={shortcut.bindings} />
  </div>
);

/* ─── Section ─── */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-0.5">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
      {title}
    </div>
    {children}
  </div>
);

/* ─── Exported panel ─── */

/**
 * The surface shortcut reference, rendered from the shortcut registry.
 *
 * It used to be a second, hand-maintained list of the same keys the registry
 * already described — and it had drifted: it documented `A` to stage a file
 * and `Alt Alt` to switch feedback destination, neither of which still exists,
 * while never mentioning annotation undo and redo, which do. Reading the
 * registry is what makes that class of bug impossible rather than merely
 * fixed. See `shortcuts/surfaces.ts` for which scopes each mode shows.
 */
export const KeyboardShortcuts: React.FC<{
  mode: ShortcutSurfaceMode;
}> = ({ mode }) => {
  const sections = React.useMemo(
    () => listRegistryShortcutSections(getShortcutRegistryForMode(mode)),
    [mode],
  );

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.shortcuts.map((shortcut) => (
            <ShortcutRow key={`${shortcut.scopeId}:${shortcut.actionId}`} shortcut={shortcut} />
          ))}
        </Section>
      ))}
    </div>
  );
};
