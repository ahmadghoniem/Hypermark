import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { CodeAnnotation } from '@hypermark/ui/types';
import type {
  AvailableBranches,
  CompareTargetConfig,
  DiffOption,
  JjEvoLogEntry,
  RecentCommit,
  SinceBaseSections,
  WorktreeInfo,
} from '@hypermark/shared/types';
import { FileTree as PierreFileTree, useFileTree, useFileTreeSelector } from '@pierre/trees/react';
import { getAncestorPaths } from '../utils/buildFileTree';
import {
  buildAnnotationCountMap,
  buildFileTreePaths,
  getKeyboardFileOrder,
  getSelectedPaths as getSelectedTreePaths,
  getVisibleFiles,
  isFileViewed,
  resolveFileTreeTarget,
  resolveFileTreeTargetFromComposedPath,
  revealFileInTree,
} from '../utils/fileTreeAdapter';
import { buildRowDecoration } from '../utils/fileTreeRowDecoration';
import { BaseBranchPicker } from './BaseBranchPicker';
import { EvoLogPicker } from './EvoLogPicker';
import { DiffTypePicker } from './DiffTypePicker';
import { WorktreePicker } from './WorktreePicker';
import { PanelViewToggle, type ReviewPanelView } from './PanelViewToggle';
import { getReviewSearchSideLabel, type ReviewSearchFileGroup, type ReviewSearchMatch } from '../utils/reviewSearch';
import type { DiffFile } from '../types';
import { OverlayScrollArea } from '@hypermark/ui/components/OverlayScrollArea';
import { CaretRight, CaretDown } from '@phosphor-icons/react';

import { SidebarActionRow, AllFilesRow } from './PanelNavRows';
import { PanelControlsRow, PanelSearchField } from './PanelChrome';

interface FileTreeProps {
  files: DiffFile[];
  activeFileIndex: number;
  onSelectFile: (index: number) => void;
  onDoubleClickFile?: (index: number) => void;
  annotations: CodeAnnotation[];
  viewedFiles: Set<string>;
  onToggleViewed?: (filePath: string) => void;
  hideViewedFiles?: boolean;
  onToggleHideViewed?: () => void;
  showViewedControls?: boolean;
  onToggleShowViewedControls?: () => void;
  enableKeyboardNav?: boolean;
  diffOptions?: DiffOption[];
  activeDiffType?: string;
  onSelectDiff?: (diffType: string) => void;
  isLoadingDiff?: boolean;
  width?: number;
  worktrees?: WorktreeInfo[];
  activeWorktreePath?: string | null;
  onSelectWorktree?: (path: string | null) => void;
  currentBranch?: string;
  /** Compare target picker — base branch for Git, bookmark/revision for jj. */
  availableBranches?: AvailableBranches;
  selectedBase?: string;
  detectedBase?: string;
  onSelectBase?: (branch: string) => void;
  compareTarget?: CompareTargetConfig;
  /** HEAD ancestry for the commit-baseline picker (git only, #709). */
  recentCommits?: RecentCommit[];
  /** Evolution log entries for the current jj change (jj-evolog mode only). */
  jjEvologs?: JjEvoLogEntry[];
  /** Default evolog commit ID to compare against (second evolog entry). */
  detectedEvoBase?: string;
  /** Read-side staged set from the server's status sidecar — display only. */
  stagedFiles: Set<string>;
  autoViewed?: boolean;
  onToggleAutoViewed?: () => void;
  onCopyRawDiff?: () => void;
  canCopyRawDiff?: boolean;
  copyRawDiffStatus?: 'idle' | 'success' | 'error';
  searchQuery?: string;
  isSearchOpen?: boolean;
  isSearchPending?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenSearch?: () => void;
  onSearchChange?: (value: string) => void;
  onSearchClear?: () => void;
  onSearchClose?: () => void;
  searchGroups?: ReviewSearchFileGroup[];
  searchMatches?: ReviewSearchMatch[];
  activeSearchMatchId?: string | null;
  onSelectSearchMatch?: (matchId: string) => void;
  onStepSearchMatch?: (direction: 1 | -1) => void;
        {onSelectAllFiles && (
          <AllFilesRow
            active={isAllFilesActive}
            onClick={onSelectAllFiles}
            additions={files.reduce((sum, file) => sum + file.additions, 0)}
            deletions={files.reduce((sum, file) => sum + file.deletions, 0)}
          />
        )}
        {panelControls}
        {searchField}
      </div>

