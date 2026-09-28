import React from 'react';
import type { Origin } from '@hypermark/shared/agents';
import { FeedbackButton, ApproveButton } from '@hypermark/ui/components/ToolbarButtons';
import { DecisionControl, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import type { DecisionActionId, DecisionSpec } from '@hypermark/ui/utils/decisionSpec';
import { ThemeModeButton } from '@hypermark/ui/components/ThemeModeButton';
import { QuickLabelsButton } from '@hypermark/ui/components/QuickLabelsSettings';
import { KeyboardShortcutsButton } from '@hypermark/ui/components/KeyboardShortcutsDialog';
import type { UIPreferences } from '@hypermark/ui/utils/uiPreferences';
import { HtmlSurfaceControls } from '@hypermark/ui/components/HtmlSurfaceControls';

/** Hypermark's refresh strings for the published control: the document
 * is a file on disk, so the refresh says so. */
const HYPERMARK_HTML_REFRESH_LABELS = {
  refreshTitle: 'Refresh HTML from disk',
  refreshingTitle: 'Refreshing HTML from disk',
} as const;

interface AppHeaderProps {
  /** Mobile document-scroll surfaces let Safari own the top edge and scroll
   * this header with the page. Desktop keeps the incumbent sticky header. */
  sticky?: boolean;
  /** HTML annotate surface: shows the pen toggle. */
  htmlSurface?: boolean;
  /** Interact/Annotate toggle for HTML surfaces: armed means
   *  clicks annotate; unarmed hands the page back its native interaction
   *  (text drag-selection commenting stays live either way). */
  htmlAnnotateArmed?: boolean;
  onToggleHtmlAnnotate?: () => void;
  /** Floating tools (sidebar tongue tabs + comment/attachments cluster) are
   *  fully removed from the DOM while hidden; this button is the way back. */
  htmlToolsHidden?: boolean;
  onToggleHtmlTools?: () => void;
  canRefreshHtml?: boolean;
  isRefreshingHtml?: boolean;
  onRefreshHtml?: () => void;
  // Mode flags (stable after mount)
  isApiMode: boolean;
  annotateMode: boolean;
  origin: Origin | null;

  // Dynamic state
  isSubmitting: boolean;
  isExiting: boolean;
  linkedDocIsActive: boolean;
  agentName: string;
  showAnnotationsWarning: boolean;
  /** The unified annotate decision control (spec + handlers + close title).
   *  App owns the spec derivation and every handler; the header only mounts
   *  the control beside the ghost Close. Absent outside annotate mode. */
  annotateDecision?: {
    spec: DecisionSpec;
    handlers: Record<DecisionActionId, DecisionHandler>;
    closeTitle: string;
    /** Framed surfaces (raw-HTML srcdoc): iframe focus
     *  dismisses the popover since clicks never reach the parent document. */
    dismissOnIframeFocus?: boolean;
  };

  // Handlers — App owns all decision logic, header just calls these
  onFeedback: () => void;
  onApprove: () => void;
}

export const AppHeader = React.memo<AppHeaderProps>(({
  sticky = true,
  htmlSurface,
  htmlAnnotateArmed,
  onToggleHtmlAnnotate,
  htmlToolsHidden,
  onToggleHtmlTools,
  canRefreshHtml,
  isRefreshingHtml,
  onRefreshHtml,
  isApiMode,
  annotateMode,
  origin,
  isSubmitting,
  isExiting,
  linkedDocIsActive,
  agentName,
  showAnnotationsWarning,
  annotateDecision,
  onFeedback,
  onApprove,
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
        {isApiMode && (!linkedDocIsActive || annotateMode) && (
          <>
            {annotateMode ? (
              annotateDecision && (
                <DecisionControl
                  spec={annotateDecision.spec}
                  handlers={annotateDecision.handlers}
                  busy={isSubmitting || isExiting}
                  isLoading={isSubmitting}
                  dismissOnIframeFocus={annotateDecision.dismissOnIframeFocus}
                />
              )
            ) : (
              <FeedbackButton
                onClick={onFeedback}
                disabled={isSubmitting}
                isLoading={isSubmitting}
                label="Send Feedback"
                title="Send Feedback"
              />
            )}

            {!annotateMode && (
              <div className="relative group/approve">
                <ApproveButton
                  onClick={onApprove}
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  dimmed={showAnnotationsWarning}
                />
                {showAnnotationsWarning && (
                  <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-xl text-xs text-foreground w-56 text-center opacity-0 invisible group-hover/approve:opacity-100 group-hover/approve:visible transition-all pointer-events-none z-chrome">
                    <div className="absolute bottom-full right-4 border-4 border-transparent border-b-border" />
                    <div className="absolute bottom-full right-4 mt-px border-4 border-transparent border-b-popover" />
                    {agentName} doesn't support feedback on approval. Your feedback won't be seen.
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
          </>
        )}

        {/* HTML surfaces only: the eye (show/hide tools, the
            only way back from hidden), the refresh, and the Interact/Annotate
            pen, in that order. */}
        {htmlSurface && (onToggleHtmlTools || onToggleHtmlAnnotate) && (
          <HtmlSurfaceControls
            armed={!!htmlAnnotateArmed}
            onToggleArmed={onToggleHtmlAnnotate}
            toolsHidden={!!htmlToolsHidden}
            onToggleTools={onToggleHtmlTools}
            canRefresh={!!canRefreshHtml && !!onRefreshHtml}
            onRefresh={() => onRefreshHtml?.()}
            isRefreshing={!!isRefreshingHtml}
            labels={HYPERMARK_HTML_REFRESH_LABELS}
          />
        )}

        <QuickLabelsButton />

        <ThemeModeButton />

        <KeyboardShortcutsButton mode={annotateMode ? 'annotate' : 'plan'} />
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
      <span className="text-sm font-semibold tracking-tight">Hypermark</span>
    </a>
  </div>
);
