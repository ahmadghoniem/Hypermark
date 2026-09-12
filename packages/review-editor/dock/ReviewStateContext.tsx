import React, { createContext, useContext } from 'react';
import type { CodeAnnotation, CodeAnnotationType, SelectedLineRange, TokenAnnotationMeta, ImageAttachment } from '@hypermark/ui/types';
import type { DiffFile, AnnotationScrollTarget } from '../types';
import type { ReviewSearchMatch } from '../utils/reviewSearch';
import type { FeedbackDiffContext } from '../utils/exportFeedback';

/** One-shot request to open the native code-annotation composer on a source range. */
export interface LineAnnotationComposeRequest {
  readonly id: number;
  readonly filePath: string;
  readonly range: SelectedLineRange;
}

/**
 * Shared review state consumed by dockview panel wrappers.
 *
 * App.tsx owns all this state — the context just makes it accessible
 * to panels registered in dockview's static component map (which can't
 * receive arbitrary props from a parent).
 */
export interface ReviewState {
  // Files & diff
  files: DiffFile[];
  rawPatch: string;
  focusedFileIndex: number;
  focusedFilePath: string | null;
  diffStyle: 'split' | 'unified';
  onDiffStyleChange: (style: 'split' | 'unified') => void;
  diffOverflow?: 'scroll' | 'wrap';
  diffIndicators?: 'bars' | 'classic' | 'none';
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none';
  disableLineNumbers?: boolean;
  disableBackground?: boolean;
  expandUnchanged?: boolean;
  fontFamily?: string;
  fontSize?: string;
  /** User-selected base branch; feeds the `base` query param on file-content fetches. */
  reviewBase?: string;
  /** Active diff mode (e.g. "branch", "merge-base", "uncommitted"). Used as
   *  part of the DiffViewer remount key so mode switches invalidate cached
   *  file content — branch and merge-base compute different "old" sides. */
  activeDiffBase?: string;
  /** Diff context baked into exported feedback so downstream consumers
   * produce the same markdown the main feedback path sends. */
  feedbackDiffContext?: FeedbackDiffContext;
  /** Agent working directory — base for resolving repo-relative diff paths to
   *  absolute (e.g. for the Open-in-app control). */
  agentCwd?: string | null;
  /** Whether live-working-tree actions match the snapshot currently shown. */
  canUseLiveWorkspaceActions?: boolean;

  // Annotations
  allAnnotations: CodeAnnotation[];
  externalAnnotations: CodeAnnotation[];
  selectedAnnotationId: string | null;
  /** Sidebar-initiated scroll-to-comment signal; the token re-fires per click.
   *  Selecting a comment in the diff does NOT set this, so it never scrolls. */
  scrollTargetAnnotation: AnnotationScrollTarget | null;
  pendingSelection: SelectedLineRange | null;
  onLineSelection: (range: SelectedLineRange | null) => void;
  /** Resolve a source path and open the native line-annotation composer. */
  onRequestLineAnnotation: (filePath: string, range: SelectedLineRange) => void;
  onAddAnnotation: (type: CodeAnnotationType, text?: string, tokenMeta?: TokenAnnotationMeta, images?: ImageAttachment[]) => void;
  onAddAnnotationForFile: (filePath: string, type: CodeAnnotationType, text?: string, tokenMeta?: TokenAnnotationMeta, images?: ImageAttachment[]) => void;
  onAddFileComment: (text: string) => void;
  onAddFileCommentForFile: (filePath: string, text: string) => void;
  onEditAnnotation: (id: string, text?: string, images?: ImageAttachment[]) => void;
  /** Highlight a comment without moving the viewport (in-diff click). */
  onSelectAnnotation: (id: string | null) => void;
  /** Select AND scroll the diff to a comment (sidebar / findings-list click). */
  onNavigateToAnnotation: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;

  // Viewed / staged
  viewedFiles: Set<string>;
  onToggleViewed: (filePath: string) => void;
  // Generated files (#1317): paths marked `linguist-generated` in
  // `.gitattributes` (server sidecar). Collapsed by default on the all-files
  // surface; headers show a "generated" tag. Presentation-only view state.
  generatedFiles: Set<string>;
  /** Generated files the user explicitly expanded — session-local, survives
   *  panel remounts. */
  expandedGeneratedFiles: Set<string>;
  onGeneratedFileCollapsedChange: (filePath: string, collapsed: boolean) => void;
  /** Cookie-only chrome preference (#1277): hide the Viewed controls everywhere
   *  they render. Shortcuts and viewed state itself are unaffected. */
  showViewedControls: boolean;
  /** Read-side staged set from the server's status sidecar — display only. */
  stagedFiles: Set<string>;
  /** Worktree path parsed from the live diffType when it's a
   *  `worktree:<path>:<subType>` string; null for the main tree and PR mode.
   *  Feeds jobMatchesReviewContext's third argument so context
   *  matching is worktree-aware (populated from App.tsx's
   *  activeWorktreePath memo — the same parse that drives the sections/tree
   *  UI, so context matching aligns with what's on screen). */
  currentWorktreePath?: string | null;

  // Search
  searchQuery: string;
  isSearchPending: boolean;
  debouncedSearchQuery: string;
  activeSearchMatchId: string | null;
  activeSearchMatch: ReviewSearchMatch | null;
  // All-files (CodeView) search surface: the full match set + the unfiltered
  // active match.
  searchMatches: ReviewSearchMatch[];
  allFilesActiveSearchMatch: ReviewSearchMatch | null;

  // Diff navigation
  openDiffFile: (filePath: string) => void;
  fileScrollTarget: { filePath: string; token: number } | null;
  onAllFilesVisibleFileChange: (filePath: string | null, info?: { collapsed: boolean }) => void;
  /** Auto-mark-viewed: the reader moved on from this file (see useAutoViewed). */
  onAllFilesFileScrolledPast: (filePath: string) => void;
  isAllFilesActive: boolean;
  // Which left panel drives the all-files item order ('list' = sections order).
  allFilesOrder: 'tree' | 'list';
  // All-files collapse-all toggle — the AllFilesCodeView registers its handler
  // here; the dock header's button (ReviewDockRightActions) invokes it.
  allFilesAllCollapsed: boolean;
  onToggleAllFilesCollapsed: () => void;
  registerAllFilesCollapseToggle: (toggle: (() => void) | null) => void;
  onAllFilesCollapsedChange: (collapsed: boolean) => void;
  // Commit metadata when a commit:<sha> diff is active — heads the all-files
  // view (description card) and seeds its files collapsed.
  commitInfo: import('@hypermark/shared/types').CommitDiffInfo | null;

  // Code navigation
  onCodeNavRequest?: (request: import('@hypermark/shared/code-nav').CodeNavRequest) => void;
  codeNavResult: import('@hypermark/shared/code-nav').CodeNavResponse | null;
  codeNavIsLoading: boolean;
  codeNavActiveSymbol: string | null;
}

const ReviewStateContext = createContext<ReviewState | null>(null);

export function ReviewStateProvider({
  value,
  children,
}: {
  value: ReviewState;
  children: React.ReactNode;
}) {
  return (
    <ReviewStateContext.Provider value={value}>
      {children}
    </ReviewStateContext.Provider>
  );
}

export function useReviewState(): ReviewState {
  const ctx = useContext(ReviewStateContext);
  if (!ctx) throw new Error('useReviewState must be used within ReviewStateProvider');
  return ctx;
}

/** Like useReviewState but returns null instead of throwing — for components that may render outside the provider. */
export function useReviewStateOptional(): ReviewState | null {
  return useContext(ReviewStateContext);
}
