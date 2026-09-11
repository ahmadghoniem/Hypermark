import React from 'react';
import type { Origin } from '@hypermark/shared/agents';
import { FeedbackButton, ApproveButton, ExitButton } from '@hypermark/ui/components/ToolbarButtons';
import { DecisionControl, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import type { DecisionActionId, DecisionSpec } from '@hypermark/ui/utils/decisionSpec';
import { Settings } from '@hypermark/ui/components/Settings';
import { PlanHeaderMenu } from '@hypermark/ui/components/PlanHeaderMenu';
import { ThemeModeButton } from '@hypermark/ui/components/ThemeModeButton';
import { SettingsIcon } from '@hypermark/ui/components/icons/headerIcons';
import type { UIPreferences } from '@hypermark/ui/utils/uiPreferences';
import type { CompactPlanAction } from '@hypermark/ui/components/PlanHeaderMenu';
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
  /** Compact touch layouts replace the brand mark with a task-focused entry
   * into the full-stage document navigator. Desktop never receives it. */
  compactTouchLayout?: boolean;
  compactNavigatorAvailable?: boolean;
  compactNavigatorOpen?: boolean;
  onCompactNavigatorToggle?: () => void;
  compactDocumentTitle?: string;
  compactSessionActions?: CompactPlanAction[];
  compactDocumentActions?: CompactPlanAction[];
  // Mode flags (stable after mount)
  isApiMode: boolean;
  annotateMode: boolean;
  archiveMode: boolean;
  goalSetupMode: boolean;
  goalSetupCanSubmit: boolean;
  goalSetupIsSubmitting: boolean;
  goalSetupSubmitLabel: string;
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

  // Settings props
  taterMode: boolean;
  mobileSettingsOpen: boolean;
  /** This session offers the Agent TUI, so Settings shows its Position row. */
  agentTerminalAvailable: boolean;

  // Handlers — App owns all decision logic, header just calls these
  onGoalSetupExit: () => void;
  onGoalSetupSubmit: () => void;
  onFeedback: () => void;
  onApprove: () => void;
  onAnnotationPanelToggle: () => void;
  onArchiveCopy: () => void;
  onArchiveDone: () => void;
  onTaterModeChange: (enabled: boolean) => void;
  onUIPreferencesChange: (prefs: UIPreferences) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
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
  compactTouchLayout = false,
  compactNavigatorAvailable = false,
  compactNavigatorOpen = false,
  onCompactNavigatorToggle,
  compactDocumentTitle,
  compactSessionActions,
  compactDocumentActions,
  isApiMode,
  annotateMode,
  archiveMode,
  goalSetupMode,
  goalSetupCanSubmit,
  goalSetupIsSubmitting,
  goalSetupSubmitLabel,
  origin,
  isSubmitting,
  isExiting,
  isPanelOpen,
  annotationCount,
  linkedDocIsActive,
  agentName,
  showAnnotationsWarning,
  annotateDecision,
  taterMode,
  mobileSettingsOpen,
  agentTerminalAvailable,
  onGoalSetupExit,
  onGoalSetupSubmit,
  onFeedback,
  onApprove,
  onAnnotationPanelToggle,
  onArchiveCopy,
  onArchiveDone,
  onTaterModeChange,
  onUIPreferencesChange,
  onOpenSettings,
  onCloseSettings,
  onCopyAgentInstructions,
  agentInstructionsEnabled,
}) => {
  return (
    <header
      data-app-header="true"
      className={`${compactTouchLayout ? 'h-[52px] grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-1' : 'h-12 flex items-center justify-between px-2 md:px-4'} border-b border-border/50 bg-card/50 backdrop-blur-xl z-[50] ${sticky ? 'sticky top-0' : 'relative'}`}
    >
      <div className={compactTouchLayout ? 'flex items-center justify-start' : 'flex items-center gap-2'}>
        {compactTouchLayout ? (
          compactNavigatorAvailable && onCompactNavigatorToggle ? (
            <CompactPlanNavigatorTrigger
              open={compactNavigatorOpen}
              onToggle={onCompactNavigatorToggle}
            />
          ) : (
            <span className="block h-11 w-11" aria-hidden="true" />
          )
        ) : (
          <AppHeaderLogo />
        )}
      </div>

      {compactTouchLayout && (
        <div
          data-pn-compact-document-title="true"
          className="min-w-0 px-2 text-center text-sm font-medium tracking-tight text-foreground"
          title={compactDocumentTitle}
        >
          <span className="block truncate">{compactDocumentTitle || 'Plan'}</span>
        </div>
      )}

      <div className={`flex items-center gap-1 md:gap-2 ${compactTouchLayout ? 'justify-end' : ''}`}>
        {!compactTouchLayout && isApiMode && !linkedDocIsActive && archiveMode && (
          <>
            <button
              onClick={onArchiveCopy}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-muted text-foreground hover:bg-muted/80 border border-border"
              title="Copy plan content"
            >
              <span className="hidden md:inline">Copy</span>
              <svg className="w-4 h-4 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={onArchiveDone}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-success text-success-foreground hover:opacity-90"
              title="Close archive"
            >
              Done
            </button>
          </>
        )}

        {!compactTouchLayout && isApiMode && !linkedDocIsActive && goalSetupMode && (
          <>
            <ExitButton
              onClick={onGoalSetupExit}
              disabled={isExiting || goalSetupIsSubmitting}
              isLoading={isExiting}
              title="Close goal setup without submitting"
            />
            <ApproveButton
              onClick={onGoalSetupSubmit}
              disabled={!goalSetupCanSubmit || goalSetupIsSubmitting || isExiting}
              isLoading={goalSetupIsSubmitting}
              label={goalSetupSubmitLabel}
              loadingLabel="Submitting..."
              mobileLabel="Submit"
              title={goalSetupSubmitLabel}
            />
            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
          </>
        )}

        {!compactTouchLayout && isApiMode && (!linkedDocIsActive || annotateMode) && !archiveMode && !goalSetupMode && (
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
            pen, in that order. The published control carries the markup;
            the compact touch shell offers the same three actions in its
            Options menu instead (compactDocumentActions in App: Show/Hide
            tools, Interact/Annotate, Refresh from disk). */}
        {htmlSurface && (onToggleHtmlTools || onToggleHtmlAnnotate) && (
          <HtmlSurfaceControls
            compact={compactTouchLayout}
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
        {!compactTouchLayout && !goalSetupMode && (
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
        )}

        {/* Theme and Settings sit in the header rather than under Options:
            they are the controls reached most often, and a two-click menu hop
            for each was the whole reason Options existed.
            Compact touch is the exception — its header is a three-region grid
            whose trailing region is one 44px target wide, so there they stay
            rows in the Options menu (see PlanHeaderMenu). */}
        {!compactTouchLayout && (
          <>
            <ThemeModeButton />

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Settings dialog (controlled, button hidden — opened by the gear above) */}
        <div className="hidden">
          <Settings
            taterMode={taterMode}
            onTaterModeChange={onTaterModeChange}
            origin={origin}
            mode={annotateMode ? 'annotate' : 'plan'}
            onUIPreferencesChange={onUIPreferencesChange}
            externalOpen={mobileSettingsOpen}
            onExternalClose={onCloseSettings}
            agentTerminalAvailable={agentTerminalAvailable}
          />
        </div>

        <PlanHeaderMenu
          onOpenSettings={onOpenSettings}
          onCopyAgentInstructions={onCopyAgentInstructions}
          agentInstructionsEnabled={agentInstructionsEnabled}
          compactTouchLayout={compactTouchLayout}
          compactSessionActions={compactSessionActions}
          compactDocumentActions={compactDocumentActions}
        />
      </div>
    </header>
  );
});

export const CompactPlanNavigatorTrigger = ({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    id="pn-compact-plan-navigator-trigger"
    type="button"
    onClick={onToggle}
    data-pn-touch-target="true"
    data-pn-touch-target-icon="true"
    data-pn-compact-navigator-trigger="true"
    className={`flex h-11 w-11 items-center justify-center rounded-lg text-sm font-semibold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
      open
        ? 'bg-primary/15 text-primary'
        : 'text-foreground hover:bg-muted'
    }`}
    aria-label={open ? 'Close plan navigator' : 'Open plan navigator'}
    aria-expanded={open}
    aria-controls="pn-compact-plan-navigator"
    title={open ? 'Close navigator' : 'Navigate plan'}
  >
    <svg className="h-[18px] w-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h14M5 12h14M5 18h9" />
    </svg>
    <span className="sr-only">Plan navigation</span>
  </button>
);

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
