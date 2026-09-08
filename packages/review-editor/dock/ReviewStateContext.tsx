import React, { createContext, useContext } from 'react';
import type { CallFlowAnnotationTarget, CodeAnnotation, CodeAnnotationType, SelectedLineRange, TokenAnnotationMeta, ConventionalLabel, ConventionalDecoration, Annotation, CommentAnnotation, ArtifactAnnotationMeta, ImageAttachment } from '@hypermark/ui/types';
import type { DiffFile, AnnotationScrollTarget } from '../types';
import type { ReviewSearchMatch } from '../utils/reviewSearch';
import type { PRMetadata, PRContext } from '@hypermark/shared/pr-types';
import type { PRArtifact } from '../utils/prArtifacts';
import type { PRDiffScope } from '@hypermark/shared/pr-stack';
import type { FeedbackDiffContext } from '../utils/exportFeedback';
import type { SuggestionHunk } from '../edit/deriveSuggestions';
import type { EditSelectionComment } from '../edit/useEditSession';
import type { CallFlowAnalysisState } from '../hooks/useCallFlowAnalysis';
import type { CallFlowInstallController } from '../hooks/useCallFlowInstall';
import type { CallFlowAdvert, CallFlowNode } from '@hypermark/shared/call-flow-types';

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
  /** Compact touch shells use a session-only style so desktop preferences stay untouched. */
  onDiffStyleChange: (style: 'split' | 'unified') => void;
  /** True only for coarse-pointer phone/tablet layouts, never narrow desktop windows. */
  isCompactTouchLayout: boolean;
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
  /** PR/MR review scope label, e.g. "Layer diff" or "Full stack diff". */
  prReviewScope?: string;
  prDiffScope?: PRDiffScope;
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
  /** Commit one Call Flow comment with a primary inline anchor and related targets. */
  onAddCallFlowAnnotation: (
    targets: readonly CallFlowAnnotationTarget[],
    text: string,
  ) => boolean;
  onAddAnnotation: (type: CodeAnnotationType, text?: string, suggestedCode?: string, originalCode?: string, conventionalLabel?: ConventionalLabel, decorations?: ConventionalDecoration[], tokenMeta?: TokenAnnotationMeta, images?: ImageAttachment[]) => void;
  onAddAnnotationForFile: (filePath: string, type: CodeAnnotationType, text?: string, suggestedCode?: string, originalCode?: string, conventionalLabel?: ConventionalLabel, decorations?: ConventionalDecoration[], tokenMeta?: TokenAnnotationMeta, images?: ImageAttachment[]) => void;
  /** EXPERIMENTAL edit-to-suggestion flag (cookie setting, default OFF). */
  editSuggestionsEnabled: boolean;
  /** Sink for suggestions derived from a completed edit session (one hunk per
   * contiguous changed region; becomes normal suggestion annotations). */
  onAddSuggestionsForFile: (filePath: string, hunks: SuggestionHunk[]) => void;
  /** Sink for a comment authored through the edit session's Selection Action
   * ("Make annotation"): line-scoped comment on pristine new-side lines. */
  onAddEditorCommentForFile: (filePath: string, comment: EditSelectionComment) => void;
  onAddFileComment: (text: string) => void;
  onAddFileCommentForFile: (filePath: string, text: string) => void;
  onEditAnnotation: (id: string, text?: string, suggestedCode?: string, originalCode?: string, conventionalLabel?: ConventionalLabel | null, decorations?: ConventionalDecoration[], images?: ImageAttachment[]) => void;
  /** Highlight a comment without moving the viewport (in-diff click). */
  onSelectAnnotation: (id: string | null) => void;
  /** Select AND scroll the diff to a comment (sidebar / findings-list click). */
  onNavigateToAnnotation: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;

  // PR description prose annotations (comment-only; text-anchored Annotation[],
  // kept separate from the diff CodeAnnotation[] above).
  descriptionAnnotations: Annotation[];
  selectedDescriptionAnnotationId: string | null;
  onAddDescriptionAnnotation: (ann: Annotation) => void;
  onSelectDescriptionAnnotation: (id: string | null) => void;
  onDeleteDescriptionAnnotation: (id: string) => void;

  // PR comment annotations (notes attached to a whole comment/review/thread).
  commentAnnotations: CommentAnnotation[];
  selectedCommentAnnotationId: string | null;
  onAddCommentAnnotation: (
    commentId: string,
    commentAuthor: string,
    commentBody: string,
    text: string,
    options?: { id?: string; artifact?: ArtifactAnnotationMeta },
  ) => void;
  onSelectCommentAnnotation: (id: string | null) => void;
  onDeleteCommentAnnotation: (id: string) => void;
  /** Sidebar-initiated "reveal this comment" signal (token bumps per click). */
  commentScrollTarget: { commentId: string; token: number } | null;

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
  activeFileSearchMatches: ReviewSearchMatch[];
  activeSearchMatchId: string | null;
  activeSearchMatch: ReviewSearchMatch | null;
  // All-files (CodeView) search surface: the full match set + the unfiltered
  // active match (activeSearchMatch above is filtered to the single-file panel).
  searchMatches: ReviewSearchMatch[];
  allFilesActiveSearchMatch: ReviewSearchMatch | null;

  // PR
  prMetadata: PRMetadata | null;
  prContext: PRContext | null;
  /** Viewable attachments harvested from the current hosted PR/MR context. */
  prArtifacts: readonly PRArtifact[];
  isPRContextLoading: boolean;
  prContextError: string | null;
  fetchPRContext: () => void;
  platformUser: string | null;

  // Diff navigation
  openDiffFile: (filePath: string) => void;
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
  semanticDiffAvailable: boolean;
  isSemanticDiffActive: boolean;
  onSemanticDiffUnavailable: () => void;
  onSemanticDiffLoadError: () => boolean;
  onSemanticDiffLoadSuccess: () => void;
  callFlowAvailable: boolean;
  callFlowAdvert: CallFlowAdvert;
  callFlowAnalysis: CallFlowAnalysisState;
  retryCallFlowAnalysis: () => void;
  /** Whether the complete node range exists in the currently reviewed patch. */
  isCallFlowNodeInPatch: (node: CallFlowNode) => boolean;
  isCallFlowActive: boolean;
  openCallFlowPanel: () => void;
  /** Opt-in runtime install controller backing the Dock's install funnel. */
  callFlowInstall: CallFlowInstallController;

  // Code navigation
  onCodeNavRequest?: (request: import('@hypermark/shared/code-nav').CodeNavRequest) => void;
  /** Token hover cards. Undefined whenever the gate or the setting is off. */
  onTokenHoverEnter?: (
    props: import('@pierre/diffs').DiffTokenEventBaseProps,
    filePath: string,
  ) => void;
  onTokenHoverLeave?: () => void;
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
