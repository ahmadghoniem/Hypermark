import React from 'react';
import { DecisionControl, type DecisionHandler } from '@/ui/components/DecisionControl';
import type { DecisionActionId, DecisionSpec } from '@/ui/utils/decisionSpec';
import { ThemeModeButton } from '@/ui/components/ThemeModeButton';
import { QuickLabelsButton } from '@/ui/components/QuickLabelsSettings';
import { KeyboardShortcutsButton } from '@/ui/components/KeyboardShortcutsDialog';

interface AppHeaderProps {
  /** Mobile document-scroll surfaces let Safari own the top edge and scroll
   * this header with the page. Desktop keeps the incumbent sticky header. */
  sticky?: boolean;
  // Mode flags (stable after mount)
  isApiMode: boolean;

  // Dynamic state
  isSubmitting: boolean;
  isExiting: boolean;
  /** The unified annotate decision control (spec + handlers).
   *  App owns the spec derivation and every handler; the header only mounts
   *  the control beside the ghost Close. Absent outside annotate mode. */
  annotateDecision?: {
    spec: DecisionSpec;
    handlers: Record<DecisionActionId, DecisionHandler>;
    /** Set while the decision has to wait; both segments are disabled and show it on hover. */
    disabledReason?: string;
  };
}

export const AppHeader = React.memo<AppHeaderProps>(({
  sticky = true,
  isApiMode,
  isSubmitting,
  isExiting,
  annotateDecision,
}) => {
  return (
    <header
      data-app-header="true"
      className={`h-12 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-chrome ${sticky ? 'sticky top-0' : 'relative'}`}
    >
      <div className="flex items-center gap-2">
        <AppHeaderLogo />
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {isApiMode && (
          <>
            {annotateDecision && (
              <DecisionControl
                spec={annotateDecision.spec}
                handlers={annotateDecision.handlers}
                busy={isSubmitting || isExiting}
                isLoading={isSubmitting}
                disabledReason={annotateDecision.disabledReason}
              />
            )}

            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
          </>
        )}

        <QuickLabelsButton />

        <ThemeModeButton />

        <KeyboardShortcutsButton mode="annotate" />
      </div>
    </header>
  );
});

const AppHeaderLogo = () => (
  <div className="flex items-center gap-2 md:gap-3">
    <a
      href="https://github.com/ahmadghoniem/Hypermark"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 md:gap-2 hover:opacity-80 transition-opacity"
    >
      <span className="text-body font-semibold tracking-tight">Hypermark</span>
    </a>
  </div>
);