      {/* File tree or search results */}
      <div ref={treeWrapperRef} className="flex-1 min-h-0 flex flex-col">
        {searchQuery.trim() ? (
          <OverlayScrollArea className="flex-1 min-h-0">
            <div className="px-1 py-1">
              {isSearchPending ? (
                <div className="py-6 text-center text-xs text-muted-foreground/50">Searching…</div>
              ) : searchGroups.length > 0 ? (
                searchGroups.map((group) => (
                  <SearchFileGroup
                    key={group.filePath}
                    group={group}
                    searchQuery={searchQuery}
                    activeSearchMatchId={activeSearchMatchId ?? null}
                    onSelectMatch={onSelectSearchMatch}
                  />
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground/50">No matches found</div>
              )}
            </div>
          </OverlayScrollArea>
        ) : (
          <PierreFileTree model={model} style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>
    </aside>
  );
};

// --- Search result components ---

function highlightQuery(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const regex = new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  // split with a capturing group puts matches at odd indices (1, 3, 5...)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="search-match-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export const SearchFileGroup: React.FC<{
  group: ReviewSearchFileGroup;
  searchQuery: string;
  activeSearchMatchId: string | null;
  onSelectMatch?: (matchId: string) => void;
}> = ({ group, searchQuery, activeSearchMatchId, onSelectMatch }) => {
  const [collapsed, setCollapsed] = useState(false);
  const fileName = group.filePath.split('/').pop() || group.filePath;
  const dirPath = group.filePath.includes('/') ? group.filePath.slice(0, group.filePath.lastIndexOf('/')) : '';

  return (
    <div className="mb-1">
      {/* File header */}
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors group"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <svg
          className={`w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <svg
          className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <span className="truncate text-foreground font-medium">{fileName}</span>
        {dirPath && <span className="truncate text-muted-foreground/50 text-[10px]">{dirPath}</span>}
        <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground/50 bg-muted rounded px-1.5 py-0.5">
          {group.matches.length}
        </span>
      </button>

      {/* Match rows */}
      {!collapsed && (
        <div className="ml-3 border-l border-border/30 pl-2">
          {group.matches.map((match) => (
            <SearchMatchRow
              key={match.id}
              match={match}
              searchQuery={searchQuery}
              isActive={activeSearchMatchId === match.id}
              onSelect={() => {
                onSelectMatch?.(match.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SearchMatchRow: React.FC<{
  match: ReviewSearchMatch;
  searchQuery: string;
  isActive: boolean;
  onSelect: () => void;
}> = ({ match, searchQuery, isActive, onSelect }) => {
  const sideLabel = getReviewSearchSideLabel(match.side);
  const sideColor =
    match.side === 'addition'
      ? 'text-success'
      : match.side === 'deletion'
        ? 'text-destructive'
        : 'text-muted-foreground/60';

  return (
    <button
      className={`w-full text-left px-2 py-1 rounded-sm text-xs font-mono transition-colors flex items-start gap-1.5 ${
        isActive ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
      }`}
      onClick={onSelect}
    >
      <span className="flex-shrink-0 text-muted-foreground/40 w-7 text-right tabular-nums">{match.lineNumber}</span>
      <span className={`flex-shrink-0 w-6 text-[10px] font-semibold uppercase ${sideColor}`}>{sideLabel}</span>
      <span className="truncate leading-relaxed">{highlightQuery(match.snippet, searchQuery)}</span>
    </button>
  );
};
