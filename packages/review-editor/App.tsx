// Eager renderer registration (side-effect imports, evaluated before every
// other module below). These keep Hypermark's first paint and identity
// minting byte-identical now that @hypermark/ui loads KaTeX and the username
// dictionary lazily for hosts: math is typeset on the first commit and names
// come from the full dictionary. Guarded by tests/entry-assets.test.ts; do not
// drop or reorder either line.
import '@hypermark/ui/utils/math-eager';
import '@hypermark/ui/utils/identity-tater';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { type Origin, getAgentName } from '@hypermark/shared/agents';
import { ThemeProvider, useTheme } from '@hypermark/ui/components/ThemeProvider';
import { TooltipProvider } from '@hypermark/ui/components/Tooltip';
import { ConfirmDialog } from '@hypermark/ui/components/ConfirmDialog';
import { buildDecisionSpec, type DecisionActionId, type DecisionMenuItem } from '@hypermark/ui/utils/decisionSpec';
import { DecisionControl, DecisionNoteDialog, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import {
  buildReviewApprovalBody,
  createGeneralReviewComment,
  readApprovalNotesAdvert,
  resolveReviewDecisionAction,
} from './reviewDecision';
import { CompletionOverlay } from '@hypermark/ui/components/CompletionOverlay';
import { RepoIcon } from '@hypermark/ui/components/RepoIcon';
import { configStore, useConfigValue, setReviewPanelView } from '@hypermark/ui/config';
import { CodeAnnotation, CodeAnnotationType, SelectedLineRange, TokenAnnotationMeta, type ImageAttachment } from '@hypermark/ui/types';
import { useResizablePanel } from '@hypermark/ui/hooks/useResizablePanel';
import { useCodeAnnotationDraft } from '@hypermark/ui/hooks/useCodeAnnotationDraft';
import { useSessionEndedStream } from '@hypermark/ui/hooks/useSessionEndedStream';
import { generateId } from './utils/generateId';
import { toast, Toaster } from 'sonner';
import {
  shouldHandleReviewSearchShortcut,
  isTypingTarget,
  useReviewSearch,
  type ReviewSearchMatch,
} from './hooks/useReviewSearch';
import { useExternalAnnotations } from '@hypermark/ui/hooks/useExternalAnnotations';
import { useUndoHistory } from '@hypermark/ui/hooks/useUndoHistory';
import {
  getMatchingShortcutBindingIndex,
  matchesShortcutBinding,
  reviewChromeShortcuts,
  useHistoryShortcuts,
} from '@hypermark/ui/shortcuts';

/**
 * These handlers keep their own `keydown` effects — their guards (search
 * focus, compact navigator state, an Escape ladder) are too situational for a
 * scope `when` — but the KEY each one answers to is read from the registry, so
 * `reviewChrome.shortcuts.ts` is the single place a review chrome binding is
 * written down, for the help panel and the handler alike.
 */
const CHROME = reviewChromeShortcuts.shortcuts;
const matchesChrome = (event: KeyboardEvent, bindings: string[]): boolean =>
  getMatchingShortcutBindingIndex(event, bindings) !== -1;
import {
  applyCollectionMutations,
  hasActiveHistoryOverlay,
  isHumanHistoryMutation,
  isNativeHistoryOwner,
  type CollectionMutation,
  type HistoryDirection,
} from '@hypermark/ui/utils/undoHistory';
import { ResizeHandle } from '@hypermark/ui/components/ResizeHandle';
import { IconContext, Tree } from '@phosphor-icons/react';
import { ThemeModeButton } from '@hypermark/ui/components/ThemeModeButton';
import { DiffOptionsButton } from '@hypermark/ui/components/DiffOptionsButton';
import { KeyboardShortcutsButton } from '@hypermark/ui/components/KeyboardShortcutsDialog';
import { ReviewSidebar } from './components/ReviewSidebar';
import { useSidebar } from '@hypermark/ui/hooks/useSidebar';
import { useViewportEnvironment } from '@hypermark/ui/hooks/useViewportEnvironment';
import { FileTree } from './components/FileTree';
import { useDiffFreshness } from './hooks/useDiffFreshness';
import { useAnnotationFactory } from './hooks/useAnnotationFactory';
import { DEMO_DIFF } from './demoData';
import { exportReviewFeedback, commitShaFromMode } from './utils/exportFeedback';
import { parseDiffToFiles } from './utils/diffParser';
import { AllFilesCodeView } from './components/AllFilesCodeView';
import { CommitDescriptionHeader } from './components/CommitDescriptionHeader';
import type { DiffFile, AnnotationScrollTarget, LineAnnotationComposeRequest } from './types';
import type { DiffOption, GitContext, SinceBaseSections, CommitDiffInfo } from '@hypermark/shared/types';
import { SectionsPanel } from './components/SectionsPanel';
import { CommitsPanel } from './components/CommitsPanel';
import { useCommitsView } from './hooks/useCommitsView';
import { initializeReviewSetup } from './utils/reviewSetup';
import { resolvePanelView } from './utils/resolvePanelView';
import { isCommitDiffType, resolveCommitExitDiff, type CommitViewRestoreTarget } from './utils/commitViewRestore';
import { ExternalLineAnnotationComposer } from './components/ExternalLineAnnotationComposer';
import { copyTextToClipboard } from '@hypermark/ui/utils/clipboard';

interface DiffData {
  files: DiffFile[];
  rawPatch: string;
  gitRef: string;
  origin?: Origin;
  diffType?: string;
  gitContext?: GitContext;
  diffOptions?: DiffOption[];
}

// When the since-base sections sidecar is present, order the master file list
// the way the sections panel presents it (committed → staged changes →
// unstaged changes → untracked, stable within groups). Every consumer — the
// sections panel, the all-files view, file navigation — then shares one
// top-down order instead of raw patch order.
//
// INVARIANT: this reads the sidecar's `staged` flag, so it is only meaningful
// at sidecar-fresh moments (initial load, diff switch, PR response). The file
// order deliberately stays stable until the next refresh.
function orderFilesBySections(files: DiffFile[], sections?: SinceBaseSections | null): DiffFile[] {
  if (!sections) return files;
  const rank = (file: DiffFile): number => {
    const entry = sections.files[file.path];
    const group = entry?.group ?? 'committed';
    if (group === 'committed') return 0;
    if (group === 'changes') return entry?.staged ? 1 : 2;
    return 3;
  };
  return files
    .map((file, index) => ({ file, index }))
    .sort((a, b) => rank(a.file) - rank(b.file) || a.index - b.index)
    .map((entry) => entry.file);
}

/** Hint shown following the cursor while hovering a sidebar/panel resize handle. */
const RESIZE_HANDLE_TOOLTIP = 'Click to close · Drag to resize';

type ReviewHistoryAction = {
  kind: 'code';
  mutations: readonly CollectionMutation<CodeAnnotation>[];
  beforeSelection: string | null;
  afterSelection: string | null;
};

const reviewItemId = <T extends { id: string }>(item: T): string => item.id;

interface ReviewNavigatorContainerProps {
  onClose: () => void;
  context?: React.ReactNode;
  resizeHandle: React.ReactNode;
  children: React.ReactNode;
}

function ReviewNavigatorContainer({
  onClose,
  context,
  resizeHandle,
  children,
}: ReviewNavigatorContainerProps) {
  return (
    <div className="contents group/sidebar">
      {children}
      {resizeHandle}
    </div>
  );
}

const ReviewAppInner: React.FC = () => {
  useViewportEnvironment();
  const { resolvedMode } = useTheme();
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [annotations, setAnnotations] = useState<CodeAnnotation[]>([]);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const selectedAnnotationIdRef = useRef(selectedAnnotationId);
  selectedAnnotationIdRef.current = selectedAnnotationId;
  // Sidebar-initiated "scroll to this comment" signal. The token bumps on every
  // sidebar click so re-selecting the same comment re-navigates. Selecting a
  // comment in the diff sets selectedAnnotationId but NOT this — so it never
  // moves the viewport.
  const [scrollTargetAnnotation, setScrollTargetAnnotation] = useState<AnnotationScrollTarget | null>(null);
  const isAllFilesActive = true;
  // All-files collapse-all: the view registers its toggle here; the header
  // button invokes it and reflects the flag.
  const allFilesCollapseToggleRef = useRef<(() => void) | null>(null);
  const [allFilesAllCollapsed, setAllFilesAllCollapsed] = useState(false);
  const registerAllFilesCollapseToggle = useCallback((toggle: (() => void) | null) => {
    allFilesCollapseToggleRef.current = toggle;
  }, []);
  const onToggleAllFilesCollapsed = useCallback(() => {
    allFilesCollapseToggleRef.current?.();
  }, []);
  const apiModeRef = useRef(false);
  const [fileScrollTarget, setFileScrollTarget] = useState<{ filePath: string; token: number } | null>(null);
  const fileScrollTokenRef = useRef(0);
  const [allFilesVisibleFile, setAllFilesVisibleFile] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<SelectedLineRange | null>(null);
  const [lineAnnotationComposeRequest, setLineAnnotationComposeRequest] =
    useState<LineAnnotationComposeRequest | null>(null);
  const nextLineAnnotationComposeRequestId = useRef(0);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [showNoAnnotationsDialog, setShowNoAnnotationsDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const diffStyle = useConfigValue('diffStyle');
  const diffOverflow = useConfigValue('diffOverflow');
  const diffIndicators = useConfigValue('diffIndicators');
  const diffLineDiffType = useConfigValue('diffLineDiffType');
  const diffShowLineNumbers = useConfigValue('diffShowLineNumbers');
  const diffShowBackground = useConfigValue('diffShowBackground');
  const diffHideWhitespace = useConfigValue('diffHideWhitespace');
  const diffExpandUnchanged = useConfigValue('diffExpandUnchanged');
  const diffFontFamily = useConfigValue('diffFontFamily');
  const diffFontSize = useConfigValue('diffFontSize');
  const diffTabSize = useConfigValue('diffTabSize');
  // Global plan-look preference. Code review can resolve this shared first-use
  // choice even though the visual result applies to plan/document surfaces.

  // Apply custom diff font and override --font-mono for surrounding review elements
  useEffect(() => {
    if (diffFontFamily) {
      document.documentElement.style.setProperty('--diff-font-override', `'${diffFontFamily}', monospace`);
    } else {
      document.documentElement.style.removeProperty('--diff-font-override');
    }
    if (diffFontSize) {
      document.documentElement.style.setProperty('--diff-font-size-override', diffFontSize);
    } else {
      document.documentElement.style.removeProperty('--diff-font-size-override');
    }
    document.documentElement.style.setProperty('--diffs-tab-size', String(diffTabSize));
  }, [diffFontFamily, diffFontSize, diffTabSize]);

  const reviewSidebar = useSidebar<'annotations'>(false, 'annotations');
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);
  const isNavigatorOpen = isFileTreeOpen;
  const toggleNavigator = useCallback(() => {
    setIsFileTreeOpen((isOpen) => !isOpen);
  }, []);
  // Guided Review screen takeover — file tree + center dock hidden (dock stays
  // mounted, just CSS-hidden; see the dock wrapper below), right sidebar untouched.

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [copyRawDiffStatus, setCopyRawDiffStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // Generated-files sidecar (#1317): repo-relative paths marked
  // `linguist-generated` in `.gitattributes`. Their diffs seed collapsed on
  // the all-files surface (GitHub-style) and their headers carry a
  // "generated" tag. Presentation-only — the diff data is never filtered.
  const [generatedFiles, setGeneratedFiles] = useState<Set<string>>(new Set());
  // Generated files the user explicitly expanded — session-local so an
  // expansion survives re-renders, dock panel remounts, and identity
  // re-seeds until the page reloads.
  const [expandedGeneratedFiles, setExpandedGeneratedFiles] = useState<Set<string>>(new Set());
  const handleGeneratedFileCollapsedChange = useCallback((filePath: string, collapsed: boolean) => {
    setExpandedGeneratedFiles(prev => {
      const expanded = !collapsed;
      if (prev.has(filePath) === expanded) return prev;
      const next = new Set(prev);
      if (expanded) next.add(filePath);
      else next.delete(filePath);
      return next;
    });
  }, []);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [gitUser, setGitUser] = useState<string | undefined>();
  const [reviewMode, setReviewMode] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<string>('uncommitted');
  const [gitContext, setGitContext] = useState<GitContext | null>(null);
  const [workspaceDiffOptions, setWorkspaceDiffOptions] = useState<DiffOption[] | null>(null);
  // Two bases:
  //   selectedBase  — what the picker is currently showing (UI intent).
  //                   Updates immediately when the user picks, so the chip
  //                   feels responsive.
  //   committedBase — the base the server last computed the patch against.
  //                   Drives file-content fetches. Only updates after
  //                   /api/diff/switch returns, so we never pair an old
  //                   patch with a new base's file contents (race that
  //                   produced "trailing context mismatch" warnings).
  const [selectedBase, setSelectedBase] = useState<string | null>(null);
  const [committedBase, setCommittedBase] = useState<string | null>(null);
  // Since-base sections sidecar (committed / changes / untracked grouping).
  const [sections, setSections] = useState<SinceBaseSections | null>(null);
  // Commit metadata sidecar while a commit:<sha> diff is active — drives the
  // description card + collapsed seeding on the all-files surface.
  const [commitInfo, setCommitInfo] = useState<CommitDiffInfo | null>(null);
  // The local origin/<default> tracking ref is behind the actual remote —
  // the "Baseline is behind GitHub · Fetch" banner.
  const [baseBehindRemote, setBaseBehindRemote] = useState(false);
  // Server snapshot id (draftKey) for the diff this client is RENDERING.
  // Echoed on every freshness probe so the server can answer per-client:
  // "your snapshot moved" is independent of whether the VCS changed.
  const [snapshotId, setSnapshotId] = useState<string | undefined>(undefined);
  const [isFetchingBase, setIsFetchingBase] = useState(false);
  // Which left panel is showing. The persisted value (Settings / first-run
  // dialog, written through the coupled setters in config/reviewView)
  // decides what a review OPENS on unless a last-used view is recorded; the
  // header toggle is a session control layered over both — it NEVER writes
  // the persisted view/diff pair. Changing the default is an explicit
  // Settings/setup-dialog act, not a side effect of looking at another view
  // mid-review; the toggle only records its choice as the last-used memo.
  const persistedPanelView = useConfigValue('reviewPanelView');
  const lastUsedPanelView = useConfigValue('reviewPanelViewLastUsed');
  const [sessionPanelView, setSessionPanelView] = useState<'sections' | 'commits' | 'tree' | null>(null);
  const panelView: 'sections' | 'commits' | 'tree' = sessionPanelView ?? lastUsedPanelView ?? persistedPanelView;
  const selectPanelView = useCallback((view: 'sections' | 'commits' | 'tree') => {
    setSessionPanelView(view);
    // Commits is session-only by design (never an opening view), so it is
    // never recorded — picking it leaves last-used at its previous value.
    if (view !== 'commits') configStore.set('reviewPanelViewLastUsed', view);
  }, []);
  const [agentCwd, setAgentCwd] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [submitted, setSubmitted] = useState<'approved' | 'feedback' | 'exited' | false>(false);
  // A committed review-level note waiting for its one-render deferred submit
  // (the payload builders close over `allAnnotations`, so the send has to wait
  // for the render that carries the note). L3: cleared only on submission
  // SUCCESS — a failed POST keeps it armed and the next primary invocation
  // retries; `dispatched` marks the one automatic submit after the commit.
  const [pendingNoteSubmit, setPendingNoteSubmit] = useState<{
    noteId: string;
    dispatched: boolean;
  } | null>(null);
  // Compact/touch decision surfaces: composer items open DecisionNoteDialog,
  // confirm items open one ConfirmDialog (the desktop popover lives inside
  // DecisionControl; compact has no popover to morph). L2: only the item ID
  // is state — the dialog contents resolve from the LIVE spec at render, so
  // a spec update while a dialog is up can never show or confirm stale copy.
  const [compactDecisionComposer, setCompactDecisionComposer] = useState<DecisionMenuItem['id'] | null>(null);
  const [compactDecisionConfirm, setCompactDecisionConfirm] = useState<DecisionMenuItem['id'] | null>(null);
  // Server capability advert (spec §6.4): does this session's decision
  // consumer deliver approve-time feedback? Defaults false so an old server
  // that never sends the field renders no approve-carrying items (PR3
  // behavior); read off every diff payload that carries it.
  const [approvalNotesSupported, setApprovalNotesSupported] = useState(false);
  const [repoInfo, setRepoInfo] = useState<{ display: string; branch?: string } | null>(null);

  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Code Review` : "Code Review";
  }, [repoInfo]);

  const reviewHistoryContext = snapshotId ?? diffData?.gitRef ?? 'loading';
  const applyReviewHistory = useCallback((action: ReviewHistoryAction, direction: HistoryDirection) => {
    switch (action.kind) {
      case 'code':
        setAnnotations((current) => {
          const next = applyCollectionMutations(current, action.mutations, direction, reviewItemId);
          annotationsRef.current = next;
          return next;
        });
        selectedAnnotationIdRef.current = direction === 'undo' ? action.beforeSelection : action.afterSelection;
        setSelectedAnnotationId(selectedAnnotationIdRef.current);
        return;
    }
  }, []);
  const reviewHistory = useUndoHistory<ReviewHistoryAction>({
    context: reviewHistoryContext,
    apply: applyReviewHistory,
  });
  useEffect(() => {
    reviewHistory.clear();
  }, [diffData?.rawPatch, reviewHistory]);
  useEffect(() => {
    if (submitted) reviewHistory.clear();
  }, [reviewHistory, submitted]);

  // The Commits view (linear history rail) exists for plain local git
  // sessions only — workspace/jj/p4 keep their existing panels. Unlike
  // sections it has NO coupled diff: the review opens on the user's normal
  // default until a commit is clicked, and the clicked sha is never persisted.
  // Declared this early because the global keyboard handler consults it.
  const commitsCapable = reviewMode !== 'workspace' && gitContext?.vcsType === 'git';
  const showCommitsPanel = commitsCapable && panelView === 'commits';
  // The diff the session was reviewing before the Commits view's commit
  // clicks (or its HEAD auto-select) took over the single session-global
  // diff — captured on the first non-commit → commit switch, restored when
  // the panel view leaves Commits for the Tree, and cleared by any applied
  // non-commit switch (see fetchDiffSwitch). Ref, not state: it never drives
  // a render, and capture happens inside event handlers.
  const preCommitDiffRef = useRef<CommitViewRestoreTarget | null>(null);

  const identity = useConfigValue('displayName');

  const clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
    setLineAnnotationComposeRequest(null);
  }, []);

  // External annotations (SSE-based, for any external tool)
  const { externalAnnotations, updateExternalAnnotation, deleteExternalAnnotation } = useExternalAnnotations<CodeAnnotation>({ enabled: !!origin });

  const openDiffFile = useCallback((filePath: string) => {
    const file = files.find(candidate => candidate.path === filePath || candidate.oldPath === filePath);
    if (!file) return;
    const resolvedFilePath = file.path;
    clearPendingSelection();
    fileScrollTokenRef.current += 1;
    setFileScrollTarget({ filePath: resolvedFilePath, token: fileScrollTokenRef.current });
    const fileIndex = files.findIndex(candidate => candidate.path === resolvedFilePath);
    if (fileIndex !== -1) {
      setActiveFileIndex(fileIndex);
    }
  }, [clearPendingSelection, files]);

  const handleSelectAllFiles = useCallback(() => {
    if (files[0]) {
      openDiffFile(files[0].path);
    }
  }, [files, openDiffFile]);

  const handleRevealSearchMatch = useCallback((_match: ReviewSearchMatch) => {
    // Respect the surface the user is in. AllFilesCodeView reveals IN PLACE —
    // scrolls to + highlights the active match via its activeSearchMatch prop.
  }, []);

  const {
    searchQuery,
    debouncedSearchQuery,
    isSearchPending,
    isSearchOpen,
    activeSearchMatchId,
    activeSearchMatch,
    searchMatches,
    searchGroups,
    searchInputRef,
    openSearch,
    closeSearch,
    clearSearch,
    stepSearchMatch,
    handleSearchInputChange,
    handleSelectSearchMatch,
  } = useReviewSearch({
    files,
    activeFilePath: files[activeFileIndex]?.path ?? null,
    onRevealMatch: handleRevealSearchMatch,
  });

  const hasSearchableFiles = files.length > 0;
  const shouldShowFileTree =
    hasSearchableFiles ||
    (reviewMode === 'workspace' && !!workspaceDiffOptions?.length) ||
    !!gitContext?.diffOptions?.length ||
    !!gitContext?.worktrees?.length;

  // Merge local + SSE annotations, deduping draft-restored externals against
  // live SSE versions. Prefer the SSE version when both exist (same source,
  // type, and originalText). This avoids the timing issues of an effect-based
  // cleanup — draft-restored externals persist until SSE actually re-delivers them.
  const allAnnotations = useMemo(() => {
    if (externalAnnotations.length === 0) return annotations;

    const local = annotations.filter(a => {
      if (!a.source) return true;
      return !externalAnnotations.some(ext =>
        ext.source === a.source &&
        ext.type === a.type &&
        ext.filePath === a.filePath &&
        ext.lineStart === a.lineStart &&
        ext.lineEnd === a.lineEnd &&
        ext.side === a.side
      );
    });

    return [...local, ...externalAnnotations];
  }, [annotations, externalAnnotations]);
  const allAnnotationsRef = useRef(allAnnotations);
  allAnnotationsRef.current = allAnnotations;

  const handleRestoreDraftRef = useRef<(draft?: any, meta?: any) => void>(() => {});
  // Auto-save code annotation drafts
  const { restoreDraft, getDraftGeneration, discardDraft, flushDraft } = useCodeAnnotationDraft({
    annotations: allAnnotations,
    isApiMode: !!origin,
    submitted: !!submitted,
    onDraftLoaded: (draft, meta) => handleRestoreDraftRef.current(draft, meta),
  });

  const handleRestoreDraft = useCallback((
    loadedDraft?: { annotations: CodeAnnotation[] },
    meta?: { count: number; timeAgo: string },
  ) => {
    reviewHistory.clear();
    const restored = loadedDraft ?? restoreDraft();
    if (restored.annotations.length > 0) setAnnotations(restored.annotations);
    const count = meta?.count ?? restored.annotations.length;
    if (count > 0) {
      toast(`Restored ${count} annotation${count !== 1 ? 's' : ''} from ${meta?.timeAgo ?? 'earlier'}`, {
        action: {
          label: 'Discard',
          onClick: () => {
            discardDraft();
            setAnnotations([]);
            reviewHistory.clear();
          },
        },
      });
    }
  }, [restoreDraft, reviewHistory, discardDraft]);
  handleRestoreDraftRef.current = handleRestoreDraft;



  // Resizable panels
  const panelResize = useResizablePanel({
    storageKey: 'hypermark-review-panel-width',
    onSnapClose: () => reviewSidebar.close(),
    // Single click on the handle (no drag) collapses it.
    onClick: () => reviewSidebar.close(),
  });
  const fileTreeResize = useResizablePanel({
    storageKey: 'hypermark-filetree-width',
    defaultWidth: 256, minWidth: 160, maxWidth: 400, side: 'left',
    onSnapClose: () => setIsFileTreeOpen(false),
    // Single click on the handle (no drag) collapses it.
    onClick: () => setIsFileTreeOpen(false),
  });
  const isResizing = panelResize.isDragging || fileTreeResize.isDragging;




  // Derive worktree path and base diff type from the composite diffType
  // string. Hand-parsed rather than via shared/review-core's
  // parseWorktreeDiffType: that module imports node:path at top level and
  // cannot enter the browser bundle.
  const { activeWorktreePath, activeDiffBase } = useMemo(() => {
    if (diffType.startsWith('worktree:')) {
      const rest = diffType.slice('worktree:'.length);
      // `worktree:<path>:commit:<sha>` — the sub-type contains a colon, so it
      // needs its own split (mirrors parseWorktreeDiffType server-side).
      const commitIdx = rest.lastIndexOf(':commit:');
      if (commitIdx !== -1 && /^commit:[0-9a-f]{4,64}$/i.test(rest.slice(commitIdx + 1))) {
        return { activeWorktreePath: rest.slice(0, commitIdx), activeDiffBase: rest.slice(commitIdx + 1) };
      }
      const lastColon = rest.lastIndexOf(':');
      if (lastColon !== -1) {
        const sub = rest.slice(lastColon + 1);
        if (['since-base', 'local-vs-remote', 'uncommitted', 'staged', 'unstaged', 'last-commit', 'branch', 'merge-base', 'all'].includes(sub)) {
          return { activeWorktreePath: rest.slice(0, lastColon), activeDiffBase: sub };
        }
      }
      return { activeWorktreePath: rest, activeDiffBase: 'uncommitted' };
    }
    return { activeWorktreePath: null, activeDiffBase: diffType };
  }, [diffType]);

  // Annotations created while a commit:<sha> diff is on screen are stamped
  // with that commit (sha + subject) — their line numbers anchor to the
  // commit's diff-vs-parent, not the working tree, and the feedback export
  // labels them accordingly if the user switches diffs before sending.
  // commitInfo is the sidecar for the ACTIVE commit diff (cleared on switch),
  // so its subject is trusted only when it echoes the active sha.
  const activeCommitContext = useMemo(() => {
    const sha = commitShaFromMode(activeDiffBase);
    if (!sha) return null;
    return { sha, subject: commitInfo?.sha === sha ? commitInfo.subject : undefined };
  }, [activeDiffBase, commitInfo]);
  const activeGitButlerContext = useMemo(() => {
    if (!activeDiffBase.startsWith('gitbutler:')) return null;
    return {
      diffType: activeDiffBase,
      label: diffData?.gitRef,
      base: committedBase ?? undefined,
      snapshotId,
    };
  }, [activeDiffBase, diffData?.gitRef, committedBase, snapshotId]);
  const { withDiffContext } = useAnnotationFactory(
    activeCommitContext,
    activeGitButlerContext,
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F to focus file search when diff files are available.
      // Don't intercept in the Commits view (its rail has no search input) —
      // capturing the key there would no-op.
      // Let the same shortcut reselect the current query when search already
      // has focus, while preserving native shortcuts in every other input.
      if (
        matchesChrome(e, CHROME.searchFiles.bindings)
        && shouldHandleReviewSearchShortcut(e.target, searchInputRef.current)
      ) {
        if (hasSearchableFiles && !showCommitsPanel) {
          e.preventDefault();
          setIsFileTreeOpen(true);
          openSearch();
        }
        return;
      }

      // Enter/F3 to step through search matches
      // Shift is the direction, not part of the binding, so it is normalized
      // away before matching and read separately below.
      if (
        matchesChrome({ ...e, shiftKey: false } as KeyboardEvent, CHROME.nextSearchMatch.bindings)
        && searchMatches.length > 0 && !isSearchPending && !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        stepSearchMatch(e.shiftKey ? -1 : 1);
        return;
      }

      // Escape closes modals or clears search
      if (matchesShortcutBinding(e, CHROME.dismiss.bindings[0]!)) {
        if (isSearchOpen) {
          if (searchQuery) {
            clearSearch();
          } else {
            closeSearch();
          }
        } else if (searchQuery) {
          clearSearch();
        }
      }
      // Cmd/Ctrl+B to toggle file tree
      if (matchesChrome(e, CHROME.toggleFileTree.bindings) && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleNavigator();
      }
      // Cmd/Ctrl+. to toggle sidebar
      if (matchesChrome(e, CHROME.toggleSidebar.bindings) && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (reviewSidebar.isOpen) reviewSidebar.close();
        else reviewSidebar.open();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchOpen, searchQuery, searchMatches, isSearchPending, openSearch, stepSearchMatch, clearSearch, closeSearch, hasSearchableFiles, showCommitsPanel, reviewSidebar.isOpen, reviewSidebar.open, reviewSidebar.close, isFileTreeOpen, toggleNavigator]);


  // Load diff content - try API first, fall back to demo
  useEffect(() => {
    fetch('/api/diff')
      .then(res => {
        if (!res.ok) throw new Error('Not in API mode');
        return res.json();
      })
      .then((data: {
        rawPatch: string;
        gitRef: string;
        origin?: Origin;
        mode?: string;
        diffType?: string;
        base?: string;
        gitContext?: GitContext;
        diffOptions?: DiffOption[];
        agentCwd?: string | null;
        approvalNotesSupported?: boolean;
        repoInfo?: { display: string; branch?: string };
        error?: string;
       
        sections?: SinceBaseSections;
        commitInfo?: CommitDiffInfo;
        generatedFiles?: string[];
        baseBehindRemote?: boolean;
        snapshotId?: string;
        serverConfig?: Record<string, unknown> & { displayName?: string; gitUser?: string };
      }) => {
        apiModeRef.current = true;
        // Initialize config store with server-provided values (config file > cookie > default)
        configStore.init(data.serverConfig);
        // gitUser drives the "Use git name" button in Settings; stays undefined (button hidden) when unavailable
        setGitUser(data.serverConfig?.gitUser);
        setSnapshotId(data.snapshotId);
        const apiFiles = orderFilesBySections(parseDiffToFiles(data.rawPatch), data.sections);
        setDiffData({
          files: apiFiles,
          rawPatch: data.rawPatch,
          gitRef: data.gitRef,
          origin: data.origin,
          diffType: data.diffType,
          gitContext: data.gitContext,
          diffOptions: data.diffOptions,
        });
        setFiles(apiFiles);
        setReviewMode(data.mode ?? null);
        setWorkspaceDiffOptions(data.mode === 'workspace' ? (data.diffOptions ?? []) : null);
        if (data.origin) setOrigin(data.origin);
        if (data.diffType) setDiffType(data.diffType);
        if (data.gitContext) {
          setGitContext(data.gitContext);
          // Prefer the server's active base (survives page refresh / reconnect)
          // over the detected default, so the picker rehydrates to what the
          // server is actually using.
          const initial = data.base || data.gitContext.defaultBranch || data.gitContext.compareTarget?.fallback || null;
          setSelectedBase(initial);
          setCommittedBase(initial);
        }
        if (data.agentCwd !== undefined) setAgentCwd(data.agentCwd);
        setApprovalNotesSupported(readApprovalNotesAdvert(data.approvalNotesSupported));
        if (data.repoInfo) setRepoInfo(data.repoInfo);
        if (data.error) setDiffError(data.error);
        setSections(data.sections ?? null);
        setCommitInfo(data.commitInfo ?? null);
        setGeneratedFiles(new Set(data.generatedFiles ?? []));
        setBaseBehindRemote(data.baseBehindRemote === true);
        // First-run: offer the review-view chooser for a plain local git
        // session (not workspace/jj/p4), once. An unseen reviewer's panel
        // is initialized to Tree while inheriting the resolved diff default;
        // the seen gate leaves returning reviewers' persisted and last-used
        // views untouched. The user's explicit choice in the dialog then
        // sticks. Applied to the live session on dismiss.
        //
        // Only when since-base is actually AVAILABLE (base ref resolves). On a
        // repo where getGitContext omits it (trunk / no origin/HEAD), forcing
        // since-base would degrade to HEAD and hide committed work — the exact
        // case the offering guard avoids. There, leave the default alone and
        // don't show the chooser. Matches the sectionsCapable gate used for the
        // header-menu reopen.
        const sinceBaseAvailable = !!data.gitContext?.diffOptions?.some(
          (o: { id: string }) => o.id === 'since-base',
        );
        if (
          data.gitContext && data.mode !== 'workspace' &&
          data.gitContext.vcsType === 'git' && sinceBaseAvailable && initializeReviewSetup()
        ) {
          initializeReviewSetup();
        }
      })
      .catch(() => {
        // Not in API mode - use demo content
        const demoFiles = parseDiffToFiles(DEMO_DIFF);
        setDiffData({
          files: demoFiles,
          rawPatch: DEMO_DIFF,
          gitRef: 'demo',
        });
        setFiles(demoFiles);
        setWorkspaceDiffOptions(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Handle line selection from diff viewer
  const handleLineSelection = useCallback((range: SelectedLineRange | null) => {
    setPendingSelection(range);
    if (range === null) setLineAnnotationComposeRequest(null);
  }, []);

  const addCodeAnnotationsWithHistory = useCallback((items: readonly CodeAnnotation[]) => {
    if (items.length === 0) return;
    const startIndex = annotationsRef.current.length;
    annotationsRef.current = [...annotationsRef.current, ...items];
    setAnnotations(annotationsRef.current);
    reviewHistory.record({
      kind: 'code',
      mutations: items.map((item, offset) => ({ kind: 'add', item, index: startIndex + offset })),
      beforeSelection: selectedAnnotationIdRef.current,
      afterSelection: selectedAnnotationIdRef.current,
    });
  }, [reviewHistory]);

  const handleAddAnnotationForFile = useCallback((
    filePath: string,
    type: CodeAnnotationType,
    text?: string,
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[]
  ) => {
    if (!pendingSelection) return;
    const lineStart = Math.min(pendingSelection.start, pendingSelection.end);
    const lineEnd = Math.max(pendingSelection.start, pendingSelection.end);
    const newAnnotation: CodeAnnotation = {
      id: generateId(),
      type,
      scope: 'line',
      filePath,
      lineStart,
      lineEnd,
      side: pendingSelection.side === 'additions' ? 'new' : 'old',
      text,
      ...(tokenMeta && {
        charStart: tokenMeta.charStart,
        charEnd: tokenMeta.charEnd,
        tokenText: tokenMeta.tokenText,
      }),
      createdAt: Date.now(),
      author: identity,
      images,
    };
    addCodeAnnotationsWithHistory([withDiffContext(newAnnotation)]);
    clearPendingSelection();
  }, [pendingSelection, identity, withDiffContext, clearPendingSelection, addCodeAnnotationsWithHistory]);

  const handleAddFileCommentForFile = useCallback((filePath: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newAnnotation: CodeAnnotation = {
      id: generateId(),
      type: 'comment',
      scope: 'file',
      filePath,
      lineStart: 1,
      lineEnd: 1,
      side: 'new',
      text: trimmed,
      createdAt: Date.now(),
      author: identity,
    };

    addCodeAnnotationsWithHistory([withDiffContext(newAnnotation)]);
  }, [identity, withDiffContext, addCodeAnnotationsWithHistory]);

  // Edit annotation
  const handleEditAnnotation = useCallback((
    id: string,
    text?: string,
    images?: ImageAttachment[],
  ) => {
    const ann = allAnnotationsRef.current.find(a => a.id === id);
    if (ann?.source) reviewHistory.clear();
    const updates: Partial<CodeAnnotation> = {
      ...(text !== undefined && { text }),
      // The composer always sends its concrete image list (never omits it), so
      // an edit that removed every image clears the saved list instead of
      // leaving stale references behind (spec 05 §4.1.5).
      ...(images !== undefined && { images: images.length > 0 ? images : undefined }),
    };
    if (ann?.source && externalAnnotations.some(e => e.id === id)) {
      updateExternalAnnotation(id, updates);
      return;
    }
    const before = annotationsRef.current.find((annotation) => annotation.id === id);
    if (!before) return;
    const after = { ...before, ...updates };
    annotationsRef.current = annotationsRef.current.map((annotation) => annotation.id === id ? after : annotation);
    setAnnotations(annotationsRef.current);
    if (isHumanHistoryMutation(before)) {
      reviewHistory.record({
        kind: 'code',
        mutations: [{ kind: 'edit', before, after }],
        beforeSelection: selectedAnnotationIdRef.current,
        afterSelection: selectedAnnotationIdRef.current,
      });
    }
  }, [updateExternalAnnotation, externalAnnotations, reviewHistory]);

  // selectedAnnotationId is cleared via a functional update (not a captured
  // value): this handler is captured by Pierre slot portals (inline annotation
  // delete buttons) that only republish on item version bumps — a closure over
  // the state value goes stale and would leave a dangling selection id after
  // deleting the currently-selected annotation.
  const handleDeleteAnnotation = useCallback((id: string) => {
    const ann = allAnnotationsRef.current.find(a => a.id === id);
    if (ann?.source) reviewHistory.clear();
    if (ann?.source && externalAnnotations.some(e => e.id === id)) {
      deleteExternalAnnotation(id);
      if (selectedAnnotationIdRef.current === id) {
        selectedAnnotationIdRef.current = null;
        setSelectedAnnotationId(null);
      }
      return;
    }
    const index = annotationsRef.current.findIndex((annotation) => annotation.id === id);
    const local = annotationsRef.current[index];
    if (!local) return;
    const beforeSelection = selectedAnnotationIdRef.current;
    annotationsRef.current = annotationsRef.current.filter((annotation) => annotation.id !== id);
    setAnnotations(annotationsRef.current);
    const afterSelection = beforeSelection === id ? null : beforeSelection;
    selectedAnnotationIdRef.current = afterSelection;
    setSelectedAnnotationId(afterSelection);
    if (isHumanHistoryMutation(local)) {
      reviewHistory.record({
        kind: 'code',
        mutations: [{ kind: 'delete', item: local, index }],
        beforeSelection,
        afterSelection,
      });
    }
  }, [deleteExternalAnnotation, externalAnnotations, reviewHistory]);

  // Handle identity change - update author on existing annotations
  // Switch file in the dedicated center diff panel.
  const handleFilePreview = useCallback((index: number) => {
    const file = files[index];
    if (!file) return;
    openDiffFile(file.path);
  }, [files, openDiffFile]);

  // Double-click currently behaves the same as single-click.
  const handleFilePinned = useCallback((index: number) => {
    const file = files[index];
    if (!file) return;
    openDiffFile(file.path);
  }, [files, openDiffFile]);



  const handleAllFilesVisibleFileChange = useCallback(
    (filePath: string | null) => {
      setAllFilesVisibleFile(filePath);
    },
    [],
  );

  // The three-stack sections panel exists only for the since-base composite
  // view in a plain git session (workspace keeps the classic tree).
  const sectionsAvailable = !!sections && activeDiffBase === 'since-base' && reviewMode !== 'workspace';
  // The sections view IS the since-base comparison — a repo that supports it
  // shows the view toggle even while an advanced (tree) mode is active, and
  // toggling back to Sections switches the diff back to since-base.
  const sectionsCapable = reviewMode !== 'workspace'
    && !!gitContext?.diffOptions?.some(option => option.id === 'since-base');
  const activeCommitSha = activeDiffBase.startsWith('commit:')
    ? activeDiffBase.slice('commit:'.length)
    : null;

  // The view actually RENDERED for the current selection — a latent
  // 'sections'/'commits' selection the session can't offer resolves to the
  // tree, so the toggle highlights the panel on screen. Surfaces that render
  // by view must read this, never the raw panelView.
  const effectivePanelView = resolvePanelView(panelView, { sectionsAvailable, commitsCapable });

  // The all-files surface mirrors whichever left panel is showing: sections
  // order when the sections view is active, tree order otherwise.
  const allFilesOrder: 'tree' | 'list' = effectivePanelView === 'sections' ? 'list' : 'tree';


  // Shared helper: fetch a diff switch and update state.
  // Returns true on success, false on failure — callers that optimistically
  // updated UI state (e.g. the base picker) can use this to revert.
  const fetchDiffSwitch = useCallback(async (
    fullDiffType: string,
    baseOverride?: string,
    options?: {
      preserveFile?: boolean;
      explicitBase?: boolean;
      /**
       * Re-fetch of the SAME diff selection, where a per-path patch delta is a
       * real content change. Set ONLY by the staleness refresh and the
       * post-fetch base refresh: it is what licenses auto-mark-viewed's Rule 5
       * to drop a checkmark. Never set by the whitespace toggle (its deltas
       * are a presentation choice) nor by any switch that changes what is
       * being compared, including a commit detour.
       */
      contentRefresh?: boolean;
    },
  ): Promise<boolean> => {
    setIsLoadingDiff(true);
    try {
      const res = await fetch('/api/diff/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diffType: fullDiffType,
          // Server ignores base for modes that don't use it (uncommitted/staged/etc),
          // so forwarding unconditionally is safe and keeps the request shape uniform.
          ...((baseOverride ?? selectedBase) && { base: baseOverride ?? selectedBase }),
          hideWhitespace: diffHideWhitespace,
          // True only when the base came from the picker THIS request — the
          // server then honors it verbatim (no origin/* canonicalization).
          // Echoed bases (diff-type switches, refreshes) stay canonicalizable
          // so an early-loaded client can't revert the startup base upgrade.
          ...(options?.explicitBase && { explicitBase: true }),
        }),
      });

      if (!res.ok) throw new Error('Failed to switch diff');

      const data = await res.json() as {
        rawPatch: string;
        gitRef: string;
        snapshotId?: string;
        diffType: string;
        base?: string;
        gitContext?: GitContext;
        diffOptions?: DiffOption[];
        error?: string;
        sections?: SinceBaseSections;
        commitInfo?: CommitDiffInfo;
        generatedFiles?: string[];
        baseBehindRemote?: boolean;
        approvalNotesSupported?: boolean;
        superseded?: boolean;
      };

      // A newer switch superseded this one server-side — ignore this stale
      // body so it can't overwrite the newer result (last-response-wins).
      if (data.superseded) return true;
      // Leave-Commits restore memo: any APPLIED switch to a non-commit diff
      // (the restore itself, the Git-status since-base reset, a manual
      // DiffTypePicker escape, a worktree switch) ends the commit family, so
      // the memo it would restore is spent. The superseded early-return above
      // never reaches this clear, so a stale response can't drop a memo a
      // newer commit switch still needs — correct by construction. Failed
      // switches never get here either, keeping the memo for a later retry.
      if (!isCommitDiffType(data.diffType)) preCommitDiffRef.current = null;
      setSnapshotId(data.snapshotId);
      // Session-constant in practice, but re-read from any payload that
      // carries it so the client stays in lockstep with whatever it last
      // applied (the server echoes the advert on the whole diff family).
      if (data.approvalNotesSupported !== undefined) {
        setApprovalNotesSupported(readApprovalNotesAdvert(data.approvalNotesSupported));
      }

      const nextFiles = orderFilesBySections(parseDiffToFiles(data.rawPatch), data.sections);
      setSections(data.sections ?? null);
      setCommitInfo(data.commitInfo ?? null);
      setGeneratedFiles(new Set(data.generatedFiles ?? []));
      setBaseBehindRemote(data.baseBehindRemote === true);

      if (options?.preserveFile) {
        // Whitespace toggle: update patch in-place, keep the active file.
        // If the current file was removed (whitespace-only), retarget the
        // dock panel to the first remaining file.
        setDiffData(prev => prev ? { ...prev, rawPatch: data.rawPatch, gitRef: data.gitRef } : prev);
        if (data.diffOptions) setWorkspaceDiffOptions(data.diffOptions);
        // Adopt the server's base even on in-place refreshes: the staleness
        // Refresh and post-Fetch paths both preserveFile, and they're exactly
        // when the server may canonicalize the base (main -> origin/main after
        // the startup upgrade). Keeping the old name would send /api/file-content
        // and Ask AI context requests against the wrong base.
        if (data.base) {
          setSelectedBase(data.base);
          setCommittedBase(data.base);
        }
        setFiles(nextFiles);
        const currentPath = files[activeFileIndex]?.path;
        const nextIdx = currentPath ? nextFiles.findIndex(f => f.path === currentPath) : -1;
        if (nextIdx !== -1) {
          setActiveFileIndex(nextIdx);
        } else if (nextFiles.length > 0) {
          setActiveFileIndex(0);
          openDiffFile(nextFiles[0].path);
        }
        // Line numbers can shift when whitespace handling changes, so a
        // selection anchored to the old patch is stale — clear it (the
        // non-preserve branch below already does).
        clearPendingSelection();
      } else {
        needsInitialDiffPanel.current = true;
        setDiffData(prev => prev ? { ...prev, rawPatch: data.rawPatch, gitRef: data.gitRef, diffType: data.diffType } : prev);
        setFiles(nextFiles);
        setDiffType(data.diffType);
        if (data.diffOptions) setWorkspaceDiffOptions(data.diffOptions);
        if (data.base) {
          setSelectedBase(data.base);
          setCommittedBase(data.base);
        }
        setActiveFileIndex(0);
        clearPendingSelection();
      }
      // Merge only the refreshable/per-cwd fields. This runs for in-place
      // staleness refreshes too: GitButler stacks and branches can change while
      // the visible patch stays identical, so preserving the active file must
      // not preserve a stale picker. Keep the original `worktrees`,
      // `availableBranches`, and `currentBranch`: the latter labels the launch
      // cwd in WorktreePicker rather than the currently-selected worktree.
      if (data.gitContext) {
        setGitContext((prev) => {
          if (!prev) return data.gitContext!;
          return {
            ...prev,
            defaultBranch: data.gitContext!.defaultBranch,
            diffOptions: data.gitContext!.diffOptions,
            compareTarget: data.gitContext!.compareTarget,
            jjEvologs: data.gitContext!.jjEvologs,
            // HEAD differs per worktree, so refresh the commit-baseline picker.
            recentCommits: data.gitContext!.recentCommits,
          };
        });
      }
      setDiffError(data.error || null);
      return true;
    } catch (err) {
      console.error('Failed to switch diff:', err);
      setDiffError(err instanceof Error ? err.message : 'Failed to switch diff');
      return false;
    } finally {
      setIsLoadingDiff(false);
    }
  }, [selectedBase, diffHideWhitespace, files, activeFileIndex, openDiffFile, clearPendingSelection, diffType]);

  // Switch the base branch the current diff compares against.
  // Only triggers a refetch when the active mode actually uses a base.
  // Optimistically updates the picker; reverts if the server-side switch
  // fails so the chip doesn't lie about what the viewer is actually showing.
  const handleBaseSelect = useCallback(
    async (branch: string) => {
      if (branch === selectedBase) return;
      const previous = selectedBase;
      setSelectedBase(branch);
      if (activeDiffBase === 'since-base' || activeDiffBase === 'branch' || activeDiffBase === 'merge-base' || activeDiffBase === 'jj-line' || activeDiffBase === 'jj-evolog') {
        const ok = await fetchDiffSwitch(diffType, branch, { explicitBase: true });
        if (!ok) setSelectedBase(previous);
      }
    },
    [selectedBase, activeDiffBase, diffType, fetchDiffSwitch],
  );

  // Switch diff type (uncommitted, last-commit, branch) — composes worktree prefix if active
  const handleDiffSwitch = useCallback(async (baseDiffType: string) => {
    const fullDiffType = activeWorktreePath
      ? `worktree:${activeWorktreePath}:${baseDiffType}`
      : baseDiffType;
    if (fullDiffType === diffType) return;
    // For evolog, default to the second entry (previous state of @) so the
    // server doesn't fall back to the jj bookmark/trunk revset.
    // When leaving evolog, restore the base to the detected compare target
    // so other base-dependent modes (jj-line) don't inherit a commit ID.
    const enteringEvolog =
      baseDiffType === 'jj-evolog' && gitContext?.jjEvologs && gitContext.jjEvologs.length >= 2;
    const leavingEvolog =
      !enteringEvolog && activeDiffBase === 'jj-evolog' && gitContext?.defaultBranch;
    const baseOverride = enteringEvolog
      ? gitContext!.jjEvologs![1].commitId
      : leavingEvolog
        ? gitContext!.defaultBranch
        : undefined;
    if (baseOverride) setSelectedBase(baseOverride);
    await fetchDiffSwitch(fullDiffType, baseOverride);
  }, [diffType, activeWorktreePath, fetchDiffSwitch, gitContext]);

  // Toggling to Sections means "show me the since-base review" — if another
  // mode is active, switch the LIVE diff back along with the view. No writes
  // to the persisted view/diff pair: the toggle only records the last-used
  // memo (via selectPanelView), so there is no pair to keep consistent here
  // (Settings and the setup dialog, which do persist, enforce the
  // sections ⟺ since-base coupling via the shared setters in
  // config/reviewView).
  const handleSwitchToSections = useCallback(() => {
    selectPanelView('sections');
    if (activeDiffBase !== 'since-base') void handleDiffSwitch('since-base');
  }, [selectPanelView, activeDiffBase, handleDiffSwitch]);

  // Unified toggle handler for all three panel views. Sections carries a
  // diff coupling (it can render nothing but since-base); Commits switches
  // the view alone (its session machine then owns the diff via commit
  // clicks / HEAD auto-select); and Tree restores the pre-Commits diff when
  // it's the exit from the Commits view — the commit click hijacked the
  // single session-global diff, so leaving the view brings back what the
  // session was reviewing before. Outside that exit, Tree still leaves the
  // active diff as-is (it can render any diff).
  const handlePanelViewSelect = useCallback((view: 'sections' | 'commits' | 'tree') => {
    if (view === 'commits') {
      // The Commits rail has no search input, so an open search would become
      // hidden-but-live: the query keeps matching, marks keep rendering, and
      // Enter keeps stepping matches with no way to see or edit any of it.
      // Entering the view ends the search session cleanly.
      if (searchQuery) clearSearch();
      if (isSearchOpen) closeSearch();
    }
    if (view === 'sections') {
      handleSwitchToSections();
      return;
    }
    if (
      view === 'tree' && panelView === 'commits' &&
      // A commit diff on screen is the normal exit. The in-flight arm covers
      // exiting while a commit switch (typically the HEAD auto-select right
      // after entry) hasn't landed yet — the memo is captured synchronously
      // before that fetch, so memo + loading means a commit diff is inbound;
      // issuing the restore now supersedes it server-side (epoch guard) and
      // its stale body is ignored client-side.
      (isCommitDiffType(diffType) || (isLoadingDiff && preCommitDiffRef.current !== null))
    ) {
      // Restore through fetchDiffSwitch with the memo's FULL diff type (not
      // handleDiffSwitch, which would re-compose the current worktree prefix
      // over an already-composed one). No memo — the page reloaded while a
      // commit diff was active; refs don't survive — falls back to the
      // session default, same resolution handleWorktreeSwitch applies. A
      // failed switch keeps the commit diff on screen with the normal
      // diffError and the memo intact (no retry loop; the next exit — or a
      // manual picker switch — is the recovery path).
      const target = resolveCommitExitDiff(preCommitDiffRef.current, {
        preferredDefault: configStore.get('defaultDiffType'),
        diffOptions: gitContext?.diffOptions ?? [],
        activeWorktreePath,
      });
      void fetchDiffSwitch(target.diffType, target.base ?? undefined);
    }
    selectPanelView(view);
  }, [handleSwitchToSections, selectPanelView, searchQuery, isSearchOpen, clearSearch, closeSearch, panelView, diffType, isLoadingDiff, gitContext, activeWorktreePath, fetchDiffSwitch]);

  // Open a commit's own diff (vs its first parent) in the center dock. The
  // switch resets the dock to the all-files surface via the existing
  // needsInitialDiffPanel flow; re-clicking the active commit just re-focuses
  // that panel (e.g. after the user closed the tab).
  const handleSelectCommit = useCallback((sha: string) => {
    // Compose the worktree prefix ONCE and use it for both the re-click check
    // and the switch itself (going through handleDiffSwitch would compose it
    // a second time in a second place — fragile duplication for no benefit;
    // its evolog base handling never applies to commit diffs).
    const fullDiffType = activeWorktreePath
      ? `worktree:${activeWorktreePath}:commit:${sha}`
      : `commit:${sha}`;
    if (fullDiffType === diffType) {
      openAllFilesPanel();
      return;
    }
    // First entry into the commit family (covers both user clicks and the
    // HEAD auto-select, which routes through this same handler): remember the
    // diff the session came from so leaving the Commits view can restore it.
    // Walking further commits must not overwrite the memo with another commit
    // diff — the exit target is where the REVIEW was, not the previous stop
    // on the rail. A capture whose switch then fails or is superseded leaves
    // a memo with no commit diff active; harmless, since the memo is only
    // read while one is, and re-entry recaptures over it.
    if (!isCommitDiffType(diffType)) {
      preCommitDiffRef.current = { diffType, base: selectedBase };
    }
    void fetchDiffSwitch(fullDiffType);
  }, [activeWorktreePath, diffType, selectedBase, fetchDiffSwitch, openAllFilesPanel]);

  // The Commits-view session machine (log + poll + HEAD auto-select + center
  // veil) lives in the hook so its invariants stay in one file; App supplies
  // the pieces it owns — visibility, the active commit, switch state, and the
  // open-a-commit path (the SAME one user clicks take).
  const commitsView = useCommitsView({
    enabled: showCommitsPanel && !!origin,
    // Worktree and base changes re-anchor the history/divider; commit clicks
    // deliberately don't (paging state survives them).
    contextKey: `${activeWorktreePath ?? ''}|${committedBase ?? ''}`,
    activeCommitSha,
    isLoadingDiff,
    diffError,
    onOpenCommit: handleSelectCommit,
  });

  // Reload un-trap: the server keeps ONE session-global diff, so a page
  // loaded while a commit:<sha> diff is active is served that commit — but
  // the opening panel view is never Commits (deliberately not persisted, and
  // the restore memo above is client memory that didn't survive either), so
  // the session would open on the tree stuck showing a historical commit
  // with no marked picker option and no restore path. Snap it back to the
  // session default once, on load only — a commit diff the USER opens later
  // in this session must never be snapped, hence the one-shot ref that burns
  // on the first settled load regardless of what it observed.
  const snappedCommitDiffOnLoad = useRef(false);
  useEffect(() => {
    if (snappedCommitDiffOnLoad.current || isLoading || !diffData) return;
    snappedCommitDiffOnLoad.current = true;
    if (!isCommitDiffType(diffType)) return;
    if (panelView === 'commits') return; // defensive: unreachable on load
    const target = resolveCommitExitDiff(null, {
      preferredDefault: configStore.get('defaultDiffType'),
      diffOptions: gitContext?.diffOptions ?? [],
      activeWorktreePath,
    });
    void fetchDiffSwitch(target.diffType);
  }, [isLoading, diffData, diffType, panelView, gitContext, activeWorktreePath, fetchDiffSwitch]);

  // Self-heal a conflicted persisted pair: reviewPanelView=sections with a
  // non-since-base defaultDiffType. Every UI writer enforces the coupling
  // (sections ⟺ since-base), but configStore.init() applies config.json over
  // the cookie WITHOUT it — so a stale server value (a debounced write lost
  // when a session closed, or a pre-feature config file) re-corrupts the pair
  // on every load: the server opens on the stale diff in the classic tree
  // while the cookie still says Git status. Trust the view choice, repair the
  // diff default (cookie + config.json), and bring the live session along.
  // Keyed to persistedPanelView, NEVER the live panelView: the header toggle
  // is session-only and must not be able to trigger a settings write, even
  // indirectly through this repair. Only a pair that Settings / the setup
  // dialog / an old config file actually PERSISTED conflicted gets healed.
  const healedPanelPairOnLoad = useRef(false);
  useEffect(() => {
    if (healedPanelPairOnLoad.current || isLoading || !diffData) return;
    if (!sectionsCapable) return;
    if (persistedPanelView !== 'sections') return;
    healedPanelPairOnLoad.current = true;
    if (configStore.get('defaultDiffType') !== 'since-base') {
      // Re-assert the pair through the coupled setter (repairs cookie +
      // config.json), then bring the live session along. This is a repair,
      // not a user choice — it must not overwrite the last-used memo.
      setReviewPanelView('sections', { recordLastUsed: false });
      if (activeDiffBase !== 'since-base') void handleDiffSwitch('since-base');
    }
  }, [isLoading, diffData, sectionsCapable, persistedPanelView, activeDiffBase, handleDiffSwitch]);

  // Switch worktree context (or back to main repo). Preserves the current
  // diff mode across the switch — if the reviewer was looking at "PR Diff"
  // in the main repo, they should keep looking at "PR Diff" in the target
  // worktree rather than being silently snapped back to "Uncommitted".
  //
  // EXCEPT commit:<sha> diffs: every other mode recomputes meaningfully
  // against the target worktree, but a commit diff is context-bound content —
  // worktrees share one object database, so "preserving" it just re-renders
  // the OLD context's commit byte-for-byte. Fall back to the session's normal
  // default (same option-availability rule resolveInitialDiffType applies).
  const handleWorktreeSwitch = useCallback(async (worktreePath: string | null) => {
    if (worktreePath === activeWorktreePath) return;
    let carriedBase = activeDiffBase;
    if (activeDiffBase.startsWith('commit:')) {
      const preferred = configStore.get('defaultDiffType');
      const options = gitContext?.diffOptions ?? [];
      carriedBase = options.some((o) => o.id === preferred)
        ? preferred
        : (options[0]?.id ?? 'uncommitted');
    }
    const fullDiffType = worktreePath
      ? `worktree:${worktreePath}:${carriedBase}`
      : carriedBase;
    await fetchDiffSwitch(fullDiffType);
  }, [activeWorktreePath, activeDiffBase, gitContext, fetchDiffSwitch]);

  // Re-fetch diff when hideWhitespace toggles so the server applies git diff -w.
  // Preserves the active file since only whitespace hunks change.
  const hideWhitespaceInitialized = useRef(false);
  useEffect(() => {
    if (!origin || (!gitContext && reviewMode !== 'workspace')) return;
    if (!hideWhitespaceInitialized.current) {
      hideWhitespaceInitialized.current = true;
      return;
    }
    fetchDiffSwitch(diffType, selectedBase, { preserveFile: true });
  }, [diffHideWhitespace, origin, reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Diff staleness ---------------------------------------------------------
  // Files changing mid-review (an agent editing/committing while the user
  // reviews) make the snapshot on screen stale. The hook polls the server's
  // cheap fingerprint check; the toolbar shows a non-blocking notice and the
  // user refreshes when THEY are ready — never automatically (annotations are
  // line-anchored; rug-pulling the diff under them is worse than staleness).
  const diffFreshness = useDiffFreshness({
    enabled: !!origin,
    resetKey: diffData?.rawPatch ?? '',
    snapshotId,
    onAgentCwd: setAgentCwd,
    onBaseBehindRemote: setBaseBehindRemote,
  });

  // "Baseline is behind GitHub · Fetch" — fetch the remote default branch,
  // then recompute the current diff in place (preserving the active file).
  // Live diff selection for async completions that must detect "the user
  // moved on" (see handleFetchBase). Updated every render.
  const liveSelectionRef = useRef({ diffType, selectedBase });
  liveSelectionRef.current = { diffType, selectedBase };

  const handleFetchBase = useCallback(async () => {
    // Captured at click time; compared against the live ref when the fetch
    // completes. The replay exists to refresh the SAME view with the fetched
    // baseline — if the user switched diff type or base while the (possibly
    // slow) fetch ran, replaying the captured values would win the switch
    // epoch and silently yank them back to the old view.
    const captured = { diffType, selectedBase };
    setIsFetchingBase(true);
    try {
      const res = await fetch('/api/fetch-base', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json() as { ok?: boolean; baseBehindRemote?: boolean };
      setBaseBehindRemote(data.baseBehindRemote === true);
      const now = liveSelectionRef.current;
      if (now.diffType === captured.diffType && now.selectedBase === captured.selectedBase) {
        await fetchDiffSwitch(captured.diffType, captured.selectedBase ?? undefined, { preserveFile: true, contentRefresh: true });
      }
    } catch {
      // Best-effort: the banner stays and the user can retry.
    } finally {
      setIsFetchingBase(false);
    }
  }, [diffType, selectedBase, fetchDiffSwitch]);

  const handleRefreshStaleDiff = useCallback(() => {
    // Same params, fresh snapshot. preserveFile keeps the reviewer on the
    // file they were reading; contentRefresh licenses Rule 5, because here a
    // per-path patch delta really is the content having changed underneath.
    void fetchDiffSwitch(diffType, selectedBase, { preserveFile: true, contentRefresh: true });
    // New commits are part of what went stale — bring the rail along.
    if (showCommitsPanel) commitsView.refresh();
  }, [fetchDiffSwitch, diffType, selectedBase, showCommitsPanel, commitsView.refresh]);

  // Select annotation - switches file if needed and scrolls to it.
  // isAllFilesActive is read through the ref (declared with the state): this
  // handler is baked into Pierre slot portals, which only republish on item
  // version bumps — a stale captured value would yank the user out of the
  // all-files tab into the single-file panel when they click an annotation.
  // Inline-card selection: toggle the highlight + ring only. No scroll, no file
  // switch — the clicked card is already on screen. Clicking the selected card
  // again (or a null id) clears it.
  const handleSelectAnnotation = useCallback((id: string | null) => {
    // An inline selection supersedes any pending sidebar/findings navigate target,
    // so a later remount (Refresh / base switch) doesn't re-scroll back to it.
    setScrollTargetAnnotation(null);
    setSelectedAnnotationId(prev => {
      const next = !id || prev === id ? null : id;
      selectedAnnotationIdRef.current = next;
      return next;
    });
  }, []);

  // Sidebar navigation: select AND scroll-to the comment (DiffsHub "set +
  // scroll"). The token bump re-fires the view's scroll effect even when the
  // same comment is clicked twice.
  const handleNavigateToAnnotation = useCallback((id: string | null) => {
    if (!id) {
      setSelectedAnnotationId(null);
      return;
    }
    const annotation = allAnnotationsRef.current.find(a => a.id === id);
    if (!annotation) {
      setSelectedAnnotationId(null);
      return;
    }
    setSelectedAnnotationId(id);
    setScrollTargetAnnotation(prev => ({ id, token: (prev?.token ?? 0) + 1 }));
  }, []);

  // Diff context bundled into local-mode feedback headers so the receiving
  // agent knows which diff the annotations are anchored to. Uses committedBase
  // (what the server actually computed) and activeDiffBase/activeWorktreePath
  // (derived from the committed diffType).
  // Declared before reviewStateValue because both reviewStateValue and the
  // feedbackMarkdown memo below read it; moving it below either would put it
  // in the TDZ when those memos run on first render.
  const feedbackDiffContext = useMemo(
    () =>
      !activeDiffBase
        ? undefined
        : {
            mode: activeDiffBase,
            base: committedBase ?? undefined,
            worktreePath: activeWorktreePath,
            commitSubject: activeCommitContext?.subject,
            snapshotId,
          },
    [activeDiffBase, committedBase, activeWorktreePath, activeCommitContext, snapshotId],
  );

  // A commit diff heads the surface with the full commit message and opens
  // its files folded — the description gives the "what/why", the collapsed
  // file list the shape, and each file expands on demand. The card rides
  // INSIDE the scroller (leadingContent), so it scrolls away with the diff.
  // Stable element identity per commit — an inline JSX literal would be a new
  // object every render and churn the measuring ResizeObserver in
  // AllFilesCodeView (leadingContent is in its effect deps).
  const leadingContent = useMemo(
    () => (commitInfo ? <CommitDescriptionHeader key={commitInfo.sha} info={commitInfo} /> : undefined),
    [commitInfo],
  );

  // Copy raw diff to clipboard
  const handleCopyDiff = useCallback(async () => {
    if (!diffData) return;
    if (await copyTextToClipboard(diffData.rawPatch)) {
      setCopyRawDiffStatus('success');
      setTimeout(() => setCopyRawDiffStatus('idle'), 2000);
    } else {
      console.error('Failed to copy');
      setCopyRawDiffStatus('error');
      setTimeout(() => setCopyRawDiffStatus('idle'), 2000);
    }
  }, [diffData]);

  const feedbackMarkdown = useMemo(
    () => exportReviewFeedback(allAnnotations, feedbackDiffContext),
    [allAnnotations, feedbackDiffContext],
  );

  const totalAnnotationCount = allAnnotations.length;

  // Copy the same full feedback the agent gets (code + editor + PR description +
  // PR comment notes), not just code annotations. Defined after feedbackMarkdown
  // / totalAnnotationCount so it can depend on them.
  const handleCopyFeedback = useCallback(async () => {
    if (totalAnnotationCount === 0) {
      setShowNoAnnotationsDialog(true);
      return;
    }
    if (await copyTextToClipboard(feedbackMarkdown)) {
      setCopyFeedback('Feedback copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
      toast.success('Feedback copied');
    } else {
      console.error('Failed to copy');
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
      toast.error('Failed to copy');
    }
  }, [totalAnnotationCount, feedbackMarkdown]);

  // Send feedback to the agent session. Returns whether the POST landed so
  // the deferred note submit can keep its captured decision armed on failure
  // (L3). The old zero-count guard is gone: no send action is offered at zero
  // (the empty-state primary is Approve), and leaving it would silently
  // swallow a request-changes submission whose note has not yet landed in
  // state (spec §3.2).
  const handleSendFeedback = useCallback(async (): Promise<boolean> => {
    setIsSendingFeedback(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          approved: false,
          feedback: feedbackMarkdown,
          annotations: allAnnotations,
        }),
      });
      if (res.ok) {
        setSubmitted('feedback');
        return true;
      }
      throw new Error('Failed to send');
    } catch (err) {
      console.error('Failed to send feedback:', err);
      setCopyFeedback('Failed to send');
      setTimeout(() => setCopyFeedback(null), 2000);
      setIsSendingFeedback(false);
      return false;
    }
  }, [feedbackMarkdown, allAnnotations, getDraftGeneration]);

  // Exit review session without sending any feedback
  const handleExit = useCallback(async () => {
    setIsExiting(true);
    try {
      const res = await fetch(`/api/exit?draftGeneration=${getDraftGeneration()}`, { method: 'POST' });
      if (res.ok) {
        setSubmitted('exited');
      } else {
        throw new Error('Failed to exit');
      }
    } catch (error) {
      console.error('Failed to exit review:', error);
      setIsExiting(false);
    }
  }, [getDraftGeneration]);

  // Session-ended: the parent watcher (packages/server/parent-watch.ts)
  // announces when the Claude Code process that owns this session has
  // exited. Flush the draft first, then show the same "Session Closed"
  // overlay a manual exit shows. Stops listening once a decision is in.
  const handleSessionEnded = useCallback(() => {
    flushDraft();
    setSubmitted('exited');
  }, [flushDraft]);
  useSessionEndedStream(submitted === false, handleSessionEnded);

  // Approve — bare (LGTM), with a composer note, or with the live annotations
  // riding along (PR5 delivery, spec §6.4). The old LGTM placeholder is gone:
  // consumers now print approve-time feedback, so a bare approval must send
  // `feedback: ''` (which also makes the archive's `lgtm` decision reachable
  // and stops bare approvals writing a sidecar). Payload shape is the pure
  // buildReviewApprovalBody, so the delivery contract is testable without
  // mounting the App.
  const handleApprove = useCallback(async (options?: { note?: string; withAnnotations?: boolean }) => {
    setIsApproving(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReviewApprovalBody({
          draftGeneration: getDraftGeneration(),
          note: options?.note,
          withAnnotations: options?.withAnnotations === true,
          feedbackMarkdown,
          annotations: allAnnotations,
        })),
      });
      if (res.ok) {
        setSubmitted('approved');
      } else {
        throw new Error('Failed to send');
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setCopyFeedback('Failed to send');
      setTimeout(() => setCopyFeedback(null), 2000);
      setIsApproving(false);
    }
  }, [getDraftGeneration, feedbackMarkdown, allAnnotations]);

  // --- The unified review decision control, agent mode (spec §3.2/§4) ------
  // One primary, one callback: the header's left segment, the global
  // Mod+Enter handler, and the compact primary row all call this. Platform
  // (PR) mode keeps its own row until PR6.
  const busyWithDecision = isSendingFeedback || isApproving || isExiting;

  const noteDispatchInFlightRef = useRef(false);
  const dispatchPendingNote = useCallback(() => {
    if (noteDispatchInFlightRef.current) return;
    noteDispatchInFlightRef.current = true;
    void (async () => {
      try {
        const ok = await handleSendFeedback();
        if (ok) setPendingNoteSubmit(null); // L3: cleared only on success
      } finally {
        noteDispatchInFlightRef.current = false;
      }
    })();
  }, [handleSendFeedback]);

  const submitPrimaryDecision = useCallback(() => {
    if (submitted || busyWithDecision) return;
    if (pendingNoteSubmit) {
      // A failed note submit stays armed; the next primary invocation retries
      // that send (the note is already in `allAnnotations`, so the body is
      // the captured decision, not a re-derivation).
      dispatchPendingNote();
      return;
    }
    if (totalAnnotationCount === 0) void handleApprove();
    else void handleSendFeedback();
  }, [
    busyWithDecision,
    dispatchPendingNote,
    handleApprove,
    handleSendFeedback,
    pendingNoteSubmit,
    submitted,
    totalAnnotationCount,
  ]);

  // Note → scope:'general' CodeAnnotation at submit time: it rides the
  // existing export (## General) and the /api/feedback annotations array with
  // no server change on either runtime (#1449 transport). Shape (sentinels,
  // no PR context) lives in createGeneralReviewComment; deliberately NOT
  // recorded in review history — it lives for one submit.
  const commitReviewNote = useCallback((text: string): string | null => {
    const note = createGeneralReviewComment(text, identity);
    if (!note) return null;
    annotationsRef.current = [...annotationsRef.current, note];
    setAnnotations(annotationsRef.current);
    return note.id;
  }, [identity]);

  // Sidebar "+ General comment" — the durable human producer for a
  // scope:'general' review-level comment (spec §3.3). Unlike the submit note
  // above, it goes through history (undoable, draft-persisted, deletable via
  // the sidebar's existing delete); like it, it is deliberately NOT
  // withDiffContext-stamped, so it survives an in-place PR switch (see the
  // factory's doc in reviewDecision.ts).
  const handleAddGeneralComment = useCallback((text: string) => {
    // Mirrors the 'note' route's guard: a commit during an in-flight decision
    // POST would append an annotation the captured body never carries — the
    // server then deletes the draft and the comment vanishes from wire and
    // archive alike.
    if (submitted || busyWithDecision) return;
    const note = createGeneralReviewComment(text, identity);
    if (!note) return;
    addCodeAnnotationsWithHistory([note]);
  }, [identity, addCodeAnnotationsWithHistory, busyWithDecision, submitted]);

  // The commit above is a state write, so feedbackMarkdown/handleSendFeedback
  // (which close over `allAnnotations`) only see the note on the NEXT render.
  // Submit from an effect once the note is actually in state. One automatic
  // dispatch per arming; after a failure the armed decision waits for the
  // next primary invocation (L3).
  useEffect(() => {
    const pending = pendingNoteSubmit;
    if (!pending) return;
    if (!allAnnotations.some((a) => a.id === pending.noteId)) {
      // The note left state (sidebar delete, draft restore): the captured
      // decision lost its note — disarm rather than posting without it.
      setPendingNoteSubmit(null);
      return;
    }
    if (pending.dispatched) return;
    setPendingNoteSubmit({ ...pending, dispatched: true });
    dispatchPendingNote();
  }, [allAnnotations, dispatchPendingNote, pendingNoteSubmit]);

  const runReviewDecisionAction = useCallback((id: DecisionActionId, note?: string) => {
    const action = resolveReviewDecisionAction(id);
    switch (action.kind) {
      case 'primary':
        submitPrimaryDecision();
        return;
      case 'note': {
        if (submitted || busyWithDecision) return;
        const noteId = commitReviewNote(note ?? '');
        if (!noteId) return; // the control never submits an empty note
        setPendingNoteSubmit({ noteId, dispatched: false });
        return;
      }
      case 'close':
        // The DecisionControl / compact ConfirmDialog has already confirmed
        // when there was something to lose, so the exit warning is NOT raised
        // again here. Same in-flight guard as the sibling routes: a confirm
        // left open across an in-flight decision POST must not produce a
        // second decision.
        if (submitted || busyWithDecision) return;
        void handleExit();
        return;
      case 'approve-with-notes':
        // PR5 delivery (spec §6.4): reachable only when the server advertised
        // approvalNotesSupported — the session's consumer prints/sends the
        // approve-time feedback these carry. "Approve with notes" ships the
        // live annotations + their export; "Approve with a note…" ships the
        // composer note alone.
        if (submitted || busyWithDecision) return;
        void handleApprove({ note, withAnnotations: action.withAnnotations });
        return;
    }
  }, [busyWithDecision, commitReviewNote, handleApprove, submitPrimaryDecision, submitted]);

  const reviewDecisionSpec = useMemo(() => buildDecisionSpec({
    app: 'review',
    gate: true, // review's primary positive decision IS approval
    count: totalAnnotationCount,
    hasFeedback: totalAnnotationCount > 0,
    // The server advert (spec §6.4) — false until a capable server says so,
    // so approve-carrying items never render where notes would be discarded.
    approvalNotesSupported,
  }), [totalAnnotationCount, approvalNotesSupported]);

  const reviewDecisionHandlers = useMemo<Record<DecisionActionId, DecisionHandler>>(() => ({
    'primary': () => runReviewDecisionAction('primary'),
    'note-with-approval': (note) => runReviewDecisionAction('note-with-approval', note),
    'request-changes': (note) => runReviewDecisionAction('request-changes', note),
    'note-with-feedback': (note) => runReviewDecisionAction('note-with-feedback', note),
    'approve-with-notes': () => runReviewDecisionAction('approve-with-notes'),
    'close-session': () => runReviewDecisionAction('close-session'),
  }), [runReviewDecisionAction]);

  // L2: the compact dialogs render from the LIVE spec; if the item behind an
  // open dialog left the spec (annotation deleted, state flipped), the dialog
  // closes instead of acting on a stale capture.
  const compactComposerItem = compactDecisionComposer !== null
    ? reviewDecisionSpec.items.find(
        (item) => item.id === compactDecisionComposer && item.composer,
      ) ?? null
    : null;
  const compactConfirmItem = compactDecisionConfirm !== null
    ? reviewDecisionSpec.items.find(
        (item) => item.id === compactDecisionConfirm && item.confirm,
      ) ?? null
    : null;
  useEffect(() => {
    if (compactDecisionComposer !== null && !compactComposerItem) setCompactDecisionComposer(null);
    if (compactDecisionConfirm !== null && !compactConfirmItem) setCompactDecisionConfirm(null);
  }, [compactComposerItem, compactConfirmItem, compactDecisionComposer, compactDecisionConfirm]);


  const canHandleReviewHistoryShortcut = useCallback((event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || isNativeHistoryOwner(event)) return false;
    if (submitted || isSendingFeedback || isApproving || isExiting || isLoadingDiff) return false;
    if (showWorktreeDialog || showNoAnnotationsDialog) return false;
    return !hasActiveHistoryOverlay(document);
  }, [
    isApproving,
    isExiting,
    isLoadingDiff,
    isSendingFeedback,
    showNoAnnotationsDialog,
    showWorktreeDialog,
    submitted,
  ]);

  useHistoryShortcuts({
    handlers: {
      undo: {
        when: (event) => canHandleReviewHistoryShortcut(event) && reviewHistory.canUndo,
        handle: () => { reviewHistory.undo(); },
      },
      redo: {
        when: (event) => canHandleReviewHistoryShortcut(event) && reviewHistory.canRedo,
        handle: () => { reviewHistory.redo(); },
      },
    },
  });

  // Cmd/Ctrl+Enter keyboard shortcut to approve or send feedback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;

      // Let an open confirmation dialog own Mod+Enter (PR2's idiom, the
      // shared ConfirmDialog stamps this sentinel): its own window-level
      // handler fires onConfirm from the SAME event, and stopPropagation
      // cannot stop same-target listeners — without this guard one keystroke
      // over the discard confirm would post TWO contradictory decisions
      // (this effect's Send Feedback plus the confirm's LGTM approve).
      if (document.querySelector('[data-hypermark-confirm-dialog="true"]')) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (showNoAnnotationsDialog) return;
      if (submitted || isSendingFeedback || isApproving || isExiting) return;
      if (!origin) return; // Demo mode

      e.preventDefault();

      // Mod+Enter is the header's visible primary, always — the same
      // submitPrimaryDecision the button and compact row call.
      submitPrimaryDecision();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showNoAnnotationsDialog,
    submitted, isSendingFeedback, isApproving, isExiting,
    origin, submitPrimaryDecision,
  ]);

  // Cmd/Ctrl+Shift+Y keyboard shortcut to copy feedback, mirroring the
  // Copy Feedback button in the header.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!matchesChrome(e, CHROME.copyFeedback.bindings) || isTypingTarget(e.target)) return;

      if (showNoAnnotationsDialog) return;

      e.preventDefault();
      handleCopyFeedback();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showNoAnnotationsDialog,
    handleCopyFeedback
  ]);

  const fileTreeResizeHandle = (
    <ResizeHandle
      {...fileTreeResize.handleProps}
      className="z-10"
      side="left"
      hideHoverTrack
      tooltip={RESIZE_HANDLE_TOOLTIP}
      onCollapse={() => setIsFileTreeOpen(false)}
    />
  );

  const showsLocalVsRemoteEmptyState = activeDiffBase === 'local-vs-remote';

  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="dark" manageFavicon>
        <div className="pn-app-viewport flex items-center justify-center bg-background">
          <div className="text-muted-foreground text-sm">Loading diff...</div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" manageFavicon>
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <div
        className="pn-app-viewport flex flex-col bg-background overflow-hidden"
        data-pn-browser-canvas="background"
      >
        {/* Header */}
        <header className={'py-1 flex flex-col min-[480px]:flex-row items-stretch min-[480px]:items-center min-[480px]:justify-between gap-1 min-[480px]:gap-0 px-2 lg:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-50'}>
          <div className={'min-w-0 flex flex-1 items-center gap-2 lg:gap-3'}>
            {shouldShowFileTree && (
              <>
                <button
                  onClick={toggleNavigator}
                  className={`h-7 w-7 flex shrink-0 items-center justify-center rounded-md transition-all focus-visible:outline-none ${
                    isNavigatorOpen
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title={isNavigatorOpen ? 'Close review navigation' : 'Open review navigation'}
                  aria-label={isNavigatorOpen ? 'Close review navigation' : 'Open review navigation'}
                  aria-expanded={isNavigatorOpen}
                >
                  <Tree className="w-3.5 h-3.5" />
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
                  className="text-xs text-muted-foreground/60 inline-flex items-center gap-1 truncate max-w-[220px]"
                  title={repoInfo.display}
                >
                  <RepoIcon className="w-3 h-3 flex-shrink-0" />
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
                    className="text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25 max-w-[240px] truncate"
                    title={diffError}
                  >
                    {files.length > 0 ? 'Some workspace changes could not be loaded' : 'Workspace changes could not be loaded'}
                  </div>
                )}

                {/* Diff staleness notice — files changed since this snapshot
                    was computed (agent editing mid-review). Non-blocking; the
                    user refreshes when ready. */}
                {diffFreshness.isStale && !isLoadingDiff && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25">
                    <span className="hidden md:inline">Diff out of date</span>
                    <span className="md:hidden">Stale</span>
                    <button
                      onClick={handleRefreshStaleDiff}
                      className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                      title="Re-run the diff with the current settings"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={diffFreshness.dismiss}
                      className="text-amber-700/60 dark:text-amber-300/60 hover:text-amber-900 dark:hover:text-amber-100 transition-colors leading-none"
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
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25">
                    <span className="hidden md:inline">Baseline is behind GitHub</span>
                    <span className="md:hidden">Base behind</span>
                    {isFetchingBase ? (
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="inline-block w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                        Fetching…
                      </span>
                    ) : (
                      <button
                        onClick={handleFetchBase}
                        className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                        title="git fetch the default branch and recompute the diff"
                      >
                        Fetch
                      </button>
                    )}
                  </div>
                )}

                  <DecisionControl
                    spec={reviewDecisionSpec}
                    handlers={reviewDecisionHandlers}
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
                    <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="hidden md:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {totalAnnotationCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground px-0.5">
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
                className="w-3.5 h-3.5"
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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M12 4v16" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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


        {/* Main content */}
        <div className={`relative flex-1 flex overflow-hidden ${isResizing ? 'select-none' : ''}`}>
          {shouldShowFileTree && isNavigatorOpen && sectionsAvailable && panelView === 'sections' && (
            <ReviewNavigatorContainer
              onClose={() => setIsFileTreeOpen(false)}
              resizeHandle={fileTreeResizeHandle}
            >
              <SectionsPanel
                files={files}
                sections={sections!}
                width={fileTreeResize.width}
                activeFileIndex={isAllFilesActive ? -1 : activeFileIndex}
                scrollHighlightIndex={isAllFilesActive && allFilesVisibleFile ? files.findIndex(f => f.path === allFilesVisibleFile) : undefined}
                onSelectFile={(index) => handleFilePreview(index)}
                onDoubleClickFile={(index) => handleFilePinned(index)}
                enableKeyboardNav={hasSearchableFiles}
                annotations={allAnnotations}
                isLoadingDiff={isLoadingDiff}
                availableBranches={gitContext?.availableBranches}
                selectedBase={selectedBase ?? undefined}
                detectedBase={gitContext?.defaultBranch || gitContext?.compareTarget?.fallback}
                onSelectBase={(base) => handleBaseSelect(base)}
                compareTarget={gitContext?.compareTarget}
                recentCommits={gitContext?.recentCommits}
                onSelectPanelView={handlePanelViewSelect}
                showCommitsOption={commitsCapable}
                onSelectAllFiles={handleSelectAllFiles}
                isAllFilesActive={isAllFilesActive}
                onCopyRawDiff={handleCopyDiff}
                canCopyRawDiff={!!diffData?.rawPatch}
                copyRawDiffStatus={copyRawDiffStatus}
                searchQuery={hasSearchableFiles ? searchQuery : ''}
                isSearchOpen={hasSearchableFiles ? isSearchOpen : false}
                isSearchPending={isSearchPending}
                searchInputRef={hasSearchableFiles ? searchInputRef : undefined}
                onOpenSearch={hasSearchableFiles ? openSearch : undefined}
                onSearchChange={hasSearchableFiles ? handleSearchInputChange : undefined}
                onSearchClear={hasSearchableFiles ? clearSearch : undefined}
                onSearchClose={hasSearchableFiles ? closeSearch : undefined}
                searchGroups={hasSearchableFiles ? searchGroups : []}
                searchMatches={hasSearchableFiles ? searchMatches : []}
                activeSearchMatchId={hasSearchableFiles ? activeSearchMatchId : null}
                onSelectSearchMatch={hasSearchableFiles ? (match) => handleSelectSearchMatch(match) : undefined}
                onStepSearchMatch={hasSearchableFiles ? stepSearchMatch : undefined}
              />
            </ReviewNavigatorContainer>
          )}
          {shouldShowFileTree && isNavigatorOpen && showCommitsPanel && (
            <ReviewNavigatorContainer
              onClose={() => setIsFileTreeOpen(false)}
              resizeHandle={fileTreeResizeHandle}
            >
              <CommitsPanel
                width={fileTreeResize.width}
                commits={commitsView.commits}
                base={commitsView.base}
                hasMore={commitsView.hasMore}
                isLoading={commitsView.isLoading}
                isLoadingMore={commitsView.isLoadingMore}
                error={commitsView.error}
                activeCommitSha={activeCommitSha}
                onSelectCommit={(sha) => handleSelectCommit(sha)}
                onShowMore={commitsView.showMore}
                onRetry={commitsView.refresh}
                onSelectPanelView={handlePanelViewSelect}
                showSectionsOption={sectionsCapable}
              />
            </ReviewNavigatorContainer>
          )}
          {shouldShowFileTree && isNavigatorOpen && !(sectionsAvailable && panelView === 'sections') && !showCommitsPanel && (
            <ReviewNavigatorContainer
              onClose={() => setIsFileTreeOpen(false)}
              resizeHandle={fileTreeResizeHandle}
            >
              <FileTree
                files={files}
                activeFileIndex={activeFileIndex}
                onSelectAllFiles={handleSelectAllFiles}
                isAllFilesActive={isAllFilesActive}
                scrollHighlightIndex={isAllFilesActive && allFilesVisibleFile ? files.findIndex(f => f.path === allFilesVisibleFile) : undefined}
                onSelectFile={(index) => handleFilePreview(index)}
                onDoubleClickFile={(index) => handleFilePinned(index)}
                annotations={allAnnotations}
                enableKeyboardNav={hasSearchableFiles}
                diffOptions={reviewMode === 'workspace' ? (workspaceDiffOptions ?? undefined) : gitContext?.diffOptions}
                activeDiffType={activeDiffBase}
                onSelectDiff={(diffType) => handleDiffSwitch(diffType)}
                isLoadingDiff={isLoadingDiff}
                width={fileTreeResize.width}
                worktrees={gitContext?.worktrees}
                activeWorktreePath={activeWorktreePath}
                onSelectWorktree={(path) => handleWorktreeSwitch(path)}
                currentBranch={gitContext?.currentBranch}
                availableBranches={gitContext?.availableBranches}
                selectedBase={selectedBase ?? undefined}
                detectedBase={gitContext?.defaultBranch || gitContext?.compareTarget?.fallback}
                onSelectBase={(base) => handleBaseSelect(base)}
                compareTarget={gitContext?.compareTarget}
                recentCommits={gitContext?.recentCommits}
                jjEvologs={gitContext?.jjEvologs}
                detectedEvoBase={gitContext?.jjEvologs?.[1]?.commitId}
                onCopyRawDiff={handleCopyDiff}
                canCopyRawDiff={!!diffData?.rawPatch}
                copyRawDiffStatus={copyRawDiffStatus}
                searchQuery={hasSearchableFiles ? searchQuery : ''}
                isSearchOpen={hasSearchableFiles ? isSearchOpen : false}
                isSearchPending={isSearchPending}
                searchInputRef={hasSearchableFiles ? searchInputRef : undefined}
                onOpenSearch={hasSearchableFiles ? openSearch : undefined}
                onSearchChange={hasSearchableFiles ? handleSearchInputChange : undefined}
                onSearchClear={hasSearchableFiles ? clearSearch : undefined}
                onSearchClose={hasSearchableFiles ? closeSearch : undefined}
                searchGroups={hasSearchableFiles ? searchGroups : []}
                searchMatches={hasSearchableFiles ? searchMatches : []}
                activeSearchMatchId={hasSearchableFiles ? activeSearchMatchId : null}
                onSelectSearchMatch={hasSearchableFiles ? (match) => handleSelectSearchMatch(match) : undefined}
                onStepSearchMatch={hasSearchableFiles ? stepSearchMatch : undefined}
                repoRoot={(activeWorktreePath ?? agentCwd ?? gitContext?.cwd ?? null)}
                panelView={effectivePanelView}
                onSwitchToSections={sectionsCapable ? handleSwitchToSections : undefined}
                onSwitchToCommits={commitsCapable ? () => handlePanelViewSelect('commits') : undefined}
                onSwitchToTree={() => handlePanelViewSelect('tree')}
                sinceBaseSections={activeDiffBase === 'since-base' ? sections : null}
              />
            </ReviewNavigatorContainer>
          )}


          {/* Center dock area */}
          <div
            className="flex-1 min-w-0 overflow-hidden relative"
          >
            {/* Commit navigation veil: while a commit switch is in flight (or
                the view was just entered and HEAD auto-select hasn't landed),
                cover the stale previous diff instead of letting it sit there
                and then jump — the rail click reads as immediate. All terminal
                states (switch error, log error, empty history) drop the veil —
                see useCommitsView's veilActive. */}
            {commitsView.veilActive && (
              <div className="absolute inset-0 z-20 bg-background/95 flex items-center justify-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading commit…
                </div>
              </div>
            )}
            {files.length > 0 ? (
              <AllFilesCodeView
                files={files}
                diffStyle={diffStyle}
                diffOverflow={diffOverflow}
                diffIndicators={diffIndicators}
                lineDiffType={diffLineDiffType}
                disableLineNumbers={!diffShowLineNumbers}
                disableBackground={!diffShowBackground}
                expandUnchanged={diffExpandUnchanged}
                fontFamily={diffFontFamily || undefined}
                fontSize={diffFontSize || undefined}
                annotations={allAnnotations}
                selectedAnnotationId={selectedAnnotationId}
                scrollTargetAnnotation={scrollTargetAnnotation}
                pendingSelection={pendingSelection}
                reviewBase={
                  (activeDiffBase === 'since-base' || activeDiffBase === 'branch' || activeDiffBase === 'merge-base' || activeDiffBase === 'jj-line' || activeDiffBase === 'jj-evolog')
                    ? committedBase ?? undefined
                    : undefined
                }
                reviewSnapshotId={feedbackDiffContext?.snapshotId}
                onLineSelection={handleLineSelection}
                onAddAnnotationForFile={handleAddAnnotationForFile}
                onEditAnnotation={handleEditAnnotation}
                onSelectAnnotation={handleSelectAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                onAddFileCommentForFile={handleAddFileCommentForFile}
                generatedFiles={generatedFiles}
                expandedGeneratedFiles={expandedGeneratedFiles}
                onGeneratedFileCollapsedChange={handleGeneratedFileCollapsedChange}
                fileScrollTarget={fileScrollTarget}
                searchQuery={isSearchPending ? '' : debouncedSearchQuery}
                searchMatches={searchMatches}
                activeSearchMatchId={activeSearchMatchId}
                activeSearchMatch={activeSearchMatch}
                onVisibleFileChange={handleAllFilesVisibleFileChange}
                fileOrder={allFilesOrder}
                registerCollapseAllToggle={registerAllFilesCollapseToggle}
                onAllCollapsedChange={setAllFilesAllCollapsed}
                isActive={true}
                defaultCollapsed={!!commitInfo}
                leadingContent={leadingContent}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3 max-w-md px-8">
                  <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${diffError ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                    {diffError ? (
                      <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    {diffError ? (
                      <>
                        <h3 className="text-sm font-medium text-destructive">Failed to load diff</h3>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm break-words line-clamp-3">{diffError}</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-sm font-medium text-foreground">No changes</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {activeDiffBase === 'since-base' && `No changes since ${selectedBase || gitContext?.defaultBranch || 'main'}${activeWorktreePath ? ' in this worktree' : ''} — committed, uncommitted, or untracked.`}
                          {showsLocalVsRemoteEmptyState && `Your local branch matches its remote-tracking branch${activeWorktreePath ? ' in this worktree' : ''}.`}
                          {activeDiffBase.startsWith('commit:') && 'This commit has no changes.'}
                          {activeDiffBase === 'uncommitted' && `No uncommitted changes${activeWorktreePath ? ' in this worktree' : ' to review'}.`}
                          {activeDiffBase === 'staged' && "No staged changes. Stage some files with git add."}
                          {activeDiffBase === 'unstaged' && "No unstaged changes. All changes are staged."}
                          {activeDiffBase === 'last-commit' && `No changes in the last commit${activeWorktreePath ? ' in this worktree' : ''}.`}
                          {activeDiffBase === 'jj-current' && "No changes in the current jj change."}
                          {activeDiffBase === 'jj-last' && "No changes in the last jj change."}
                          {activeDiffBase === 'workspace-current' && "No current changes in the workspace repositories."}
                          {activeDiffBase === 'workspace-staged' && "No staged changes in the workspace repositories."}
                          {activeDiffBase === 'workspace-unstaged' && "No unstaged changes in the workspace repositories."}
                          {activeDiffBase === 'workspace-last' && "No changes in the last change across workspace repositories."}
                          {activeDiffBase === 'jj-line' && `No changes in your line of work vs ${selectedBase || gitContext?.defaultBranch || '@-'}.`}
                          {activeDiffBase === 'jj-evolog' && `No changes since evolution ${selectedBase ? selectedBase.slice(0, 8) : 'previous'} — the change looks the same as before.`}
                          {activeDiffBase === 'jj-all' && "No files at the current jj change."}
                          {activeDiffBase === 'gitbutler:workspace' && "No applied GitButler workspace changes."}
                          {activeDiffBase.startsWith('gitbutler:stack:') && "No committed changes in this GitButler stack."}
                          {activeDiffBase.startsWith('gitbutler:branch:') && "No committed changes in this GitButler branch."}
                          {activeDiffBase === 'branch' && `No changes vs ${selectedBase || gitContext?.defaultBranch || 'main'}${activeWorktreePath ? ' in this worktree' : ''}.`}
                          {activeDiffBase === 'merge-base' && `No changes vs ${selectedBase || gitContext?.defaultBranch || 'main'}${activeWorktreePath ? ' in this worktree' : ''}.`}
                          {activeDiffBase === 'all' && `No tracked files${activeWorktreePath ? ' in this worktree' : ' in this repository'}.`}
                        </p>
                      </>
                    )}
                  </div>
                  {((reviewMode === 'workspace' ? workspaceDiffOptions : gitContext?.diffOptions)?.length ?? 0) > 1 && (
                    <p className="text-xs text-muted-foreground/60">
                      Try selecting a different view from the dropdown.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resize Handle + Sidebar */}
          {reviewSidebar.isOpen && (
            <div className="contents group/sidebar">
                              <ResizeHandle {...panelResize.handleProps} className="z-10" side="right" hideHoverTrack tooltip={RESIZE_HANDLE_TOOLTIP} onCollapse={() => reviewSidebar.close()} />
              
              <ReviewSidebar
                annotations={allAnnotations}
                files={files}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={handleSelectAnnotation}
                onNavigateToAnnotation={handleNavigateToAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                onAddGeneralComment={handleAddGeneralComment}
                feedbackMarkdown={feedbackMarkdown}
                width={panelResize.width}
              />
            </div>
          )}
        </div>


        {/* No annotations dialog */}
        <ConfirmDialog
          isOpen={showNoAnnotationsDialog}
          onClose={() => setShowNoAnnotationsDialog(false)}
          title="No Annotations"
          message="You haven't made any annotations yet. There's nothing to copy."
          variant="info"
        />

        {/* Compact/touch decision surfaces: the note composer is a dialog
            (never a textarea inside the scrolling header menu popup), the
            discard confirm is the same ConfirmDialog the desktop control
            raises. Desktop popover state lives inside DecisionControl. */}
        {compactComposerItem?.composer && (
          <DecisionNoteDialog
            isOpen
            onClose={() => setCompactDecisionComposer(null)}
            composer={compactComposerItem.composer}
            subtitle={compactComposerItem.subtitle}
            disabled={busyWithDecision || !!submitted}
            onSubmit={(note) => {
              const item = compactComposerItem;
              setCompactDecisionComposer(null);
              runReviewDecisionAction(item.id, note);
            }}
          />
        )}
        {compactConfirmItem?.confirm && (
          <ConfirmDialog
            isOpen
            onClose={() => setCompactDecisionConfirm(null)}
            onConfirm={() => {
              const item = compactConfirmItem;
              setCompactDecisionConfirm(null);
              runReviewDecisionAction(item.id);
            }}
            title={compactConfirmItem.confirm.title}
            message={compactConfirmItem.confirm.message}
            confirmText={compactConfirmItem.confirm.confirmText}
            cancelText="Cancel"
            variant="warning"
            showCancel
          />
        )}
        {/* Completion overlay - shown after approve/feedback/exit */}
        <CompletionOverlay
          submitted={submitted}
          title={
            submitted === 'approved' ? 'Changes Approved'
            : submitted === 'exited' ? 'Session Closed'
            : 'Feedback Sent'
          }
          subtitle={
            submitted === 'exited'
              ? 'Review session closed without feedback.'
              : submitted === 'approved'
                ? `${getAgentName(origin)} will proceed with the changes.`
                : `${getAgentName(origin)} will address your review feedback.`
          }
          agentLabel={getAgentName(origin)}
        />

      </div>

      {lineAnnotationComposeRequest && (() => {
        const targetFile = files.find(file => file.path === lineAnnotationComposeRequest.filePath);
        if (!targetFile) return null;
        return (
          <ExternalLineAnnotationComposer
            key={lineAnnotationComposeRequest.id}
            request={lineAnnotationComposeRequest}
            file={targetFile}
            onLineSelection={handleLineSelection}
            onAddAnnotationForFile={handleAddAnnotationForFile}
            onEditAnnotation={handleEditAnnotation}
          />
        );
      })()}

    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          '--normal-bg': 'var(--card)',
          '--normal-border': 'var(--border)',
          '--normal-text': 'var(--foreground)',
        } as React.CSSProperties,
      }}
    />
    </TooltipProvider>
    </ThemeProvider>
  );};

// Spec 03 step 5: Phosphor's default weight ("regular") is the app-wide
// default for every icon rendered under this root. Set once here instead of
// repeating `weight="regular"` at each call site; only a control that
// deliberately deviates overrides it per-call.
const ReviewApp: React.FC = () => (
  <IconContext.Provider value={{ weight: 'regular' }}>
    <ReviewAppInner />
  </IconContext.Provider>
);

export default ReviewApp;
