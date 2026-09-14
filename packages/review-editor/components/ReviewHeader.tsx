import React from 'react';
import { type Origin } from '@hypermark/shared/agents';
import { DecisionControl, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import { RepoIcon } from '@hypermark/ui/components/RepoIcon';
import { ThemeModeButton } from '@hypermark/ui/components/ThemeModeButton';
import { DiffOptionsButton } from '@hypermark/ui/components/DiffOptionsButton';
import { KeyboardShortcutsButton } from '@hypermark/ui/components/KeyboardShortcutsDialog';
import { configStore } from '@hypermark/ui/config';
import type { DecisionActionId, DecisionSpec } from '@hypermark/ui/utils/decisionSpec';
import type { UseSidebarReturn } from '@hypermark/ui/hooks/useSidebar';
import { Tree } from '@phosphor-icons/react';
import type { DiffFreshness } from '../hooks/useDiffFreshness';
import type { DiffFile } from '../types';

interface ReviewHeaderProps {
  shouldShowFileTree: boolean;
  toggleNavigator: () => void;
  isNavigatorOpen: boolean;
  repoInfo: { display: string; branch?: string } | null;
  origin: Origin | null;
  reviewMode: string | null;
  diffError: string | null;
  files: DiffFile[];
  diffFreshness: DiffFreshness;
  isLoadingDiff: boolean;
  handleRefreshStaleDiff: () => void;
  baseBehindRemote: boolean;
  isFetchingBase: boolean;
  handleFetchBase: () => void | Promise<void>;
  decision: {
    spec: DecisionSpec;
    handlers: Record<DecisionActionId, DecisionHandler>;
  };
  busyWithDecision: boolean;
  isSendingFeedback: boolean;
  isApproving: boolean;
  handleCopyFeedback: () => void | Promise<void>;
  copyFeedback: string | null;
  reviewSidebar: UseSidebarReturn<'annotations'>;
  totalAnnotationCount: number;
  onToggleAllFilesCollapsed: () => void;
  allFilesAllCollapsed: boolean;
  diffStyle: 'split' | 'unified';
}

export const ReviewHeader: React.FC<ReviewHeaderProps> = ({
  shouldShowFileTree,
  toggleNavigator,
  isNavigatorOpen,
  repoInfo,
  origin,
  reviewMode,
  diffError,
  files,
  diffFreshness,
  isLoadingDiff,
  handleRefreshStaleDiff,
  baseBehindRemote,
  isFetchingBase,
  handleFetchBase,
  decision,
  busyWithDecision,
  isSendingFeedback,
  isApproving,
  handleCopyFeedback,
  copyFeedback,
  reviewSidebar,
  totalAnnotationCount,
  onToggleAllFilesCollapsed,
  allFilesAllCollapsed,
  diffStyle,
}) => {
  return (
    <header className={'py-1 flex flex-col min-[480px]:flex-row items-stretch min-[480px]:items-center min-[480px]:justify-between gap-1 min-[480px]:gap-0 px-2 lg:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-50'}>
      <div className={'min-w-0 flex flex-1 items-center gap-2 lg:gap-3'}>
        {shouldShowFileTree && (
          <>
            <button
              onClick={toggleNavigator}
              className={`size-7 flex shrink-0 items-center justify-center rounded-md transition-all focus-visible:outline-none ${
                isNavigatorOpen
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={isNavigatorOpen ? 'Close review navigation' : 'Open review navigation'}
              aria-label={isNavigatorOpen ? 'Close review navigation' : 'Open review navigation'}
              aria-expanded={isNavigatorOpen}
            >
              <Tree className="size-3.5" />
            </button>
            <div className="w-px h-5 bg-border/50 mx-1 hidden lg:block" />
          </>
        )}
        {repoInfo ? (
          <div className={'min-w-0 flex flex-1 items-center gap-2 lg:gap-3 overflow-hidden'}>
            {repoInfo.branch && (
              <span
                className="text-xs font-mono text-foreground truncate"
                title={repoInfo.branch}
              >
                {repoInfo.branch}
              </span>
            )}
            <span
              className="text-xs text-muted-foreground/60 inline-flex items-center gap-1 truncate max-w-55"
              title={repoInfo.display}
            >
              <RepoIcon className="size-3 shrink-0" />
              {repoInfo.display}
            </span>
          </div>
        ) : (
          <span className={'text-xs text-muted-foreground/70'}>Review</span>
        )}
      </div>

      <div className={'min-w-0 w-full min-[480px]:w-auto flex flex-wrap min-[480px]:flex-nowrap shrink-0 items-center justify-end gap-1 lg:gap-2'}>
        {/* Split/Unified toggle + diff options moved to the dock tab strip
            (rightHeaderActionsComponent → ReviewDockRightActions). */}
        {origin ? (
          <>
            {reviewMode === 'workspace' && diffError && (
              <div
                className="text-xs text-foreground px-2 py-1 bg-warning/10 rounded border border-warning/25 max-w-60 truncate"
                title={diffError}
              >
                {files.length > 0 ? 'Some workspace changes could not be loaded' : 'Workspace changes could not be loaded'}
              </div>
            )}

            {/* Diff staleness notice — files changed since this snapshot
                was computed (agent editing mid-review). Non-blocking; the
                user refreshes when ready. */}
            {diffFreshness.isStale && !isLoadingDiff && (
              <div className="flex items-center gap-2 text-xs text-foreground px-2 py-1 bg-warning/10 rounded border border-warning/25">
                <span className="hidden md:inline">Diff out of date</span>
                <span className="md:hidden">Stale</span>
                <button
                  onClick={handleRefreshStaleDiff}
                  className="font-medium underline underline-offset-2 hover:text-muted-foreground transition-colors"
                  title="Re-run the diff with the current settings"
                >
                  Refresh
                </button>
                <button
                  onClick={diffFreshness.dismiss}
                  className="text-muted-foreground hover:text-foreground transition-colors leading-none"
                  title="Dismiss"
                  aria-label="Dismiss stale diff notice"
                >
                  ×
                </button>
              </div>
            )}

            {/* Baseline staleness — origin/<default> is behind the actual
                remote, so the "since main" comparison is against stale
                GitHub state. Fetch catches the tracking ref up and
                recomputes the diff in place. */}
            {baseBehindRemote && !isLoadingDiff && (
              <div className="flex items-center gap-2 text-xs text-foreground px-2 py-1 bg-warning/10 rounded border border-warning/25">
                <span className="hidden md:inline">Baseline is behind GitHub</span>
                <span className="md:hidden">Base behind</span>
                {isFetchingBase ? (
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="inline-block size-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                    Fetching…
                  </span>
                ) : (
                  <button
                    onClick={handleFetchBase}
                    className="font-medium underline underline-offset-2 hover:text-muted-foreground transition-colors"
                    title="git fetch the default branch and recompute the diff"
                  >
                    Fetch
                  </button>
                )}
              </div>
            )}

              <DecisionControl
                spec={decision.spec}
                handlers={decision.handlers}
                busy={busyWithDecision}
                isLoading={isSendingFeedback || isApproving}
                labelBreakpoint="lg"
              />
          </>
        ) : (
          <button
            onClick={handleCopyFeedback}
            className="px-2 py-1 md:px-2.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1.5"
            title="Copy feedback for LLM"
          >
            {copyFeedback === 'Feedback copied!' ? (
              <>
                <svg className="size-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden md:inline">Copied!</span>
              </>
            ) : (
              <>
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden md:inline">Copy Feedback</span>
              </>
            )}
          </button>
        )}

        <div className="w-px h-5 bg-border/50 mx-1 hidden lg:block" />

        {/* Sidebar tab toggles */}
                      <button
            onClick={() => reviewSidebar.toggleTab('annotations')}
            className={`relative p-1.5 rounded-md transition-all ${
              reviewSidebar.isOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title="Annotations"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {totalAnnotationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 flex items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground px-0.5">
                {totalAnnotationCount > 99 ? '99+' : totalAnnotationCount}
              </span>
            )}
          </button>

        <div className="w-px h-5 bg-border/50 mx-1 hidden lg:block" />
        <button
          type="button"
          onClick={onToggleAllFilesCollapsed}
          className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={allFilesAllCollapsed ? 'Expand all files' : 'Collapse all files'}
          aria-label={allFilesAllCollapsed ? 'Expand all files' : 'Collapse all files'}
        >
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {allFilesAllCollapsed ? (
              <>
                <path d="M7 9l5-5 5 5" />
                <path d="M7 15l5 5 5-5" />
              </>
            ) : (
              <>
                <path d="M7 4l5 5 5-5" />
                <path d="M7 20l5-5 5 5" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          onClick={() => configStore.set('diffStyle', (diffStyle ?? 'split') === 'split' ? 'unified' : 'split')}
          className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={(diffStyle ?? 'split') === 'split' ? 'Split diff (switch to unified)' : 'Unified diff (switch to split)'}
          aria-label={(diffStyle ?? 'split') === 'split' ? 'Split diff (switch to unified)' : 'Unified diff (switch to split)'}
        >
          {(diffStyle ?? 'split') === 'split' ? (
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M12 4v16" />
            </svg>
          ) : (
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M7 9h10M7 15h10" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <DiffOptionsButton />

        <ThemeModeButton />

        <KeyboardShortcutsButton mode="review" />
      </div>
    </header>
  );
};
