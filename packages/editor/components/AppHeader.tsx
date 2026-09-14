import React from 'react';
import type { Origin } from '@hypermark/shared/agents';
import { FeedbackButton, ApproveButton } from '@hypermark/ui/components/ToolbarButtons';
import { DecisionControl, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import type { DecisionActionId, DecisionSpec } from '@hypermark/ui/utils/decisionSpec';
import { PlanHeaderMenu } from '@hypermark/ui/components/PlanHeaderMenu';
import { ThemeModeButton } from '@hypermark/ui/components/ThemeModeButton';
import { KeyboardShortcutsButton } from '@hypermark/ui/components/KeyboardShortcutsDialog';
import type { UIPreferences } from '@hypermark/ui/utils/uiPreferences';
import { HtmlSurfaceControls } from '@hypermark/ui/components/HtmlSurfaceControls';

/** Hypermark's refresh strings for the published control: the document
 * is a file on disk, so the refresh says so. */
export const HYPERMARK_HTML_REFRESH_LABELS = {
  refreshTitle: 'Refresh HTML from disk',
  refreshingTitle: 'Refreshing HTML from disk',
} as const;

interface AppHeaderProps {
  /** Mobile document-scroll surfaces let Safari own the top edge and scroll
   * this header with the page. Desktop keeps the incumbent sticky header. */
  sticky?: boolean;
  /** HTML annotate surface (raw HTML or live app): shows the pen toggle. */
  htmlSurface?: boolean;
  /** Interact/Annotate toggle for HTML and live-app surfaces: armed means
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
  isPanelOpen: boolean;
  annotationCount: number;
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
    /** Framed surfaces (raw-HTML srcdoc / live-app proxy): iframe focus
     *  dismisses the popover since clicks never reach the parent document. */
    dismissOnIframeFocus?: boolean;
  };

  // Handlers — App owns all decision logic, header just calls these
  onFeedback: () => void;
  onApprove: () => void;
  onAnnotationPanelToggle: () => void;
  onCopyAgentInstructions: () => void;

  // PlanHeaderMenu config
  agentInstructionsEnabled: boolean;
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
  isPanelOpen,
  annotationCount,
  linkedDocIsActive,
  agentName,
  showAnnotationsWarning,
  annotateDecision,
  onFeedback,
  onApprove,
  onAnnotationPanelToggle,
  onCopyAgentInstructions,
  agentInstructionsEnabled,
}) => {
  return (
    <header
      data-app-header="true"
      className={`h-12 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-[50] ${sticky ? 'sticky top-0' : 'relative'}`}
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
                  <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-xl text-xs text-foreground w-56 text-center opacity-0 invisible group-hover/approve:opacity-100 group-hover/approve:visible transition-all pointer-events-none z-50">
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

        {/* HTML and live-app surfaces only: the eye (show/hide tools, the
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

        {/* Annotations panel toggle */}
        <button
          onClick={onAnnotationPanelToggle}
          className={`relative p-1.5 rounded-md text-xs font-medium transition-all ${
            isPanelOpen
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={isPanelOpen ? 'Hide annotations' : 'Show annotations'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          {annotationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground px-0.5">
              {annotationCount > 99 ? '99+' : annotationCount}
            </span>
          )}
        </button>

        <ThemeModeButton />

        <KeyboardShortcutsButton mode={annotateMode ? 'annotate' : 'plan'} />

        <PlanHeaderMenu
          onCopyAgentInstructions={onCopyAgentInstructions}
          agentInstructionsEnabled={agentInstructionsEnabled}
        />
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
