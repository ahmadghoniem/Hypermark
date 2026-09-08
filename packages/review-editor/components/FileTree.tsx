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
import { GitHubIcon } from '@hypermark/ui/components/GitHubIcon';
import { Paperclip } from '@phosphor-icons/react';

import { SidebarActionRow, SemanticDiffRow, CallFlowRow, AllFilesRow } from './PanelNavRows';
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
  onSelectPROverview?: () => void;
  isPROverviewActive?: boolean;
  /** PR number label (e.g. "#123") for the PR overview row; omit in non-PR reviews. */
  prOverviewNumber?: string;
  /** PR title for the PR overview row. */
  prOverviewTitle?: string;
  /** Opens the hosted PR/MR attachment gallery; omitted for local reviews. */
  onSelectPRArtifacts?: () => void;
  isPRArtifactsActive?: boolean;
  prArtifactCount?: number;
  onSelectSemanticDiff?: () => void;
  isSemanticDiffActive?: boolean;
  semanticDiffAvailable?: boolean;
  onSelectCallFlow?: () => void;
  isCallFlowActive?: boolean;
  callFlowEnabled?: boolean;
  callFlowCount?: number;
  callFlowLoading?: boolean;
  callFlowError?: boolean;
  onSelectAllFiles?: () => void;
  isAllFilesActive?: boolean;
  scrollHighlightIndex?: number;
  /** Absolute repo root for the "Copy full path" context menu item. Null/undefined hides the option (e.g. PR review mode). */
  repoRoot?: string | null;
  /** Current panel-view selection. The tree also renders as the FALLBACK for a
   * latent 'sections'/'commits' selection the session can't offer, so the
   * toggle must reflect the real selection, not assume 'tree'. */
  panelView?: ReviewPanelView;
  /** When the since-base sections view is available, renders a nav row back to it. */
  onSwitchToSections?: () => void;
  /** When the commit-history view is available, offers its toggle segment. */
  onSwitchToCommits?: () => void;
  /** Selects the tree view through the app's shared panel-view funnel. */
  onSwitchToTree?: () => void;
  /** Sections sidecar while the since-base diff is displayed as a tree —
   * powers per-row U/staged markers. */
  sinceBaseSections?: SinceBaseSections | null;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFileIndex,
  onSelectFile,
  onDoubleClickFile,
  annotations,
  viewedFiles,
  onToggleViewed,
  hideViewedFiles = false,
  onToggleHideViewed,
  showViewedControls = true,
  onToggleShowViewedControls,
  enableKeyboardNav = true,
  diffOptions,
  activeDiffType,
  onSelectDiff,
  isLoadingDiff,
  width,
  worktrees,
  activeWorktreePath,
  onSelectWorktree,
  currentBranch,
  availableBranches,
  selectedBase,
  detectedBase,
  onSelectBase,
  compareTarget,
  recentCommits,
  jjEvologs,
  detectedEvoBase,
  stagedFiles,
  autoViewed,
  onToggleAutoViewed,
  onCopyRawDiff,
  canCopyRawDiff = false,
  copyRawDiffStatus = 'idle',
  searchQuery = '',
  isSearchOpen = false,
  isSearchPending,
  searchInputRef,
  onOpenSearch,
  onSearchChange,
  onSearchClear,
  onSearchClose,
  searchGroups = [],
  searchMatches = [],
  activeSearchMatchId,
  onSelectSearchMatch,
  onStepSearchMatch,
  onSelectPROverview,
  isPROverviewActive = false,
  prOverviewNumber,
  prOverviewTitle,
  onSelectPRArtifacts,
  isPRArtifactsActive = false,
  prArtifactCount,
  onSelectSemanticDiff,
  isSemanticDiffActive = false,
  semanticDiffAvailable = false,
  onSelectCallFlow,
  isCallFlowActive = false,
  callFlowEnabled = false,
  callFlowCount,
  callFlowLoading,
  callFlowError,
  onSelectAllFiles,
  isAllFilesActive = false,
  scrollHighlightIndex,
  repoRoot,
  panelView = 'tree',
  onSwitchToSections,
  onSwitchToCommits,
  onSwitchToTree,
  sinceBaseSections,
}) => {
  const isSearchVisible = !!onSearchChange && (isSearchOpen || !!searchQuery.trim());

  // The active-file/overlay-panel forcing rule the tree has always applied:
  // All files/Semantic/Call flow/PR overview/PR artifacts own the "active"
  // slot while they're open, so the tree shows no selection of its own.
  const effectiveActiveFileIndex =
    isAllFilesActive || isSemanticDiffActive || isCallFlowActive || isPROverviewActive || isPRArtifactsActive
      ? -1
      : activeFileIndex;

  // `hideViewedFiles` is expressed as which paths the Pierre tree is even
  // given — mirroring the old renderer's rule that a fully-viewed file drops
  // out of the tree unless it's the active file (kept so the current
  // selection never vanishes out from under the user).
  const activeFilePath = files[effectiveActiveFileIndex]?.path;
  const visibleFiles = useMemo(
    () => getVisibleFiles(files, viewedFiles, hideViewedFiles, activeFilePath),
    [files, viewedFiles, hideViewedFiles, activeFilePath],
  );
  const treePaths = useMemo(() => buildFileTreePaths(visibleFiles), [visibleFiles]);

  // Keyboard navigation order is derived from the same visible subset that
  // feeds treePaths, then mapped back to indices into the full `files` array
  // so j/k/Home/End never land on a hidden file while onSelectFile keeps its
  // canonical index contract.
  const visualOrder = useMemo(
    () => getKeyboardFileOrder(files, visibleFiles),
    [files, visibleFiles],
  );

  // Keyboard navigation: j/k or arrow keys
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enableKeyboardNav || e.defaultPrevented) return;

      // Don't interfere with input fields. composedPath()[0] pierces shadow DOM
      // (same guard as AllFilesCodeView): window-level e.target retargets to the
      // shadow HOST, so keystrokes in the Pierre editor's contenteditable (edit
      // sessions) would otherwise read as non-editable and Home/End/arrows would
      // switch files mid-edit.
      const origin = (e.composedPath?.()[0] ?? e.target) as HTMLElement | null;
      if (origin && (origin.tagName === 'INPUT' || origin.tagName === 'TEXTAREA' || origin.isContentEditable)) {
        return;
      }

      // Yield keyboard nav when a floating overlay owns the focus — Base UI
      // Menu / Popover / Dialog handle arrow keys themselves, and the old
      // native <select> used to absorb these natively. Base UI popups carry
      // ARIA roles directly (Menu.Popup role="menu", Popover.Popup
      // role="dialog"), so the role selectors catch the base picker and
      // worktree picker as well as dialogs/menus.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('[role="menu"], [role="dialog"], [role="listbox"]')) {
        return;
      }

      const visualPos = visualOrder.indexOf(activeFileIndex);

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (visualPos < visualOrder.length - 1) {
          onSelectFile(visualOrder[visualPos + 1]);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (visualPos > 0) {
          onSelectFile(visualOrder[visualPos - 1]);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        onSelectFile(visualOrder[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        onSelectFile(visualOrder[visualOrder.length - 1]);
      }
    },
    [enableKeyboardNav, activeFileIndex, visualOrder, onSelectFile],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Double-click activation (spec 04 step 4): @pierre/trees ships no
  // double-click hook. We listen for `dblclick` on the element wrapping the
  // tree, walk `event.composedPath()` across the shadow DOM boundary for the
  // first `data-item-path`, and resolve to canonical identity.
  //
  // Read through a ref for the same reason `onSelectionChange` is: `useFileTree`
  // reads its options ONCE at construction, so all adapter callbacks must read
  // live files/onDoubleClickFile through a ref to avoid stale closures.
  const latestDoubleClickRef = useRef({ files, onDoubleClickFile });
  latestDoubleClickRef.current = { files, onDoubleClickFile };

  const treeWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = treeWrapperRef.current;
    if (!el) return;
    const handleDblClick = (e: MouseEvent) => {
      const { files: currentFiles, onDoubleClickFile: currentOnDoubleClickFile } = latestDoubleClickRef.current;
      if (!currentOnDoubleClickFile) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const target = resolveFileTreeTargetFromComposedPath(currentFiles, path);
      if (target) {
        currentOnDoubleClickFile(target.fileIndex);
      }
    };
    el.addEventListener('dblclick', handleDblClick);
    return () => el.removeEventListener('dblclick', handleDblClick);
  }, []);

  // Stable across renders — `useFileTree` only reads its options once, at
  // construction, so the selection-change callback must resolve against the
  // LATEST files/onSelectFile via a ref rather than the closure it was built
  // with. Every reported path is resolved through the step-2 adapter (path OR
  // oldPath, normalized to the canonical `file.path`) — never dispatched raw.
  const latestSelectionRef = useRef({ files, onSelectFile });
  latestSelectionRef.current = { files, onSelectFile };
  const handleModelSelectionChange = useCallback((selectedPaths: readonly string[]) => {
    const [path] = selectedPaths;
    if (!path) return;
    const { files: currentFiles, onSelectFile: currentOnSelectFile } = latestSelectionRef.current;
    const target = resolveFileTreeTarget(currentFiles, path);
    if (target) currentOnSelectFile(target.fileIndex);
  }, []);

  // Per-row metadata. spec/04-file-tree.md:67-68 requires viewed state,
  // annotation counts, and change counts survive the tree replacement; the
  // library gives one declarative decoration slot per row, so
  // `buildRowDecoration` folds the old row's whole metadata column into it.
  //
  // Read through a ref for the same reason `onSelectionChange` is: `useFileTree`
  // reads its options ONCE at construction, so a closure captured here would
  // render decorations against a stale `files` array after a diff switch.
  const annotationCountMap = useMemo(() => buildAnnotationCountMap(annotations), [annotations]);
  const latestDecorationRef = useRef({
    files,
    viewedFiles,
    annotationCountMap,
    stagedFiles,
    sinceBaseSections,
  });
  latestDecorationRef.current = { files, viewedFiles, annotationCountMap, stagedFiles, sinceBaseSections };

  const handleRenderRowDecoration = useCallback(
    ({ row }: { row: { kind: 'directory' | 'file'; path: string } }) => {
      if (row.kind !== 'file') return null;
      const current = latestDecorationRef.current;
      // Resolve through the adapter so a decoration is never keyed by anything
      // but canonical identity.
      const target = resolveFileTreeTarget(current.files, row.path);
      if (!target) return null;
      return buildRowDecoration({
        file: target.file,
        isViewed: isFileViewed(current.viewedFiles, target.file),
        annotationCount: current.annotationCountMap.get(target.canonicalPath) ?? 0,
        isStaged: current.stagedFiles.has(target.canonicalPath),
        sectionEntry: current.sinceBaseSections?.files[target.canonicalPath],
      });
    },
    [],
  );

  // The fixed tree contract (spec 04 step 3) — applied exactly, density
  // deliberately omitted. `gitStatus` is likewise never passed: spec 02 removed
  // the per-file Git status UI and spec 04 forbids reintroducing it as a
  // substitute. `paths` seeds construction only; `resetPaths` below keeps the
  // live model in sync as `files`/hide-viewed change.
  const { model } = useFileTree({
    paths: treePaths,
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
    search: true,
    fileTreeSearchMode: 'hide-non-matches',
    icons: 'complete',
    onSelectionChange: handleModelSelectionChange,
    renderRowDecoration: handleRenderRowDecoration,
  });

  const didMountTreeRef = useRef(false);
  useEffect(() => {
    if (!didMountTreeRef.current) {
      didMountTreeRef.current = true;
      return;
    }
    // Re-applies the construction-time options (including initialExpansion:
    // 'open') against the new path set — a fresh tree opens folders again on
    // every diff/worktree switch, same as the old expand-on-tree-change rule.
    model.resetPaths(treePaths);
  }, [model, treePaths]);

  // Feeds the existing content-search query into the tree's own
  // hide-non-matches filtering. This is independent of the line-level search
  // results list below — it drives whichever paths the Pierre tree itself
  // will show if/when its browsing view is visible.
  useEffect(() => {
    model.setSearch(searchQuery.trim() ? searchQuery : null);
  }, [model, searchQuery]);

  // Ancestor-expansion-on-reveal is a side effect of activeFileIndex
  // changing, not something the search hook does — preserved here exactly as
  // before, just driven through the live Pierre model instead of local
  // expandedFolders state. Routes through the step-2 adapter's
  // revealFileInTree, which expands ancestors, selects, focuses, and scrolls.
  // Re-runs on treePaths changes so reveal survives a path-set change that
  // leaves files unchanged (e.g. toggling hideViewedFiles or marking a file viewed).
  useEffect(() => {
    const [identifier] = getSelectedTreePaths(files, effectiveActiveFileIndex);
    if (identifier) {
      revealFileInTree(model, files, identifier);
    } else {
      for (const selectedPath of model.getSelectedPaths()) {
        model.getItem(selectedPath)?.deselect();
      }
    }
  }, [model, files, effectiveActiveFileIndex, treePaths]);

  // Real canonical directory paths (every ancestor of every file), not the
  // collapsed display paths buildFileTree produces — the Pierre model's
  // directory nodes are keyed by the former.
  const allRealFolderPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const file of files) {
      for (const ancestor of getAncestorPaths(file.path)) paths.add(ancestor);
    }
    return Array.from(paths);
  }, [files]);

  const areAllFoldersExpanded = useFileTreeSelector(model, (currentModel) => {
    if (allRealFolderPaths.length === 0) return false;
    return allRealFolderPaths.every((path) => {
      const item = currentModel.getItem(path);
      return item != null && 'isExpanded' in item && item.isExpanded();
    });
  });

  const handleToggleAllFolders = useCallback(() => {
    const shouldExpand = !areAllFoldersExpanded;
    for (const path of allRealFolderPaths) {
      const item = model.getItem(path);
      if (item != null && 'expand' in item) {
        if (shouldExpand) item.expand();
        else item.collapse();
      }
    }
  }, [model, allRealFolderPaths, areAllFoldersExpanded]);

  const panelControls = (
    <PanelControlsRow
      stagedCount={stagedFiles.size}
      isSearchVisible={isSearchVisible}
      onOpenSearch={onOpenSearch}
      onToggleAllFolders={handleToggleAllFolders}
      areAllFoldersExpanded={areAllFoldersExpanded}
      collapseDisabled={allRealFolderPaths.length === 0}
      onToggleHideViewed={onToggleHideViewed}
      hideViewedFiles={hideViewedFiles}
      viewedCount={viewedFiles.size}
      totalCount={files.length}
      onCopyRawDiff={onCopyRawDiff}
      canCopyRawDiff={canCopyRawDiff}
      copyRawDiffStatus={copyRawDiffStatus}
      showViewedControls={showViewedControls}
      onToggleShowViewedControls={onToggleShowViewedControls}
      autoViewed={autoViewed}
      onToggleAutoViewed={onToggleAutoViewed}
    />
  );

  const searchField = isSearchVisible ? (
    <PanelSearchField
      inputRef={searchInputRef}
      query={searchQuery}
      resultCount={searchMatches.length}
      isPending={isSearchPending}
      onChange={(value) => onSearchChange?.(value)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          return;
        }
        if (event.key === 'Enter' && searchMatches.length > 0 && !isSearchPending) {
          event.preventDefault();
          onStepSearchMatch?.(event.shiftKey ? -1 : 1);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (searchQuery) {
            onSearchClear?.();
          } else {
            onSearchClose?.();
            event.currentTarget.blur();
          }
        }
      }}
      onClear={onSearchClear}
      onClose={onSearchClose}
    />
  ) : null;

  return (
    <aside
      className="border-r border-border/50 bg-card/30 flex flex-col flex-shrink-0 overflow-hidden"
      style={{ width: width ?? 256 }}
    >
      {/* Header — the view toggle owns the entire top row (full width). The
          controls that used to share it render as PanelControlsRow above the
          tree, below the All files entry. */}
      <div className="px-3 flex items-center border-b border-border/50" style={{ height: 'var(--panel-header-h)' }}>
        {searchQuery.trim() ? (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Results</span>
        ) : onSwitchToSections || onSwitchToCommits ? (
          <PanelViewToggle
            view={panelView}
            showSections={!!onSwitchToSections}
            showCommits={!!onSwitchToCommits}
            onSelect={(view) => {
              if (view === 'sections') onSwitchToSections?.();
              else if (view === 'commits') onSwitchToCommits?.();
              else onSwitchToTree?.();
            }}
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</span>
        )}
      </div>

      {/* Worktree + diff selectors — combined row when both present */}
      {((worktrees && worktrees.length > 0 && onSelectWorktree) ||
        (diffOptions && diffOptions.length > 0 && onSelectDiff)) && (
        <div className="px-2 py-1.5 border-b border-border/30 flex gap-2">
          {worktrees && worktrees.length > 0 && onSelectWorktree && (
            <div className="flex-1 min-w-0">
              <WorktreePicker
                worktrees={worktrees}
                activeWorktreePath={activeWorktreePath ?? null}
                currentBranch={currentBranch}
                onSelect={onSelectWorktree}
                disabled={isLoadingDiff}
              />
            </div>
          )}
          {diffOptions && diffOptions.length > 0 && onSelectDiff && (
            <div className="flex-1 min-w-0">
              <DiffTypePicker
                options={diffOptions}
                activeDiffType={activeDiffType || 'uncommitted'}
                onSelect={onSelectDiff}
                isLoading={isLoadingDiff}
                hasBasePicker={!!onSelectBase && !!availableBranches}
              />
            </div>
          )}
        </div>
      )}

      {/* Evolog picker — only shown when jj-evolog diff type is active */}
      {activeDiffType === 'jj-evolog' &&
        onSelectBase &&
        selectedBase &&
        jjEvologs &&
        jjEvologs.length >= 2 &&
        detectedEvoBase && (
          <div className="px-2 py-1.5 border-b border-border/30 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
              from evolution
            </span>
            <div className="flex-1 min-w-0">
              <EvoLogPicker
                entries={jjEvologs}
                selectedCommitId={selectedBase}
                detectedCommitId={detectedEvoBase}
                onSelect={onSelectBase}
                disabled={isLoadingDiff}
              />
            </div>
          </div>
        )}

      {/* Compare target picker — only relevant for base-dependent diff types (not evolog) */}
      {activeDiffType !== 'jj-evolog' &&
        onSelectBase &&
        selectedBase &&
        detectedBase &&
        availableBranches &&
        activeDiffType &&
        compareTarget?.diffTypes.includes(activeDiffType) && (
          <div className="px-2 py-1.5 border-b border-border/30 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
              {compareTarget.picker.rowLabel}
            </span>
            <div className="flex-1 min-w-0">
              <BaseBranchPicker
                availableBranches={availableBranches}
                selectedBase={selectedBase}
                detectedBase={detectedBase}
                onSelectBase={onSelectBase}
                disabled={isLoadingDiff}
                copy={compareTarget.picker}
                recentCommits={recentCommits}
              />
            </div>
          </div>
        )}

      {/* Nav rows, panel controls, and the search field keep their
          established position directly below the "All files" row — above the
          file tree's own scroll/virtualization region, which it owns itself
          once mounted (see below). */}
      <div className="px-1 py-1 flex-shrink-0">
        {prOverviewNumber && prOverviewTitle && onSelectPROverview && (
          <SidebarActionRow
            active={isPROverviewActive}
            onClick={onSelectPROverview}
            title={`${prOverviewNumber} · ${prOverviewTitle}`}
          >
            <GitHubIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-mono flex-shrink-0">{prOverviewNumber}</span>
            <span className="truncate text-muted-foreground/80">{prOverviewTitle}</span>
          </SidebarActionRow>
        )}
        {onSelectPRArtifacts && prArtifactCount !== undefined && (
          <SidebarActionRow
            active={isPRArtifactsActive}
            onClick={onSelectPRArtifacts}
            title="View attachments shared in this pull request or merge request"
          >
            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Artifacts</span>
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
              {prArtifactCount}
            </span>
          </SidebarActionRow>
        )}
        {callFlowEnabled && onSelectCallFlow && (
          <CallFlowRow
            active={isCallFlowActive}
            onClick={onSelectCallFlow}
            count={callFlowCount}
            loading={callFlowLoading}
            error={callFlowError}
          />
        )}
        {semanticDiffAvailable && onSelectSemanticDiff && (
          <SemanticDiffRow active={isSemanticDiffActive} onClick={onSelectSemanticDiff} />
        )}
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
