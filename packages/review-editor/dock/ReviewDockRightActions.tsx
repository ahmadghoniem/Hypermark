import React from 'react';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { useReviewStateOptional } from './ReviewStateContext';
import { REVIEW_ALL_FILES_PANEL_ID } from './reviewPanelTypes';

/**
 * Collapse/expand-all, pinned to the right of the dock tab strip (dockview's
 * `rightHeaderActionsComponent`). Stays visible while the tabs scroll.
 *
 * Diff style and the diff display options used to live here too; both moved to
 * the review header, which is the only place that carries them now.
 */
export const ReviewDockRightActions: React.FC<IDockviewHeaderActionsProps> = (props) => {
  const state = useReviewStateOptional();

  // Collapse/expand-all files — only meaningful (and only shown) when this
  // group's active panel is the All files view.
  const showCollapseAll = !!state && props.activePanel?.id === REVIEW_ALL_FILES_PANEL_ID;

  return (
    <div className="flex items-center gap-1 h-full pr-2 pl-1">
      {showCollapseAll && state && (
        <button
          type="button"
          onClick={state.onToggleAllFilesCollapsed}
          className="p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          title={state.allFilesAllCollapsed ? 'Expand all files' : 'Collapse all files'}
          aria-label={state.allFilesAllCollapsed ? 'Expand all files' : 'Collapse all files'}
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {state.allFilesAllCollapsed ? (
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
      )}
    </div>
  );
};
