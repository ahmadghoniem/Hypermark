import React from 'react';
import { type Origin } from '@/shared/agents';
import { DecisionControl, type DecisionHandler } from '@/ui/components/DecisionControl';
import { RepoIcon } from '@/ui/components/RepoIcon';
import { ThemeModeButton } from '@/ui/components/ThemeModeButton';
import { DiffOptionsButton } from '@/ui/components/DiffOptionsButton';
import { KeyboardShortcutsButton } from '@/ui/components/KeyboardShortcutsDialog';
import { configStore } from '@/ui/config';
import type { DecisionActionId, DecisionSpec } from '@/ui/utils/decisionSpec';
import type { UseSidebarReturn } from '@/ui/hooks/useSidebar';
import type { DiffFreshness } from '../hooks/useDiffFreshness';

import { AlignVerticalCenter01, Check, ChevronSelectorVertical, Clipboard, Columns02, LayoutLeft, MessageTextSquare01, Rows01 } from '@untitledui/icons';
interface ReviewHeaderProps {
  shouldShowFileTree: boolean;
  toggleNavigator: () => void;
  isNavigatorOpen: boolean;
  repoInfo: { display: string; branch?: string } | null;
  origin: Origin | null;
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
    <header className={'py-1 flex flex-col min-[480px]:flex-row items-stretch min-[480px]:items-center min-[480px]:justify-between gap-1 min-[480px]:gap-0 px-2 lg:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-chrome'}>
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
              <LayoutLeft className="size-3.5" />
            </button>
            <div className="w-px h-5 bg-border/50 mx-1 hidden lg:block" />
          </>
        )}
        {repoInfo ? (
          <div className={'min-w-0 flex flex-1 items-center gap-2 lg:gap-3 overflow-hidden'}>
            {repoInfo.branch && (
              <span
                className="text-caption font-mono text-foreground truncate"
                title={repoInfo.branch}
              >
                {repoInfo.branch}
              </span>
            )}
            <span
              className="text-caption text-muted-foreground/60 inline-flex items-center gap-1 truncate max-w-55"
              title={repoInfo.display}
            >
              <RepoIcon className="size-3 shrink-0" />
              {repoInfo.display}
            </span>
          </div>
        ) : (
          <span className={'text-caption text-muted-foreground/70'}>Review</span>
        )}
      </div>

      <div className={'min-w-0 w-full min-[480px]:w-auto flex flex-wrap min-[480px]:flex-nowrap shrink-0 items-center justify-end gap-1 lg:gap-2'}>
        {/* Split/Unified toggle + diff options moved to the dock tab strip
            (rightHeaderActionsComponent → ReviewDockRightActions). */}
        {origin ? (
          <>
            {/* Diff staleness notice — files changed since this snapshot
                was computed (agent editing mid-review). Non-blocking; the
                user refreshes when ready. */}
            {diffFreshness.isStale && !isLoadingDiff && (
              <div className="flex items-center gap-2 text-caption text-foreground px-2 py-1 bg-warning/10 rounded-sm border border-warning/25">
                <span className="hidden md:inline">Diff out of date</span>
                <span className="md:hidden">Stale</span>
                <button
                  onClick={handleRefreshStaleDiff}
                  className="font-semibold underline underline-offset-2 hover:text-muted-foreground transition-colors"
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
              <div className="flex items-center gap-2 text-caption text-foreground px-2 py-1 bg-warning/10 rounded-sm border border-warning/25">
                <span className="hidden md:inline">Baseline is behind GitHub</span>
                <span className="md:hidden">Base behind</span>
                {isFetchingBase ? (
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="inline-block size-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                    Fetching…
                  </span>
                ) : (
                  <button
                    onClick={handleFetchBase}
                    className="font-semibold underline underline-offset-2 hover:text-muted-foreground transition-colors"
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
            className="px-2 py-1 md:px-2.5 rounded-md text-caption font-semibold bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1.5"
            title="Copy feedback for LLM"
          >
            {copyFeedback === 'Feedback copied!' ? (
              <>
                <Check className="size-3.5 text-success" />
                <span className="hidden md:inline">Copied!</span>
              </>
            ) : (
              <>
                <Clipboard className="size-3.5" />
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
            <MessageTextSquare01 className="size-4" />
            {totalAnnotationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 flex items-center justify-center rounded-full bg-primary text-micro font-bold text-primary-foreground px-0.5">
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
          {allFilesAllCollapsed ? (
            <ChevronSelectorVertical className="size-3.5" />
          ) : (
            <AlignVerticalCenter01 className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => configStore.set('diffStyle', (diffStyle ?? 'split') === 'split' ? 'unified' : 'split')}
          className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={(diffStyle ?? 'split') === 'split' ? 'Split diff (switch to unified)' : 'Unified diff (switch to split)'}
          aria-label={(diffStyle ?? 'split') === 'split' ? 'Split diff (switch to unified)' : 'Unified diff (switch to split)'}
        >
          {(diffStyle ?? 'split') === 'split' ? (
            <Columns02 className="size-4" />
          ) : (
            <Rows01 className="size-4" />
          )}
        </button>

        <DiffOptionsButton />

        <ThemeModeButton />

        <KeyboardShortcutsButton mode="review" />
      </div>
    </header>
  );
};
