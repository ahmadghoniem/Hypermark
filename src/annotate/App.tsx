// Eager renderer registration (side-effect imports, evaluated before every
// other module below). These keep Hypermark's first paint and failure surface
// byte-identical now that @hypermark/ui loads KaTeX and the Mermaid runtime
// lazily for hosts: math is typeset on the first commit, and Mermaid stays
// in this app's entry chunk (the review editor never renders Mermaid and does
// not import that entry). Guarded by tests/entry-assets.test.ts; do not drop
// or reorder any of these lines.
import '@/ui/utils/math-eager';
import '@/ui/utils/mermaid-eager';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { toast, Toaster } from 'sonner';
import { type Origin, getAgentName } from '@/shared/agents';
import { shouldStripFrontmatter } from '@/shared/annotatable';
import { setExtraMarkdownExtensions } from '@/ui/utils/markdownExtensions';
import { wrapFeedbackForClipboard, type AnnotateFeedbackTemplates } from '@/shared/feedback-templates';
import { parseMarkdownToBlocks, extractFrontmatter, type LinkedDocAnnotationEntry, type MessageAnnotationEntry } from '@/ui/utils/parser';
import { Viewer, ViewerHandle } from '@/ui/components/Viewer';
import { HtmlViewer } from '@/ui/components/html-viewer';
import { AnnotationPanel, type AnnotationScope, type AnnotationMessageGroup } from '@/ui/components/AnnotationPanel';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { Annotation, AnnotationType, type CodeAnnotation, type InputMethod, type ImageAttachment, type ActionsLabelMode } from '@/ui/types';
import { ThemeProvider } from '@/ui/components/ThemeProvider';
import { TooltipProvider } from '@/ui/components/Tooltip';
import { AnnotationToolstrip } from '@/ui/components/AnnotationToolstrip';
import { StickyHeaderLane } from '@/ui/components/StickyHeaderLane';
import { useActiveSection } from '@/ui/hooks/useActiveSection';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { configStore } from '@/ui/config';
import { CompletionOverlay } from '@/ui/components/CompletionOverlay';
import { getUIPreferences } from '@/ui/utils/uiPreferences';
import { getInputMethod, saveInputMethod } from '@/ui/utils/inputMethod';
import { getHtmlChromeState, saveHtmlChromeState } from '@/ui/utils/htmlChrome';
import { OverlayScrollArea } from '@/ui/components/OverlayScrollArea';
import { ScrollViewportProvider } from '@/ui/hooks/useScrollViewport';
import { useOverlayViewport } from '@/ui/hooks/useOverlayViewport';
import { useIsMobile } from '@/ui/hooks/useIsMobile';
import { useViewportEnvironment } from '@/ui/hooks/useViewportEnvironment';
import type { SidebarTab } from '@/ui/hooks/useSidebar';
import { usePlanDiff, type VersionInfo, type VersionEntry, type PlanDiffFetchers } from '@/ui/hooks/usePlanDiff';
import { useLinkedDoc, type LinkedDocSessionState } from '@/ui/hooks/useLinkedDoc';
import { useCodeFilePopout } from '@/ui/hooks/useCodeFilePopout';
import { useAnnotationDraft } from '@/ui/hooks/useAnnotationDraft';
import { useSessionEndedStream } from '@/ui/hooks/useSessionEndedStream';
import { useUndoHistory } from '@/ui/hooks/useUndoHistory';
import { generateId } from '@/ui/utils/generateId';
import { SidebarContainer } from '@/ui/components/sidebar/SidebarContainer';
import { MessageRail, type PickerMessage } from '@/ui/components/MessageRail';

/** Distance from the document scroller's right edge to the message rail: the
 *  11px native scrollbar plus the rail's own 12px gutter, reserved whether the
 *  scrollbar is drawn or not so the rail never moves between messages. */
const MESSAGE_RAIL_INSET = 24;
import { PlanDiffViewer } from '@/ui/components/plan-diff/PlanDiffViewer';
import { CodeFilePopout, type CodeFileAnnotationInput } from '@/ui/components/CodeFilePopout';
import type { PlanDiffMode } from '@/ui/components/plan-diff/PlanDiffModeSwitcher';
import { observeActionsLabelMode } from './utils/actionsLabelMode';
// Demo content toggle. Default: the original Real-time Collaboration plan.
// Opt-in diff-engine stress test: `VITE_DIFF_DEMO=1 bun run dev:hook` swaps
// in the 20-case Auth Service Refactor test plan. dev-mock-api.ts reads the
// same env var on the server side so V2/V3 stay paired.
import { DEMO_PLAN_CONTENT as DEFAULT_DEMO_PLAN_CONTENT } from './demoPlan';
import { DIFF_DEMO_PLAN_CONTENT } from './demoPlanDiffDemo';
import {
  useAnnotateSidebarShortcuts,
  useHtmlAnnotateShortcuts,
  useHistoryShortcuts,
} from '@/ui/shortcuts';
import {
  applyCollectionMutation,
  hasActiveHistoryOverlay,
  isNativeHistoryOwner,
  syncHistoryHighlight,
  type CollectionMutation,
  type HistoryDirection,
} from '@/ui/utils/undoHistory';
const USE_DIFF_DEMO =
  import.meta.env.VITE_DIFF_DEMO === '1' ||
  import.meta.env.VITE_DIFF_DEMO === 'true';
const DEMO_PLAN_CONTENT = USE_DIFF_DEMO
  ? DIFF_DEMO_PLAN_CONTENT
  : DEFAULT_DEMO_PLAN_CONTENT;
import {
  useCheckboxOverrides,
  type CheckboxOverrideSnapshot,
  type CheckboxToggleMutation,
} from './hooks/useCheckboxOverrides';
import {
  usePlanDiffNavigationAutoExit,
  usePlanDiffViewAutoExit,
} from './hooks/usePlanDiffViewAutoExit';
import { AppHeader } from './components/AppHeader';
import { useAnnotateHtmlRefresh, type HtmlRefreshedDocument } from './hooks/useAnnotateHtmlRefresh';
type AnnotateFeedbackTarget = {
  fileHeader: 'File' | 'Folder';
  filePath: string;
};
import {
  buildAnnotateApprovalBody,
  buildCompleteAnnotateFeedback,
} from './utils/annotateSubmission';
import { buildDecisionSpec, type DecisionActionId } from '@/ui/utils/decisionSpec';
import { type DecisionHandler } from '@/ui/components/DecisionControl';
import { resolveAnnotateDecisionAction } from './annotateDecision';
import {
  openAnnotateClientLeaseStream,
  shouldConnectAnnotateClientLease,
  type AnnotateClientLeaseConfig,
} from './annotateClientLease';

type MessageAnnotationState = {
  messageId: string;
  text: string;
  timestamp?: string;
  linkedDocSession: LinkedDocSessionState;
  codeAnnotations: CodeAnnotation[];
  selectedCodeAnnotationId: string | null;
};

const countLinkedDocSessionAnnotations = (session: LinkedDocSessionState): number => {
  let total =
    session.root.annotations.length +
    session.root.globalAttachments.length;
  for (const doc of session.docs.values()) {
    total += doc.annotations.length + doc.globalAttachments.length;
  }
  return total;
};

const countMessageAnnotations = (state: MessageAnnotationState): number =>
  countLinkedDocSessionAnnotations(state.linkedDocSession) +
  state.codeAnnotations.length;

const createEmptyMessageState = (message: PickerMessage): MessageAnnotationState => ({
  messageId: message.messageId,
  text: message.text,
  timestamp: message.timestamp,
  linkedDocSession: {
    root: {
      markdown: message.text,
      renderAs: 'markdown',
      rawHtml: '',
      annotations: [],
      selectedAnnotationId: null,
      globalAttachments: [],
    },
    docs: new Map(),
  },
  codeAnnotations: [],
  selectedCodeAnnotationId: null,
});

const normalizeMessageState = (
  state: MessageAnnotationState,
  message: PickerMessage,
): MessageAnnotationState => ({
  ...state,
  text: message.text,
  timestamp: message.timestamp,
  linkedDocSession: {
    root: {
      ...state.linkedDocSession.root,
      // The root document for a message is immutable and comes from the picker.
      // Keep it as the source of truth so transient UI state cannot cache an
      // empty markdown value for a message.
      markdown: message.text,
      renderAs: state.linkedDocSession.root.renderAs ?? 'markdown',
      rawHtml: state.linkedDocSession.root.rawHtml ?? '',
    },
    docs: new Map(state.linkedDocSession.docs),
  },
});

const buildMessageAnnotationCounts = (
  states: Map<string, MessageAnnotationState>
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const [messageId, state] of states) {
    const count = countMessageAnnotations(state);
    if (count > 0) counts.set(messageId, count);
  }
  return counts;
};

interface HistorySelection {
  annotationId: string | null;
  codeAnnotationId: string | null;
}

type DocumentHistoryAction =
  | {
      kind: 'annotation';
      mutation: CollectionMutation<Annotation>;
      beforeSelection: HistorySelection;
      afterSelection: HistorySelection;
    }
  | {
      kind: 'code-annotation';
      mutation: CollectionMutation<CodeAnnotation>;
      beforeSelection: HistorySelection;
      afterSelection: HistorySelection;
    }
  | {
      kind: 'checkbox';
      mutation: CheckboxToggleMutation;
      beforeSelection: HistorySelection;
      afterSelection: HistorySelection;
    };

const itemId = <T extends { id: string }>(item: T): string => item.id;

function annotationOwnsHighlight(annotation: Annotation): boolean {
  return !annotation.diffContext
    && annotation.type !== AnnotationType.GLOBAL_COMMENT
    && !annotation.id.startsWith('ann-checkbox-');
}

const AppInner: React.FC = () => {
  useViewportEnvironment();
  const [markdown, setMarkdown] = useState(DEMO_PLAN_CONTENT);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  const [codeAnnotations, setCodeAnnotations] = useState<CodeAnnotation[]>([]);
  const codeAnnotationsRef = useRef(codeAnnotations);
  codeAnnotationsRef.current = codeAnnotations;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedCodeAnnotationId, setSelectedCodeAnnotationId] = useState<string | null>(null);
  const selectionRef = useRef<HistorySelection>({ annotationId: null, codeAnnotationId: null });
  selectionRef.current = { annotationId: selectedAnnotationId, codeAnnotationId: selectedCodeAnnotationId };
  const restoreCheckboxOverridesRef = useRef<(snapshot: CheckboxOverrideSnapshot) => void>(() => {});
  const checkboxSelectionBeforeRef = useRef<HistorySelection | null>(null);
  const displayedMarkdown = markdown;
  const [sourceFilePath, setSourceFilePath] = useState<string | undefined>();
  // Mirrors linkedDocHook.filepath (declared later) so the parse memos below
  // can key frontmatter behavior off the ACTIVE document's path. Kept in sync
  // by an effect after the hook is created.
  const [linkedDocParsePath, setLinkedDocParsePath] = useState<string | null>(null);
  const activeParseDocPath = linkedDocParsePath ?? sourceFilePath;
  // Frontmatter stripping is a markdown convention — for non-markdown
  // annotatable sources (.yaml/.txt/…) a leading `--- … ---` pair is real
  // content (multi-document YAML), so it must survive parsing.
  const parseFrontmatter = shouldStripFrontmatter(activeParseDocPath);
  const parseFrontmatterRef = useRef(parseFrontmatter);
  useEffect(() => {
    parseFrontmatterRef.current = parseFrontmatter;
  }, [parseFrontmatter]);
  const frontmatter = useMemo(
    () => (parseFrontmatter ? extractFrontmatter(displayedMarkdown).frontmatter : null),
    [displayedMarkdown, parseFrontmatter],
  );
  const blocks = useMemo(
    () => parseMarkdownToBlocks(displayedMarkdown, { frontmatter: parseFrontmatter }),
    [displayedMarkdown, parseFrontmatter],
  );
  // The decision-control note flow (#1436 mechanism): the note is committed
  // into `annotations` as a GLOBAL_COMMENT and submitted one render later,
  // because the payload builders close over `allAnnotations`. The route is
  // captured at menu-choice time — re-deriving it after the commit would see
  // the note itself and misroute a gate "Approve with a note" to feedback.
  // L3: cleared only on submission SUCCESS — a failed POST keeps the captured
  // route/framing armed so a retry cannot silently reframe the decision.
  // `dispatched` marks the one automatic submit after the commit lands;
  // after a failure, retries go through the primary.
  const [pendingDecisionSubmit, setPendingDecisionSubmit] = useState<{
    noteId: string;
    route: 'feedback' | 'approve';
    approvalFraming: boolean;
    dispatched: boolean;
  } | null>(null);
  // The keydown effects mount above the decision callbacks; call through a
  // render-assigned ref (same pattern as headerHandlersRef) so keyboard and
  // header share literally one submitPrimaryDecision.
  const submitPrimaryDecisionRef = useRef<() => void>(() => {});
  // The annotations panel is permanent on desktop. This state is the MOBILE
  // drawer only: it opens when a comment is selected and closes on its own X.
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [inputMethod, setInputMethod] = useState<InputMethod>(getInputMethod);
  const [uiPrefs] = useState(() => getUIPreferences());

  // Plan-area width (inside the OverlayScrollArea, after sidebar/panel
  // shrinkage) drives the action button label compactness. ResizeObserver
  // fires every frame during a resize drag, so we store only the BUCKET
  // ('full' | 'short' | 'icon') in state — App.tsx then re-renders at
  // most twice across an entire drag (once per threshold crossing) instead
  // of on every pixel, which would chug the whole tree.
  //
  //   full  → "Global comment" / "Copy plan"  — fits when planArea >= 800
  //   short → "Comment" / "Copy"              — fits when planArea >= 680
  //   icon  → labels hidden                    — fallback below that
  const planAreaRef = useRef<HTMLDivElement>(null);
  const [actionsLabelMode, setActionsLabelMode] = useState<ActionsLabelMode>('full');
  const [isApiMode, setIsApiMode] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  // Legacy, read-only: the toolbar Images action and the
  // document-level paste handler that used to write here are gone. This stays
  // at [] for the life of a session — restore-time normalization folds any
  // stored top-level images into a GLOBAL_COMMENT annotation instead — and is
  // only still threaded through useLinkedDoc/useAnnotationDraft/export
  // payload shapes that read it.
  const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
  const [gate, setGate] = useState(false);
  const [approvalNotesSupported, setApprovalNotesSupported] = useState(false);
  const [clientLease, setClientLease] = useState<AnnotateClientLeaseConfig | null>(null);
  const [annotateSource, setAnnotateSource] = useState<'file' | 'message' | null>(null);
  const [recentMessages, setRecentMessages] = useState<PickerMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [annotationScope, setAnnotationScope] = useState<AnnotationScope>('this');
  const [pendingAnnotationSelection, setPendingAnnotationSelection] = useState<string | null>(null);
  const messageStateCacheRef = useRef<Map<string, MessageAnnotationState>>(new Map());
  const [cachedMessageAnnotationCounts, setCachedMessageAnnotationCounts] = useState<Map<string, number>>(new Map());
  const [sourceInfo, setSourceInfo] = useState<string | undefined>();
  // Server-resolved annotate copy-wrapper templates (config-aware) so
  // clipboard Copy matches Send Feedback instead of the plan-deny wrap (#1107).
  const [feedbackTemplates, setFeedbackTemplates] = useState<AnnotateFeedbackTemplates | null>(null);
  const [sourceConverted, setSourceConverted] = useState(false);
  const [renderAs, setRenderAs] = useState<'markdown' | 'html'>('markdown');
  // HTML plans render edge-to-edge (full-viewport) instead of in the centered,
  // card-chromed markdown column. Branch the document-area containers on this.
  const isHtmlSurface = renderAs === 'html';
  const [rawHtml, setRawHtml] = useState('');
  const [htmlDiffHtml, setHtmlDiffHtml] = useState<string | null>(null);
  // Interact/Annotate mode for HTML surfaces. Armed = the bridge
  // captures clicks for pinpoint annotation; disarmed (Interact) = clicks are
  // fully native while committed markers stay visible/clickable and text
  // drag-selection commenting stays live. Session-only, never persisted.
  // Esc (or the header pen) drops to Interact.
  const [htmlAnnotateArmed, setHtmlAnnotateArmed] = useState(true);
  const handleHtmlAnnotateToggle = useCallback(() => setHtmlAnnotateArmed((v) => !v), []);
  const handleHtmlAnnotateExit = useCallback(() => setHtmlAnnotateArmed(false), []);
  // Session-level force-markdown preference (`--markdown`). When set, folder/linked HTML
  // files are converted instead of rendered raw — threaded into /api/doc as &convert=1.
  const [convertHtml, setConvertHtml] = useState(false);
  // Gate for the chrome-persistence writer: only start saving once the persisted
  // state has been applied, so a pre-restore render can't clobber the cookie.
  const htmlChromeRestoredRef = useRef(false);
  // The restore's own commit still renders pre-restore values; the writer
  // consumes this flag to skip that exact run (see the save effect).
  const skipNextHtmlChromeSaveRef = useRef(false);
  // Header "Hide tools": removes ALL floating chrome over the page (sidebar
  // tongue tabs + comment/attachments cluster) from the DOM. The header
  // button itself is the way back, so hidden state can never strand.
  const [htmlToolsHidden, setHtmlToolsHidden] = useState(false);
  const [imageBaseDir, setImageBaseDir] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [submitted, setSubmitted] = useState<'approved' | 'denied' | 'exited' | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ display: string; branch?: string; host?: string } | null>(null);
  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Hypermark` : "Hypermark";
  }, [repoInfo]);

  const [isPlanDiffActive, setIsPlanDiffActive] = useState(false);
  const [planDiffMode, setPlanDiffMode] = useState<PlanDiffMode>('clean');
  const [previousPlan, setPreviousPlan] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const isMobile = useIsMobile();
  const effectiveInputMethod = inputMethod;

  const viewerRef = useRef<ViewerHandle>(null);
  const historyContext = [
    annotateSource ?? 'plan',
    selectedMessageId ?? 'message',
    linkedDocParsePath ?? sourceFilePath ?? 'root',
  ].join(':');
  const applyDocumentHistory = useCallback((action: DocumentHistoryAction, direction: HistoryDirection) => {
    if (action.kind === 'checkbox') {
      const snapshot = direction === 'undo'
        ? action.mutation.beforeOverrides
        : action.mutation.afterOverrides;
      const checkboxAnnotations = direction === 'undo'
        ? action.mutation.beforeAnnotations
        : action.mutation.afterAnnotations;
      restoreCheckboxOverridesRef.current(snapshot);
      setAnnotations((current) => {
        const withoutBlockAnnotations = current.filter((annotation) =>
          annotation.blockId !== action.mutation.blockId
          || !annotation.id.startsWith('ann-checkbox-')
        );
        const next = checkboxAnnotations.reduce(
          (items, entry) => applyCollectionMutation(
            items,
            { kind: 'add', item: entry.annotation, index: entry.index },
            'redo',
            itemId,
          ),
          withoutBlockAnnotations,
        );
        annotationsRef.current = next;
        return next;
      });
      const selection = direction === 'undo' ? action.beforeSelection : action.afterSelection;
      setSelectedAnnotationId(selection.annotationId);
      setSelectedCodeAnnotationId(selection.codeAnnotationId);
      selectionRef.current = selection;
      return;
    }

    const selection = direction === 'undo' ? action.beforeSelection : action.afterSelection;
    if (action.kind === 'code-annotation') {
      setCodeAnnotations((current) => {
        const next = applyCollectionMutation(current, action.mutation, direction, itemId);
        codeAnnotationsRef.current = next;
        return next;
      });
    } else {
      setAnnotations((current) => {
        const next = applyCollectionMutation(current, action.mutation, direction, itemId);
        annotationsRef.current = next;
        return next;
      });
      const annotation = action.mutation.kind === 'edit'
        ? (direction === 'undo' ? action.mutation.before : action.mutation.after)
        : action.mutation.item;
      const shouldPaint = annotationOwnsHighlight(annotation)
        && ((action.mutation.kind === 'add' && direction === 'redo')
          || (action.mutation.kind === 'delete' && direction === 'undo')
          || action.mutation.kind === 'edit');
      if (annotationOwnsHighlight(annotation)) {
        syncHistoryHighlight(viewerRef.current, annotation, shouldPaint);
      }
    }
    setSelectedAnnotationId(selection.annotationId);
    setSelectedCodeAnnotationId(selection.codeAnnotationId);
    selectionRef.current = selection;
  }, []);
  const annotationHistory = useUndoHistory<DocumentHistoryAction>({
    context: historyContext,
    apply: applyDocumentHistory,
  });
  useEffect(() => {
    if (submitted) annotationHistory.clear();
  }, [annotationHistory, submitted]);
  // Desktop uses the main document element as its native scroll viewport.
  // Compact coarse-pointer browsers use the page scroller so Mobile Safari
  // receives the document scroll gesture it requires to collapse its chrome.
  const {
    viewport: scrollViewport,
    onViewportReady: handleViewportReady,
  } = useOverlayViewport();
  const mainViewportRef = useRef<HTMLElement | null>(null);
  const handleDocumentViewportReady = useCallback((next: HTMLElement | null) => {
    mainViewportRef.current = next;
    handleViewportReady(next);
  }, [handleViewportReady]);

  useEffect(() => {
    if (!mainViewportRef.current) return;
    handleViewportReady(mainViewportRef.current);
  }, [handleViewportReady]);

  // Sidebar (shared TOC + Version Browser). It is a permanent column on
  // desktop — neither collapsible nor resizable — so the only state left is
  // which of the two panes it shows.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('toc');

  const openSidebarTab = useCallback((tab?: SidebarTab) => {
    setSidebarTab(tab ?? 'toc');
  }, []);

  /** Show `tab`, or fall back to the contents when it is already showing. */
  const toggleSidebarTab = useCallback((tab: SidebarTab) => {
    setSidebarTab((current) => (current === tab ? 'toc' : tab));
  }, []);


  // Clear diff view on Escape key. defaultPrevented respects the
  // one-Escape-one-rung contract: an Escape consumed by a popover
  // (useDismissablePopover) or another owned surface must not also exit
  // the diff view.
  useEffect(() => {
    if (!isPlanDiffActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setIsPlanDiffActive(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlanDiffActive]);

  // useLinkedDoc shows the relevant desktop pane after activating a file.
  const linkedDocSidebar = useMemo(() => ({ open: openSidebarTab }), [openSidebarTab]);

  const handleBeforeDocumentNavigation = useCallback(() => {
    annotationHistory.clear();
  }, [annotationHistory]);

  // Linked document navigation
  const linkedDocHook = useLinkedDoc({
    markdown, annotations, selectedAnnotationId, globalAttachments,
    setMarkdown, setAnnotations, setSelectedAnnotationId, setGlobalAttachments,
    renderAs, rawHtml, setRenderAs, setRawHtml,
    viewerRef, sidebar: linkedDocSidebar, sourceFilePath, sourceConverted,
    onBeforeNavigate: handleBeforeDocumentNavigation,
  });

  // Active document's version-diff baseline: the root document's own
  // previousPlan/versionInfo (set once from /api/plan) when no linked/folder
  // doc is open, or the active document's own baseline when one is —
  // captured from its /api/doc response and cached across navigation by
  // useLinkedDoc. /api/doc only ever populates these for eligible folder
  // files, so any other linked doc naturally resolves to null/null here,
  // same as the (now-removed) blanket "linkedDocHook.isActive ? null : ..."
  // suppression used to force.
  const activeDiffPreviousPlan = linkedDocHook.isActive ? linkedDocHook.diffPreviousPlan : previousPlan;
  const activeDiffVersionInfo = linkedDocHook.isActive ? linkedDocHook.diffVersionInfo : versionInfo;
  const activeDocFilepath = linkedDocHook.isActive ? linkedDocHook.filepath : null;
  const activeHtmlPath = linkedDocHook.filepath ?? sourceFilePath ?? null;

  // Per-document version fetchers: only needed while a document with its own
  // diff baseline is active (folder annotate) — usePlanDiff's bare-endpoint
  // defaults already cover the root document.
  const activeDocDiffFetchers = useMemo<PlanDiffFetchers | undefined>(() => {
    if (!activeDocFilepath) return undefined;
    const filepath = activeDocFilepath;
    return {
      fetchVersion: async (version: number) => {
        const res = await fetch(`/api/plan/version?v=${version}&path=${encodeURIComponent(filepath)}`);
        if (!res.ok) throw new Error(`Failed to load version ${version}.`);
        return (await res.json()) as { plan: string; version: number };
      },
      fetchVersions: async () => {
        const res = await fetch(`/api/plan/versions?path=${encodeURIComponent(filepath)}`);
        if (!res.ok) throw new Error('Failed to load versions.');
        return (await res.json()) as { project: string; slug: string; versions: VersionEntry[] };
      },
    };
  }, [activeDocFilepath]);

  // Plan diff computation. On the HTML surface the diff is rendered as the real
  // page with inline highlights (htmlDiffHtml) instead of the markdown block diff,
  // so suppress the markdown diff path there (markdown is empty for HTML).
  // `activeDocFilepath` as the docKey resets the diff-base state whenever the
  // active document changes, so a newly opened document starts from ITS OWN
  // baseline instead of inheriting whatever the previous document had.
  const planDiff = usePlanDiff(
    markdown,
    isHtmlSurface ? null : activeDiffPreviousPlan,
    isHtmlSurface ? null : activeDiffVersionInfo,
    activeDocDiffFetchers,
    activeDocFilepath,
  );
  // Exit diff view when the active document switches to one with no diff
  // baseline (e.g. a history-less folder file) — otherwise the stale active
  // flag hides the annotation toolstrip until Escape. Gated off HTML surfaces,
  // whose diff view is driven by htmlDiffHtml (usePlanDiff is fed nulls there,
  // so hasPreviousVersion is always false). See usePlanDiffViewAutoExit.
  const exitPlanDiffView = useCallback(() => setIsPlanDiffActive(false), []);
  usePlanDiffViewAutoExit(
    isPlanDiffActive && !isHtmlSurface,
    planDiff.hasPreviousVersion,
    exitPlanDiffView,
  );
  usePlanDiffNavigationAutoExit(
    sidebarTab === 'toc',
    exitPlanDiffView,
  );
  const handleSelectBaseVersion = useCallback((version: number) => {
    return planDiff.selectBaseVersion(version);
  }, [planDiff.selectBaseVersion]);
  const handleActivatePlanDiff = useCallback(() => {
    setIsPlanDiffActive(true);
  }, []);

  // Keep the early parse-path mirror in sync with the active linked doc so
  // the blocks/frontmatter memos (declared before this hook) parse with the
  // right frontmatter rule for the file on screen.
  useEffect(() => {
    setLinkedDocParsePath(linkedDocHook.filepath ?? null);
  }, [linkedDocHook.filepath]);

  // Active document's directory — feeds both click-time popout fetches and
  // the validator hook so they resolve against the same base. Drifting
  // these would silently re-introduce the demote-correct-link bug.
  const activeDocBaseDir = useMemo(
    () => linkedDocHook.filepath
      ? linkedDocHook.filepath.replace(/\/[^/]+$/, '')
      : imageBaseDir?.includes('/') ? imageBaseDir : undefined,
    [linkedDocHook.filepath, imageBaseDir],
  );

  // Code file popout (read-only syntax-highlighted overlay)
  const codeFilePopout = useCodeFilePopout({
    buildUrl: useCallback((codePath: string) => {
      return activeDocBaseDir
        ? `/api/doc?path=${encodeURIComponent(codePath)}&base=${encodeURIComponent(activeDocBaseDir)}`
        : `/api/doc?path=${encodeURIComponent(codePath)}`;
    }, [activeDocBaseDir]),
  });
  useEffect(() => {
    annotationHistory.clear();
  }, [annotationHistory]);
  // A Refresh lands the bytes and, for the root document, the version diff
  // the server recomputed against them (previousPlan/versionInfo still name
  // the saved baseline). The view returns to normal mode with the "Show
  // changes" toggle available whenever a diff came back; a refresh of a
  // linked doc keeps the root's version fields untouched, as before.
  const applyRefreshedHtml = useCallback((refreshed: HtmlRefreshedDocument) => {
    annotationHistory.clear();
    setRawHtml(refreshed.rawHtml);
    setIsPlanDiffActive(false);
    if (linkedDocHook.isActive) {
      setHtmlDiffHtml(null);
      return;
    }
    setHtmlDiffHtml(refreshed.diffHtml ?? null);
    setPreviousPlan(refreshed.previousPlan ?? null);
    setVersionInfo(refreshed.versionInfo ?? null);
  }, [annotationHistory, linkedDocHook.isActive]);
  // Annotations a Refresh could no longer anchor: the panel shows an
  // "Unanchored" chip on them. Set from the refresh's restore report only,
  // so the chip is exactly the toast's list; a document change clears it.
  const [htmlUnanchoredIds, setHtmlUnanchoredIds] = useState<ReadonlySet<string>>(() => new Set());
  const handleHtmlRefreshUnanchored = useCallback((ids: string[]) => {
    setHtmlUnanchoredIds(new Set(ids));
  }, []);
  useEffect(() => {
    setHtmlUnanchoredIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [activeHtmlPath]);
  const htmlRefresh = useAnnotateHtmlRefresh({
    enabled: isApiMode && isHtmlSurface,
    activePath: activeHtmlPath,
    onSnapshot: applyRefreshedHtml,
    onUnanchored: handleHtmlRefreshUnanchored,
  });

  // Shared gate for the chrome-level keyboard commands (sidebars, focus mode):
  // never while a dialog, an overlay, a submission, or a text field owns the
  // keystroke. Annotate-only commands layer their own conditions on top.
  const canHandleDocumentChromeShortcut = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented) return false;
    if (document.querySelector('[data-hypermark-confirm-dialog="true"]')) return false;
    if (submitted || isSubmitting || isExiting) return false;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    return tag !== 'INPUT' && tag !== 'TEXTAREA' && !target?.isContentEditable;
  }, [
    submitted,
    isSubmitting,
    isExiting,
  ]);

  const canHandleAnnotateSidebarShortcut = useCallback(
    (event: KeyboardEvent) => canHandleDocumentChromeShortcut(event),
    [canHandleDocumentChromeShortcut],
  );

  const canHandleAnnotationHistoryShortcut = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || submitted || isSubmitting || isExiting) return false;
    if (isNativeHistoryOwner(event)) return false;
    return !hasActiveHistoryOverlay(document);
  }, [isExiting, isSubmitting, submitted]);

  useHistoryShortcuts({
    handlers: {
      undo: {
        when: (event) => canHandleAnnotationHistoryShortcut(event) && annotationHistory.canUndo,
        handle: () => { annotationHistory.undo(); },
      },
      redo: {
        when: (event) => canHandleAnnotationHistoryShortcut(event) && annotationHistory.canRedo,
        handle: () => { annotationHistory.redo(); },
      },
    },
  });


  useAnnotateSidebarShortcuts({
    handlers: {
      toggleContents: {
        when: canHandleAnnotateSidebarShortcut,
        handle: () => toggleSidebarTab('toc'),
      },
    },
  });

  const buildCurrentMessageState = React.useCallback((): MessageAnnotationState | null => {
    if (annotateSource !== 'message' || !selectedMessageId) return null;
    const msg = recentMessages.find((m) => m.messageId === selectedMessageId);
    if (!msg) return null;
    const snapshot = linkedDocHook.snapshotSession();
    return normalizeMessageState({
      messageId: msg.messageId,
      text: msg.text,
      timestamp: msg.timestamp,
      linkedDocSession: snapshot,
      codeAnnotations: [...codeAnnotations],
      selectedCodeAnnotationId,
    }, msg);
  }, [
    annotateSource,
    selectedMessageId,
    recentMessages,
    linkedDocHook.snapshotSession,
    codeAnnotations,
    selectedCodeAnnotationId,
  ]);

  const getMessageStatesWithCurrent = React.useCallback((): Map<string, MessageAnnotationState> => {
    const states = new Map(messageStateCacheRef.current);
    const current = buildCurrentMessageState();
    if (current) states.set(current.messageId, current);
    return states;
  }, [buildCurrentMessageState]);

  const saveCurrentMessageState = React.useCallback((): Map<string, MessageAnnotationState> => {
    const states = getMessageStatesWithCurrent();
    messageStateCacheRef.current = states;
    setCachedMessageAnnotationCounts(buildMessageAnnotationCounts(states));
    return states;
  }, [getMessageStatesWithCurrent]);

  const buildMessageAnnotationEntries = React.useCallback((): MessageAnnotationEntry[] => {
    if (annotateSource !== 'message' || recentMessages.length === 0) return [];
    // Must be a PURE read: this runs on the render path via
    // getCurrentFeedbackPayload.
    // saveCurrentMessageState() writes React state
    // (setCachedMessageAnnotationCounts), which during render is an infinite
    // re-render loop in multi-message mode (#949). getMessageStatesWithCurrent
    // returns the same merged data without the setState side effect; the cache
    // persistence happens in event handlers (handleSelectMessage) instead.
    const states = getMessageStatesWithCurrent();
    return recentMessages.map((msg) => {
      const state = states.get(msg.messageId) ?? createEmptyMessageState(msg);
      const linkedDocs: Map<string, LinkedDocAnnotationEntry> = new Map();
      for (const [filepath, doc] of state.linkedDocSession.docs) {
        linkedDocs.set(filepath, {
          ...doc,
          blocks: doc.markdown
            ? parseMarkdownToBlocks(doc.markdown, { frontmatter: shouldStripFrontmatter(filepath) })
            : undefined,
        });
      }
      return {
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        annotations: state.linkedDocSession.root.annotations,
        globalAttachments: state.linkedDocSession.root.globalAttachments,
        blocks: parseMarkdownToBlocks(state.linkedDocSession.root.markdown),
        linkedDocs,
        codeAnnotations: state.codeAnnotations,
      };
    });
  }, [annotateSource, recentMessages, getMessageStatesWithCurrent]);

  const activeMessageAnnotationCounts = React.useMemo(() => {
    const counts = new Map(cachedMessageAnnotationCounts);
    const current = buildCurrentMessageState();
    if (current) {
      const count = countMessageAnnotations(current);
      if (count > 0) counts.set(current.messageId, count);
      else counts.delete(current.messageId);
    }
    return counts;
  }, [cachedMessageAnnotationCounts, buildCurrentMessageState]);

  const messageFeedbackAnnotationCount = React.useMemo(
    () => Array.from(activeMessageAnnotationCounts.values()).reduce((sum, count) => sum + count, 0),
    [activeMessageAnnotationCounts]
  );

  const annotatedMessageIds = React.useMemo(
    () => Array.from(activeMessageAnnotationCounts.keys()),
    [activeMessageAnnotationCounts]
  );

  // File browser file selection: open via linked doc system
  const handleSelectMessage = React.useCallback((messageId: string) => {
    const msg = recentMessages.find((m) => m.messageId === messageId);
    if (!msg || messageId === selectedMessageId) return;

    annotationHistory.clear();

    const states = saveCurrentMessageState();
    const targetState = normalizeMessageState(
      states.get(messageId) ?? createEmptyMessageState(msg),
      msg,
    );

    setSelectedMessageId(messageId);
    linkedDocHook.restoreSession(targetState.linkedDocSession);
    setCodeAnnotations([...targetState.codeAnnotations]);
    setSelectedCodeAnnotationId(targetState.selectedCodeAnnotationId);
  }, [
    recentMessages,
    selectedMessageId,
    saveCurrentMessageState,
    linkedDocHook.restoreSession,
    annotationHistory,
  ]);

  // Route linked doc opens through the correct endpoint based on current context
  const handleOpenLinkedDoc = React.useCallback((docPath: string) => {
    // Pass the current file's directory as base for relative path resolution
    const baseDir = linkedDocHook.filepath
      ? linkedDocHook.filepath.replace(/\/[^/]+$/, '')
      : imageBaseDir?.includes('/') ? imageBaseDir : undefined;
    if (baseDir) {
      linkedDocHook.open(docPath, (path) =>
        `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(baseDir)}${convertHtml ? '&convert=1' : ''}`
      );
    } else {
      linkedDocHook.open(docPath);
    }
  }, [linkedDocHook, imageBaseDir, convertHtml]);

  // Wrap linked doc back
  const handleLinkedDocBack = React.useCallback(() => {
    linkedDocHook.back();
  }, [linkedDocHook]);

  // Derive annotation counts per file from linked doc cache (includes active doc's live state)
  const allAnnotationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [fp, cached] of linkedDocHook.getDocAnnotations()) {
      const count = cached.annotations.length + cached.globalAttachments.length;
      if (count > 0) counts.set(fp, count);
    }
    return counts;
  }, [linkedDocHook.getDocAnnotations, annotations, globalAttachments]);

  // Annotations in other files (not the current view) — for the right panel "+N" indicator
  const otherFileAnnotations = useMemo(() => {
    const currentFile = linkedDocHook.filepath;
    let count = 0;
    let files = 0;
    for (const [fp, n] of allAnnotationCounts) {
      if (fp !== currentFile) {
        count += n;
        files++;
      }
    }
    return count > 0 ? { count, files } : undefined;
  }, [allAnnotationCounts, linkedDocHook.filepath]);

  // Context-aware back label for linked doc navigation
  const backLabel = annotateSource === 'file' ? 'file'
    : annotateSource === 'message' ? 'message'
    : 'plan';

  // Viewer identity must change when the rendered document changes: web-highlighter
  // mutates the Viewer DOM, so reconciling new content against the old subtree throws
  // removeChild errors — a changed key remounts it cleanly instead. StickyHeaderLane
  // observes a node inside Viewer, so it re-anchors off the same token.
  const viewerContentKey = linkedDocHook.isActive
    ? `doc:${linkedDocHook.filepath}`
    : annotateSource === 'message' && selectedMessageId
      ? `msg:${selectedMessageId}`
      : 'plan';

  // Track active section for TOC highlighting
  const headingCount = useMemo(() => blocks.filter(b => b.type === 'heading').length, [blocks]);
  const activeSection = useActiveSection(planAreaRef, headingCount, scrollViewport);

  const allAnnotations = annotations;

  // Plan diff state — memoize filtered annotation lists to avoid new references per render
  const diffAnnotations = useMemo(() => allAnnotations.filter(a => !!a.diffContext), [allAnnotations]);
  const viewerAnnotations = useMemo(() => allAnnotations.filter(a => !a.diffContext), [allAnnotations]);
  // Any-annotations flag used by Close/Approve/Send guards. Consolidates the
  // four-term check that was inlined across the annotate-mode header + keyboard paths.
  const messageMultiSelectMode = annotateSource === 'message' && recentMessages.length > 1;
  const hasAnyAnnotations = useMemo(
    () => messageMultiSelectMode
      ? messageFeedbackAnnotationCount > 0
      : allAnnotations.length > 0
        || codeAnnotations.length > 0
        || linkedDocHook.docAnnotationCount > 0
        || globalAttachments.length > 0,
    [
      messageMultiSelectMode,
      messageFeedbackAnnotationCount,
      allAnnotations.length,
      codeAnnotations.length,
      linkedDocHook.docAnnotationCount,
      globalAttachments.length,
    ],
  );
  const feedbackAnnotationCount = messageMultiSelectMode
    ? messageFeedbackAnnotationCount
    : allAnnotations.length +
      codeAnnotations.length +
      linkedDocHook.docAnnotationCount +
      globalAttachments.length;

  // Restore-on-entry: every time the session transitions ONTO an HTML surface
  // (a root raw-HTML session, or a linked .html doc opened from markdown),
  // apply the toolsHidden state the user last left an HTML session with
  // (first-ever run: tools visible). A restored toolsHidden:true always has a
  // way back: the header's eye toggle.
  const prevHtmlChromeSurfaceRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    const wasHtml = prevHtmlChromeSurfaceRef.current;
    prevHtmlChromeSurfaceRef.current = isHtmlSurface;
    if (!isHtmlSurface || wasHtml) return;
    const chrome = getHtmlChromeState();
    skipNextHtmlChromeSaveRef.current = true;
    setHtmlToolsHidden(chrome.toolsHidden);
    htmlChromeRestoredRef.current = true;
  }, [
    isHtmlSurface,
    isLoading,
  ]);

  // Persist the chrome the user leaves an HTML session in, so the next
  // raw-HTML session opens exactly as they left this one. Gated on the restore
  // having run — a pre-restore render must not save the transient defaults
  // over the user's remembered state — and on being ON the HTML surface, so a
  // linked markdown doc never writes here.
  useEffect(() => {
    if (!isHtmlSurface || !htmlChromeRestoredRef.current) return;
    // The restore effect flips htmlChromeRestoredRef synchronously, but its
    // state updates land a commit LATER — a save in the restore commit itself
    // would still see pre-restore values and clobber the remembered state
    // (self-corrected next flush, but a page ending in between would freeze
    // the inverted value). Skip exactly that one run. If the restore changed
    // any state, the changed deps re-run this effect and save then; if it
    // changed nothing, the cookie already holds exactly those values.
    if (skipNextHtmlChromeSaveRef.current) {
      skipNextHtmlChromeSaveRef.current = false;
      return;
    }
    saveHtmlChromeState({ toolsHidden: htmlToolsHidden });
  }, [isHtmlSurface, htmlToolsHidden]);

  // useLayoutEffect + synchronous getBoundingClientRect so the initial
  // bucket is set before the browser paints. Otherwise narrow viewports
  // get a one-frame flash of "Global comment"/"Copy plan" labels before
  // the ResizeObserver callback collapses them.
  useLayoutEffect(() => {
    if (isLoading) return;

    const el = planAreaRef.current;
    if (!el) return;
    return observeActionsLabelMode(el, (next) => {
      setActionsLabelMode((prev) => (prev === next ? prev : next));
    });
  }, [isLoading]);

  // Auto-save annotation drafts
  const handleRestoreDraftRef = useRef<(loadedDraft?: any, meta?: any) => void>(() => {});
  const { restoreDraft, scheduleDraftSave, scheduleDraftSaveAfterSubmitFailure, getDraftGeneration, discardDraft, flushDraft } = useAnnotationDraft({
    annotations: allAnnotations,
    codeAnnotations,
    globalAttachments,
    isApiMode,
    // No share transport remains, so drafts always persist for a live session.
    isSharedSession: false,
    // isSubmitting counts: a save firing while approve/deny is in flight can
    // land after the server's draft delete and ghost a draft
    // into the next session for this plan. Saving resumes if it fails.
    submitted: !!submitted || isSubmitting,
    onDraftLoaded: (draft, meta) => handleRestoreDraftRef.current(draft, meta),
  });

  const handleRestoreDraft = React.useCallback((
    loadedDraft?: ReturnType<typeof restoreDraft>,
    meta?: { count: number; timeAgo: string },
  ) => {
    annotationHistory.clear();
    const {
      annotations: restored,
      codeAnnotations: restoredCode,
    } = loadedDraft ?? restoreDraft();
    if (restoredCode.length > 0) setCodeAnnotations(restoredCode);

    if (restored.length > 0) {
      setAnnotations(restored);
      // Apply highlights to DOM after a tick
      setTimeout(() => {
        viewerRef.current?.applySharedAnnotations(restored.filter(a => !a.diffContext));
      }, 100);
    }
    scheduleDraftSave();

    if (meta) {
      const parts = [
        meta.count > 0 ? `${meta.count} annotation${meta.count !== 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      const desc = parts.length > 0 ? parts.join(' and ') : 'draft content';
      toast(`Restored ${desc} from ${meta.timeAgo}`, {
        action: {
          label: 'Discard',
          onClick: () => {
            discardDraft();
            setAnnotations([]);
            setCodeAnnotations([]);
            annotationHistory.clear();
            viewerRef.current?.applySharedAnnotations([]);
          },
        },
      });
    }
  }, [annotationHistory, restoreDraft, scheduleDraftSave, discardDraft]);
  handleRestoreDraftRef.current = handleRestoreDraft;

  const hasFeedbackContent = hasAnyAnnotations;

  const getCurrentFeedbackPayload = useCallback((
    options?: {
      /** Discard flow: every annotation source is dropped, so the builder
       *  emits the legacy zero payload. */
      discardAnnotations?: boolean;
      /** Positive-finish framing for the non-gated discard. */
      approvalFraming?: boolean;
    },
  ): string => {
    const discard = options?.discardAnnotations === true;
    const linkedDocuments = linkedDocHook.getDocAnnotations();
    const activeConverted = linkedDocHook.isActive
      ? (linkedDocuments.get(linkedDocHook.filepath ?? '')?.isConverted ?? false)
      : sourceConverted;
    return buildCompleteAnnotateFeedback({
      blocks,
      annotations: discard ? [] : allAnnotations,
      globalAttachments: discard ? [] : globalAttachments,
      linkedDocuments: discard ? new Map() : linkedDocuments,
      codeAnnotations: discard ? [] : codeAnnotations,
      title: annotateSource === 'message' ? 'Message Feedback' : 'File Feedback',
      subject: annotateSource ?? 'plan',
      sourceConverted: activeConverted,
      ...(messageMultiSelectMode && !discard
        ? { messageEntries: buildMessageAnnotationEntries() }
        : {}),
      ...(options?.approvalFraming ? { approvalFraming: true } : {}),
    });
  }, [
    allAnnotations,
    annotateSource,
    blocks,
    buildMessageAnnotationEntries,
    codeAnnotations,
    globalAttachments,
    linkedDocHook.filepath,
    linkedDocHook.getDocAnnotations,
    linkedDocHook.isActive,
    messageMultiSelectMode,
    sourceConverted,
  ]);

  const withDraftGeneration = useCallback((path: string): string => {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}draftGeneration=${getDraftGeneration()}`;
  }, [getDraftGeneration]);

  const handleInputMethodChange = (method: InputMethod) => {
    // HTML surfaces pin the viewer to pinpoint (drag-selection commenting
    // is simultaneously live there, so there is nothing to switch): the toolstrip
    // is not rendered and the Alt shortcut must not flip state the surface ignores
    // or write the html cookie.
    if (isHtmlSurface) return;
    setInputMethod(method);
    // Surface-scoped persistence: an explicit choice made on the HTML surface
    // sticks for HTML sessions only; markdown keeps its own preference.
    saveInputMethod(method, isHtmlSurface ? 'html' : 'markdown');
  };

  // Raw-HTML surfaces resolve their own input-method preference (default:
  // Pinpoint — see utils/inputMethod.ts for the persistence decision). Applied
  // whenever the surface flips (session load or linked-doc navigation), so a
  // markdown-era "drag" cookie never suppresses the HTML default.
  const prevSurfaceRef = useRef(isHtmlSurface);
  useEffect(() => {
    if (prevSurfaceRef.current === isHtmlSurface) return;
    prevSurfaceRef.current = isHtmlSurface;
    const method = getInputMethod(isHtmlSurface ? 'html' : 'markdown');
    setInputMethod(method);
  }, [isHtmlSurface]);

  // Alt/Option key: hold to temporarily switch, double-tap to toggle
  // Alt no longer switches Select/Pinpoint — it strikes a selection through on
  // release (useAnnotationHighlighter). Select/Pinpoint is the toolstrip's
  // pair of buttons.

  // Gates the toolstrip's own render. HTML/live surfaces have no
  // toolstrip at all: they are comment-only with pinpoint + drag both live,
  // so there is no input method left to switch.
  const toolstripVisible = useMemo(
    () =>
      !isPlanDiffActive && !isHtmlSurface,
    [
      isHtmlSurface,
      isPlanDiffActive,
    ],
  );

  // Interact/Annotate toggle (Mod+Shift+A) — HTML surfaces only.
  // The bridge mirrors the same chord inside the iframe and forwards it, so
  // this parent-side registration covers focus living in the editor chrome.
  useHtmlAnnotateShortcuts({
    handlers: {
      toggleAnnotateMode: {
        when: (event) => isHtmlSurface && canHandleDocumentChromeShortcut(event),
        handle: handleHtmlAnnotateToggle,
      },
    },
  });

  // Check if we're in API mode (served from Bun hook server)
  useEffect(() => {
    fetch('/api/plan')
      .then(res => {
        if (!res.ok) throw new Error('Not in API mode');
        return res.json();
      })
      .then((data: { plan: string; origin?: Origin; mode?: 'annotate' | 'annotate-last'; filePath?: string; sourceInfo?: string; sourceConverted?: boolean; gate?: boolean; approvalNotesSupported?: boolean; clientLease?: AnnotateClientLeaseConfig; renderAs?: 'html' | 'markdown'; rawHtml?: string; diffHtml?: string; convertHtml?: boolean; repoInfo?: { display: string; branch?: string; host?: string }; previousPlan?: string | null; versionInfo?: { version: number; totalVersions: number; project: string }; projectRoot?: string; markdownExtensions?: string[]; serverConfig?: Record<string, unknown>; recentMessages?: PickerMessage[]; feedbackTemplates?: AnnotateFeedbackTemplates }) => {
        // Initialize config store with server-provided values (config file > cookie > default)
        configStore.init(data.serverConfig);
        // Extra extensions the user registered as markdown (#1307) — the
        // renderer needs them to treat links to sibling `.livemd`-style docs
        // as openable local documents rather than external links.
        setExtraMarkdownExtensions(data.markdownExtensions);
        // Session-level force-markdown preference (--markdown); threaded into folder/linked
        // /api/doc requests so on-demand HTML files convert too.
        setConvertHtml(data.convertHtml ?? false);
        if (data.renderAs === 'html' && data.rawHtml) {
          setRenderAs('html');
          setRawHtml(data.rawHtml);
          setHtmlDiffHtml(data.diffHtml ?? null);
          setMarkdown('');
        } else if (typeof data.plan === 'string') {
          const normalizedPlan = data.plan.replace(/\r\n?/g, '\n');
          setMarkdown(normalizedPlan);
        }
        setIsApiMode(true);
        if (data.mode === 'annotate' || data.mode === 'annotate-last') {
          setGate(data.gate ?? false);
          setApprovalNotesSupported(data.approvalNotesSupported ?? false);
          setClientLease(data.clientLease ?? null);
        }
        if (data.mode === 'annotate' || data.mode === 'annotate-last') {
          setAnnotateSource(data.mode === 'annotate-last' ? 'message' : 'file');
        }
        if (data.mode === 'annotate-last' && data.recentMessages && data.recentMessages.length > 0) {
          messageStateCacheRef.current = new Map();
          setCachedMessageAnnotationCounts(new Map());
          setRecentMessages(data.recentMessages);
          setSelectedMessageId(data.recentMessages[0].messageId);
        } else {
          messageStateCacheRef.current = new Map();
          setCachedMessageAnnotationCounts(new Map());
          setRecentMessages([]);
          setSelectedMessageId(null);
        }
        setSourceInfo(data.sourceInfo ?? undefined);
        setFeedbackTemplates(data.feedbackTemplates ?? null);
        setSourceConverted(!!data.sourceConverted);
        if (data.filePath) {
          setImageBaseDir(data.filePath.replace(/\/[^/]+$/, ''));
          if (data.mode === 'annotate') {
            setSourceFilePath(data.filePath);
          }
        }
        if (data.repoInfo) {
          setRepoInfo(data.repoInfo);
        }
        // Capture plan version history data
        if (data.previousPlan !== undefined) {
          setPreviousPlan(data.previousPlan);
        }
        if (data.versionInfo) {
          setVersionInfo(data.versionInfo);
        }
        if (data.origin) {
          setOrigin(data.origin);
        }
      })
      .catch(() => {
        // Not in API mode - use default content
        setIsApiMode(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Client-lease: while a local direct structured annotate gate is open, keep
  // exactly one EventSource open so the server can detect this tab going away
  // and auto-dismiss the gate after its grace period instead of hanging the
  // CLI/hook caller forever. Grace only starts once the transport reports a
  // disconnect; abrupt/half-open connection loss is best-effort and not
  // bounded by the grace period. Only ever a presence signal — no message
  // payload is read from the stream.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    if (!shouldConnectAnnotateClientLease({ submitted, clientLease })) return;

    const stream = openAnnotateClientLeaseStream(EventSource);
    return () => stream.close();
  }, [submitted, clientLease]);

  // Session-ended: the parent watcher (src/server/parent-watch.ts)
  // announces when the Claude Code process that owns this session has
  // exited. Flush the draft first — the reviewer's typing was never sent
  // anywhere else — then show the same "Session Closed" overlay a manual
  // exit shows. Stops listening once a decision is already in.
  const handleSessionEnded = useCallback(() => {
    flushDraft();
    setSubmitted('exited');
  }, [flushDraft]);
  useSessionEndedStream(submitted == null, handleSessionEnded);

  // Document-level image paste was removed: global attachments are no longer
  // a writable surface. A composer that is open claims its own
  // paste (see CommentPopover's capture-phase listener); a paste with no
  // composer open now simply does nothing, rather than filing the image
  // under the document's top-level `globalAttachments`.

  const getAnnotateFeedbackTarget = useCallback((): AnnotateFeedbackTarget => {
    if (linkedDocHook.isActive && linkedDocHook.filepath) {
      return { fileHeader: 'File', filePath: linkedDocHook.filepath };
    }
    if (sourceFilePath) {
      return { fileHeader: 'File', filePath: sourceFilePath };
    }
    return { fileHeader: 'File', filePath: 'current file' };
  }, [
    linkedDocHook.filepath,
    linkedDocHook.isActive,
    sourceFilePath,
  ]);

  // Clipboard copy wrapper (#1107): wraps with the server-resolved template
  // (the same one Send Feedback gets, including custom prompts.annotate.*
  // config), falling back to the built-in annotate defaults when the server
  // didn't ship one.
  const wrapCopiedFeedback = useCallback((feedback: string) => {
    if (annotateSource === 'message') {
      return wrapFeedbackForClipboard(feedback, {
        mode: 'annotate-message',
        template: feedbackTemplates?.messageFeedback,
      });
    }
    const target = getAnnotateFeedbackTarget();
    return wrapFeedbackForClipboard(feedback, {
      mode: 'annotate-file',
      template: feedbackTemplates?.fileFeedback,
      filePath: target.filePath,
      fileHeader: target.fileHeader,
    });
  }, [annotateSource, feedbackTemplates, getAnnotateFeedbackTarget]);

  const hasFeedbackToSend = hasFeedbackContent;

  // Annotate mode handler — sends feedback to the running terminal agent when
  // available, otherwise through the original server feedback channel.
  // Returns whether the submission settled (delivered or posted): the pending
  // note-decision machinery (L3) keeps its captured route armed on failure.
  // Which message(s) a submission is about. Send Feedback and Approve with
  // Notes must resolve this identically — otherwise notes delivered on the
  // approve path anchor to the last message instead of the picked one.
  const getFeedbackMessageScope = (): {
    selectedMessageId?: string;
    feedbackScope?: 'messages';
  } => {
    const scopedSelectedMessageId = messageMultiSelectMode
      ? annotatedMessageIds.length === 1 ? annotatedMessageIds[0] : undefined
      : selectedMessageId ?? undefined;
    return {
      ...(scopedSelectedMessageId ? { selectedMessageId: scopedSelectedMessageId } : {}),
      ...(messageMultiSelectMode && annotatedMessageIds.length > 1 ? { feedbackScope: 'messages' as const } : {}),
    };
  };

  const handleAnnotateFeedback = async (options?: {
    /** Discard-and-finish (post-confirm): annotations dropped, the payload is
     *  the legacy "reviewed, no feedback" record. */
    discardAnnotations?: boolean;
    /** Approval framing on the one feedback string — the non-gated discard
     *  path only, since the empty-menu collapse removed the framed note. */
    approvalFraming?: boolean;
  }): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const discard = options?.discardAnnotations === true;
      const feedback = getCurrentFeedbackPayload(options);

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          feedback,
          annotations: discard ? [] : allAnnotations,
          codeAnnotations: discard ? [] : codeAnnotations,
          ...getFeedbackMessageScope(),
        }),
      });
      if (!res.ok) throw new Error('Failed to send feedback');
      discardDraft();
      setSubmitted('denied'); // reuse 'denied' state for "feedback sent" overlay
      return true;
    } catch {
      setIsSubmitting(false);
      scheduleDraftSaveAfterSubmitFailure();
      return false;
    }
  };

  // Annotate gate-mode handler — capable transports preserve complete feedback.
  const handleAnnotateApprove = async (options?: {
    /** "Approve, discard n annotations…" (post-confirm): the whole feedback
     *  payload is dropped — text AND annotation arrays — so a capable
     *  transport cannot deliver what the reviewer chose to discard. */
    discardAnnotations?: boolean;
  }): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const discard = options?.discardAnnotations === true;
      const feedback = !discard && hasFeedbackToSend
        ? getCurrentFeedbackPayload()
        : '';
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAnnotateApprovalBody({
          supported: approvalNotesSupported,
          draftGeneration: getDraftGeneration(),
          feedback,
          annotations: discard ? [] : allAnnotations,
          codeAnnotations: discard ? [] : codeAnnotations,
          ...getFeedbackMessageScope(),
        })),
      });
      if (!res.ok) throw new Error('Failed to approve');
      discardDraft();
      setSubmitted('approved');
      return true;
    } catch {
      setIsSubmitting(false);
      scheduleDraftSaveAfterSubmitFailure();
      return false;
    }
  };

  // Exit annotation session without sending feedback
  const handleAnnotateExit = useCallback(async () => {
    setIsExiting(true);
    try {
      const res = await fetch(withDraftGeneration('/api/exit'), { method: 'POST' });
      if (res.ok) {
        setSubmitted('exited');
      } else {
        throw new Error('Failed to exit');
      }
    } catch {
      setIsExiting(false);
    }
  }, [withDraftGeneration]);

  // Global keyboard shortcuts (Cmd/Ctrl+Enter to submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Cmd/Ctrl+Enter
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTextField = tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target?.isContentEditable);

      // Let active confirmation dialogs own Cmd/Ctrl+Enter and Escape.
      if (document.querySelector('[data-hypermark-confirm-dialog="true"]')) return;

      // Don't intercept if already submitted, submitting, or exiting
      if (submitted || isSubmitting || isExiting) return;

      // Don't intercept in demo/share mode (no API)
      if (!isApiMode) return;

      // Linked docs are side references and should not submit the root plan.
      if (linkedDocHook.isActive) return;

      // Don't intercept if typing in an input/textarea.
      if (isTextField) return;

      e.preventDefault();

      // Mod+Enter always equals the visible header primary — one
      // submitPrimaryDecision for keyboard, and header.
      submitPrimaryDecisionRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    submitted, isSubmitting, isExiting, isApiMode, linkedDocHook.isActive, annotations.length, codeAnnotations.length,
    annotateSource, origin,
  ]);

  const handleAddAnnotation = (ann: Annotation) => {
    const beforeSelection = selectionRef.current;
    const index = annotationsRef.current.length;
    annotationsRef.current = [...annotationsRef.current, ann];
    setAnnotations(annotationsRef.current);
    setSelectedAnnotationId(ann.id);
    setSelectedCodeAnnotationId(null);
    selectionRef.current = { annotationId: ann.id, codeAnnotationId: null };
    annotationHistory.record({
      kind: 'annotation',
      mutation: { kind: 'add', item: ann, index },
      beforeSelection,
      afterSelection: selectionRef.current,
    });
    // Annotation activity keeps the HTML chrome preference alive: re-stamp it
    // so it only expires for users who have not annotated HTML within the
    // staleness TTL (see preferenceTtl.ts).
    if (isHtmlSurface) {
      if (htmlChromeRestoredRef.current) {
        saveHtmlChromeState({ toolsHidden: htmlToolsHidden });
      }
    }
  };

  // Keep selection behavior explicit across mobile/wide-mode transitions.
  const handleSelectAnnotation = React.useCallback((id: string | null, messageId?: string) => {
    if (messageId && messageId !== selectedMessageId) {
      handleSelectMessage(messageId);
      if (id) setPendingAnnotationSelection(id);
      return;
    }
    setSelectedAnnotationId(id);
    if (id) setSelectedCodeAnnotationId(null);
    selectionRef.current = {
      annotationId: id,
      codeAnnotationId: id ? null : selectionRef.current.codeAnnotationId,
    };
    if (id && isMobile) setIsMobilePanelOpen(true);
  }, [isMobile, selectedMessageId, handleSelectMessage]);

  const handleAddCodeAnnotation = React.useCallback((input: CodeFileAnnotationInput) => {
    const annotation: CodeAnnotation = {
      id: generateId('code-ann'),
      type: 'comment',
      scope: 'line',
      filePath: input.filePath,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      side: 'new',
      text: input.text,
      images: input.images,
      createdAt: Date.now(),
    };
    const beforeSelection = selectionRef.current;
    const index = codeAnnotationsRef.current.length;
    codeAnnotationsRef.current = [...codeAnnotationsRef.current, annotation];
    setCodeAnnotations(codeAnnotationsRef.current);
    setSelectedAnnotationId(null);
    setSelectedCodeAnnotationId(annotation.id);
    selectionRef.current = { annotationId: null, codeAnnotationId: annotation.id };
    annotationHistory.record({
      kind: 'code-annotation',
      mutation: { kind: 'add', item: annotation, index },
      beforeSelection,
      afterSelection: selectionRef.current,
    });
  }, [annotationHistory]);

  // The code popout is full-viewport modal — the annotation panel is behind it.
  // This handler only fires when the popout is closed (sidebar visible), so
  // reopening the file via codeFilePopout.open() is the correct behavior.
  const handleSelectCodeAnnotation = React.useCallback((id: string, messageId?: string) => {
    if (messageId && messageId !== selectedMessageId) {
      handleSelectMessage(messageId);
      setPendingAnnotationSelection(id);
      return;
    }
    const annotation = codeAnnotations.find(a => a.id === id);
    if (!annotation) return;
    setSelectedAnnotationId(null);
    setSelectedCodeAnnotationId(id);
    selectionRef.current = { annotationId: null, codeAnnotationId: id };
    codeFilePopout.open(annotation.filePath);
    if (isMobile) setIsMobilePanelOpen(true);
  }, [codeAnnotations, codeFilePopout.open, isMobile, selectedMessageId, handleSelectMessage]);

  useEffect(() => {
    if (!pendingAnnotationSelection) return;
    const id = pendingAnnotationSelection;
    setPendingAnnotationSelection(null);
    requestAnimationFrame(() => {
      const isCode = codeAnnotationsRef.current.some((a) => a.id === id);
      if (isCode) {
        handleSelectCodeAnnotation(id);
      } else {
        handleSelectAnnotation(id);
      }
    });
  }, [selectedMessageId, handleSelectAnnotation, handleSelectCodeAnnotation]);

  const handleDeleteCodeAnnotation = React.useCallback((id: string) => {
    const index = codeAnnotationsRef.current.findIndex((annotation) => annotation.id === id);
    const annotation = codeAnnotationsRef.current[index];
    if (!annotation) return;
    const beforeSelection = selectionRef.current;
    codeAnnotationsRef.current = codeAnnotationsRef.current.filter((item) => item.id !== id);
    setCodeAnnotations(codeAnnotationsRef.current);
    if (beforeSelection.codeAnnotationId === id) setSelectedCodeAnnotationId(null);
    const afterSelection = beforeSelection.codeAnnotationId === id
      ? { ...beforeSelection, codeAnnotationId: null }
      : beforeSelection;
    selectionRef.current = afterSelection;
    annotationHistory.record({
      kind: 'code-annotation',
      mutation: { kind: 'delete', item: annotation, index },
      beforeSelection,
      afterSelection,
    });
  }, [annotationHistory]);

  const handleEditCodeAnnotation = React.useCallback((id: string, updates: Partial<CodeAnnotation>) => {
    const before = codeAnnotationsRef.current.find((annotation) => annotation.id === id);
    if (!before) return;
    const after = { ...before, ...updates };
    codeAnnotationsRef.current = codeAnnotationsRef.current.map((annotation) => annotation.id === id ? after : annotation);
    setCodeAnnotations(codeAnnotationsRef.current);
    annotationHistory.record({
      kind: 'code-annotation',
      mutation: { kind: 'edit', before, after },
      beforeSelection: selectionRef.current,
      afterSelection: selectionRef.current,
    });
  }, [annotationHistory]);

  // Core annotation removal — highlight cleanup + state filter + selection clear
  const removeAnnotation = (id: string) => {
    viewerRef.current?.removeHighlight(id);
    annotationsRef.current = annotationsRef.current.filter((annotation) => annotation.id !== id);
    setAnnotations(annotationsRef.current);
    if (selectionRef.current.annotationId === id) {
      setSelectedAnnotationId(null);
      selectionRef.current = { ...selectionRef.current, annotationId: null };
    }
  };

  // Interactive checkbox toggling with annotation tracking
  const checkbox = useCheckboxOverrides({
    blocks,
    annotations,
    addAnnotation: (annotation) => {
      checkboxSelectionBeforeRef.current ??= selectionRef.current;
      const index = annotationsRef.current.length;
      annotationsRef.current = [...annotationsRef.current, annotation];
      setAnnotations(annotationsRef.current);
      setSelectedAnnotationId(annotation.id);
      setSelectedCodeAnnotationId(null);
      selectionRef.current = { annotationId: annotation.id, codeAnnotationId: null };
      return index;
    },
    removeAnnotation: (id) => {
      checkboxSelectionBeforeRef.current ??= selectionRef.current;
      removeAnnotation(id);
    },
    onToggleMutation: (mutation) => {
      const beforeSelection = checkboxSelectionBeforeRef.current ?? selectionRef.current;
      annotationHistory.record({
        kind: 'checkbox',
        mutation,
        beforeSelection,
        afterSelection: selectionRef.current,
      });
      checkboxSelectionBeforeRef.current = null;
    },
  });
  restoreCheckboxOverridesRef.current = checkbox.restoreOverrides;

  const deleteAnnotation = (id: string) => {
    const ann = allAnnotations.find(a => a.id === id);
    // Checkbox deletion is one composite action: visual state and generated
    // annotation must travel together through history.
    if (id.startsWith('ann-checkbox-')) {
      if (ann) {
        const beforeSelection = selectionRef.current;
        const beforeOverrides = [...checkbox.overrides.entries()] as CheckboxOverrideSnapshot;
        const annotationIndex = annotationsRef.current.findIndex((item) => item.id === id);
        checkbox.revertOverride(ann.blockId);
        removeAnnotation(id);
        annotationHistory.record({
          kind: 'checkbox',
          mutation: {
            blockId: ann.blockId,
            beforeOverrides,
            afterOverrides: beforeOverrides.filter(([blockId]) => blockId !== ann.blockId),
            beforeAnnotations: [{ annotation: ann, index: annotationIndex }],
            afterAnnotations: [],
          },
          beforeSelection,
          afterSelection: selectionRef.current,
        });
        return;
      }
      removeAnnotation(id);
      return;
    }
    const index = annotationsRef.current.findIndex((annotation) => annotation.id === id);
    if (!ann || index < 0) {
      removeAnnotation(id);
      return;
    }
    const beforeSelection = selectionRef.current;
    removeAnnotation(id);
    annotationHistory.record({
      kind: 'annotation',
      mutation: { kind: 'delete', item: ann, index },
      beforeSelection,
      afterSelection: selectionRef.current,
    });
  };
  const handleDeleteAnnotation = (id: string) => deleteAnnotation(id);

  const editAnnotation = (id: string, updates: Partial<Annotation>) => {
    const ann = allAnnotations.find(a => a.id === id);
    if (!ann) return;
    const after = { ...ann, ...updates };
    annotationsRef.current = annotationsRef.current.map((annotation) => annotation.id === id ? after : annotation);
    setAnnotations(annotationsRef.current);
    annotationHistory.record({
      kind: 'annotation',
      mutation: { kind: 'edit', before: ann, after },
      beforeSelection: selectionRef.current,
      afterSelection: selectionRef.current,
    });
  };
  const handleEditAnnotation = (id: string, updates: Partial<Annotation>) =>
    editAnnotation(id, updates);

  const handleTocNavigate = (blockId: string) => {
    // Navigation handled by TableOfContents component
    // This is just a placeholder for future custom logic
  };

  const agentName = useMemo(() => getAgentName(origin), [origin]);

  // Header handlers ref — stores latest handler references so the stable
  // callbacks below always call the current version without needing useCallback
  // dep arrays for every handler. This lets React.memo on AppHeader work.
  const headerHandlersRef = useRef({
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  });
  headerHandlersRef.current = {
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  };

  // --- The unified annotate decision control ----------------
  // One primary, one callback: the header's left segment, the global
  // Mod+Enter handler (via submitPrimaryDecisionRef) all call this.
  // The zero-state Done submit is the SAME /api/feedback
  // POST the keyboard-only silent submit made (byte-identical payload);
  // gate mode's empty primary is Approve on /api/approve.
  // Runs one captured note decision on its captured route/framing. Cleared
  // only on success (L3); the in-flight ref guards a double dispatch while a
  // POST is outstanding.
  const pendingDispatchInFlightRef = useRef(false);
  const dispatchPendingDecision = useCallback((pending: {
    route: 'feedback' | 'approve';
    approvalFraming: boolean;
  }) => {
    if (pendingDispatchInFlightRef.current) return;
    const { route, approvalFraming } = pending;
    const run = async () => {
      pendingDispatchInFlightRef.current = true;
      try {
        const ok = route === 'approve'
          ? await headerHandlersRef.current.handleAnnotateApprove()
          : await headerHandlersRef.current.handleAnnotateFeedback(
              approvalFraming ? { approvalFraming: true } : undefined,
            );
        if (ok) setPendingDecisionSubmit(null);
      } finally {
        pendingDispatchInFlightRef.current = false;
      }
    };
    void run();
  }, []);

  const submitPrimaryDecision = useCallback(() => {
    if (isSubmitting || isExiting) return; // double-submit guard while in flight
    if (pendingDecisionSubmit) {
      // L3: a failed note submit stays armed with its captured route/framing;
      // the next primary invocation retries THAT decision, never the bare
      // primary (which would re-derive from live state — dropping a gate's
      // captured approve route, or re-committing the note — once the note
      // raised hasFeedbackToSend).
      dispatchPendingDecision(pendingDecisionSubmit);
      return;
    }
    if (gate && !hasFeedbackToSend) {
      void headerHandlersRef.current.handleAnnotateApprove();
      return;
    }
    void headerHandlersRef.current.handleAnnotateFeedback();
  }, [
    dispatchPendingDecision,
    gate,
    hasFeedbackToSend,
    isExiting,
    isSubmitting,
    pendingDecisionSubmit,
  ]);
  submitPrimaryDecisionRef.current = submitPrimaryDecision;

  // Note → GLOBAL_COMMENT at submit time (#1436): it rides exportAnnotations
  // and the /api/feedback annotations array exactly like a composer-made
  // global comment — zero server change on either runtime. Deliberately NOT
  // annotationHistory.record: the note lives for one submit, and undoing it
  // after the send would restore nothing the agent has not been told.
  const commitSubmitNote = useCallback((text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const note: Annotation = {
      id: generateId('global-note'),
      blockId: '',
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.GLOBAL_COMMENT,
      text: trimmed,
      originalText: '',
      createdA: Date.now(),
    };
    annotationsRef.current = [...annotationsRef.current, note];
    setAnnotations(annotationsRef.current);
    return note.id;
  }, []);

  const queueNoteDecision = useCallback((
    text: string | undefined,
    route: 'feedback' | 'approve',
    approvalFraming: boolean,
  ) => {
    if (isSubmitting || isExiting) return;
    const noteId = commitSubmitNote(text ?? '');
    if (!noteId) return; // the control never submits an empty note
    setPendingDecisionSubmit({ noteId, route, approvalFraming, dispatched: false });
  }, [commitSubmitNote, isExiting, isSubmitting]);

  // The commit above is a state write, so the payload builders (which close
  // over `allAnnotations`) only see the note on the NEXT render. Submit from
  // an effect once the note is actually in state rather than guessing. One
  // automatic dispatch per arming; after a failure the armed decision waits
  // for the next primary invocation (L3).
  useEffect(() => {
    const pending = pendingDecisionSubmit;
    if (!pending) return;
    if (!annotations.some((a) => a.id === pending.noteId)) {
      // The note left state (panel delete, draft restore, document switch):
      // the captured decision lost its note — disarm rather than replaying
      // its framing over someone else's payload.
      setPendingDecisionSubmit(null);
      return;
    }
    if (pending.dispatched) return;
    setPendingDecisionSubmit({ ...pending, dispatched: true });
    dispatchPendingDecision(pending);
  }, [annotations, dispatchPendingDecision, pendingDecisionSubmit]);

  const runAnnotateDecisionAction = useCallback((id: DecisionActionId, note?: string) => {
    const action = resolveAnnotateDecisionAction(id, { gate });
    switch (action.kind) {
      case 'primary':
        submitPrimaryDecision();
        return;
      case 'note':
        queueNoteDecision(note, action.route, action.approvalFraming);
        return;
      case 'approve-with-notes': {
        void headerHandlersRef.current.handleAnnotateApprove();
        return;
      }
      case 'close': {
        if (submitted || isSubmitting || isExiting) return;
        void headerHandlersRef.current.handleAnnotateExit();
        return;
      }
    }
  }, [gate, isExiting, isSubmitting, queueNoteDecision, submitPrimaryDecision, submitted]);

  const annotateDecisionSpec = useMemo(() => buildDecisionSpec({
    app: 'annotate',
    gate,
    count: feedbackAnnotationCount,
    hasFeedback: hasFeedbackToSend,
    approvalNotesSupported,
  }), [
    approvalNotesSupported,
    feedbackAnnotationCount,
    gate,
    hasFeedbackToSend,
  ]);

  const annotateDecisionHandlers = useMemo<Record<DecisionActionId, DecisionHandler>>(() => ({
    'primary': () => runAnnotateDecisionAction('primary'),
    'note-with-approval': (note) => runAnnotateDecisionAction('note-with-approval', note),
    'request-changes': (note) => runAnnotateDecisionAction('request-changes', note),
    'note-with-feedback': (note) => runAnnotateDecisionAction('note-with-feedback', note),
    'approve-with-notes': () => runAnnotateDecisionAction('approve-with-notes'),
    'close-session': () => runAnnotateDecisionAction('close-session'),
  }), [runAnnotateDecisionAction]);

  // Per-surface Close titles.
  const annotateCloseTitle = annotateSource === 'message'
    ? 'Dismiss without telling the agent'
    : 'Close session without sending';

  const annotateDecision = useMemo(() => ({
    spec: annotateDecisionSpec,
    handlers: annotateDecisionHandlers,
    closeTitle: annotateCloseTitle,
    // Framed surfaces: clicks inside the iframe never reach the parent
    // document, so iframe focus dismisses the popover instead.
    dismissOnIframeFocus: isHtmlSurface,
  }), [annotateCloseTitle, annotateDecisionHandlers, annotateDecisionSpec, isHtmlSurface]);

  // Reading column. One width, dialled: the document is centred with a
  // gutter on each side, and the left gutter holds the table of contents.
  // 880px at the 14px body is 63em — the measure GitHub renders markdown in at
  // 16px/1012px, reproduced at our smaller type size.
  const planMaxWidth = 880;
  const handleNavigatorTabChange = (tab: SidebarTab) => {
    toggleSidebarTab(tab);
  };

  const handleNavigatorDiffActivate = () => {
    handleActivatePlanDiff();
  };

  const isMessageScopeEligible = annotateSource === 'message' && recentMessages.length > 1;

  const messageGroups = useMemo((): AnnotationMessageGroup[] | undefined => {
    if (!isMessageScopeEligible) return undefined;
    const states = getMessageStatesWithCurrent();
    const currentId = selectedMessageId;
    const groups: AnnotationMessageGroup[] = [];
    for (const msg of recentMessages) {
      const state = states.get(msg.messageId);
      const isCurrent = msg.messageId === currentId;
      const groupAnnotations = isCurrent
        ? allAnnotations
        : [
            ...(state?.linkedDocSession.root.annotations ?? []),
            ...Array.from(state?.linkedDocSession.docs.values() ?? []).flatMap((d) => d.annotations),
          ];
      const groupCodeAnnotations = isCurrent
        ? codeAnnotations
        : (state?.codeAnnotations ?? []);
      groups.push({
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        isCurrent,
        annotations: groupAnnotations,
        codeAnnotations: groupCodeAnnotations,
      });
    }
    groups.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return 0;
    });
    return groups;
  }, [isMessageScopeEligible, getMessageStatesWithCurrent, selectedMessageId, recentMessages, allAnnotations, codeAnnotations]);

  const renderPlanSidebar = () => {
    return (
      <SidebarContainer
        activeTab={sidebarTab}
        onTabChange={handleNavigatorTabChange}
        showContentsTab
        blocks={blocks}
        annotations={annotations}
        activeSection={activeSection}
        onTocNavigate={handleTocNavigate}
        linkedDocFilepath={linkedDocHook.filepath}
        onLinkedDocBack={linkedDocHook.isActive ? handleLinkedDocBack : undefined}
        backLabel={backLabel}
        showVersionsTab={!isHtmlSurface && activeDiffVersionInfo !== null && activeDiffVersionInfo.totalVersions > 1}
        versionInfo={activeDiffVersionInfo}
        versions={planDiff.versions}
        selectedBaseVersion={planDiff.diffBaseVersion}
        onSelectBaseVersion={handleSelectBaseVersion}
        isPlanDiffActive={isPlanDiffActive}
        hasPreviousVersion={planDiff.hasPreviousVersion}
        onActivatePlanDiff={handleNavigatorDiffActivate}
        isLoadingVersions={planDiff.isLoadingVersions}
        isSelectingVersion={planDiff.isSelectingVersion}
        fetchingVersion={planDiff.fetchingVersion}
        onFetchVersions={planDiff.fetchVersions}
      />
    );
  };

  const renderAnnotationPanel = (isOpen = true) => (
    <AnnotationPanel
      isOpen={isOpen}
      blocks={blocks}
      annotations={allAnnotations}
      selectedId={selectedAnnotationId ?? selectedCodeAnnotationId}
      onSelectAnnotation={handleSelectAnnotation}
      onDeleteAnnotation={handleDeleteAnnotation}
      onEditAnnotation={handleEditAnnotation}
      codeAnnotations={codeAnnotations}
      onSelectCodeAnnotation={handleSelectCodeAnnotation}
      onDeleteCodeAnnotation={handleDeleteCodeAnnotation}
      onEditCodeAnnotation={handleEditCodeAnnotation}
      scope={isMessageScopeEligible ? annotationScope : undefined}
      onScopeChange={isMessageScopeEligible ? setAnnotationScope : undefined}
      messageGroups={isMessageScopeEligible ? messageGroups : undefined}
      unanchoredIds={isHtmlSurface && htmlUnanchoredIds.size > 0 ? htmlUnanchoredIds : undefined}
      onClose={() => setIsMobilePanelOpen(false)}
      onQuickCopy={async () => {
        const output = getCurrentFeedbackPayload();
        return copyTextToClipboard(wrapCopiedFeedback(output));
      }}
      otherFileAnnotations={otherFileAnnotations}
    />
  );

  // Mobile Safari paints the browser-controls backdrop from the document/app
  // canvas, not from the nested document scroller. Keep that canvas continuous
  // with the active surface so a card-backed plan does not end in a dark band.
  const browserCanvas = isHtmlSurface ? 'background' : 'card';
  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="dark" manageFavicon>
        <div className="pn-app-viewport bg-background" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" manageFavicon>
      <TooltipProvider delayDuration={900} skipDelayDuration={200} disableHoverableContent>
      <div
        data-pn-browser-canvas={browserCanvas}
        className={`pn-app-viewport flex flex-col overflow-hidden ${browserCanvas === 'card' ? 'bg-card' : 'bg-background'}`}
      >
        <AppHeader
          sticky
          htmlSurface={isHtmlSurface}
          htmlAnnotateArmed={htmlAnnotateArmed}
          onToggleHtmlAnnotate={isHtmlSurface ? handleHtmlAnnotateToggle : undefined}
          htmlToolsHidden={htmlToolsHidden}
          onToggleHtmlTools={isHtmlSurface ? () => setHtmlToolsHidden((v) => !v) : undefined}
          canRefreshHtml={htmlRefresh.canRefresh}
          isRefreshingHtml={htmlRefresh.isRefreshing}
          onRefreshHtml={htmlRefresh.refresh}
          isApiMode={isApiMode}
          origin={origin}
          isSubmitting={isSubmitting}
          isExiting={isExiting}
          annotateDecision={annotateDecision}
        />

        {/* The provider is render-transparent (context only, no DOM), so it can
            open here without changing the shell's element structure or order.
            It has to: the navigator renders the SAME TableOfContents as
            the desktop rail, and a TOC outside this provider resolves a null
            viewport, which makes every "jump to heading" tap a silent no-op. */}
        <ScrollViewportProvider viewport={scrollViewport}>



        {linkedDocHook.error && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 shrink-0">
            <span className="text-xs text-destructive">{linkedDocHook.error}</span>
            <button
              onClick={linkedDocHook.dismissError}
              className="ml-auto text-xs text-destructive/60 hover:text-destructive"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative z-0">
          {/* Left Sidebar: the permanent contents rail (TOC or Version Browser) */}
          {renderPlanSidebar()}

          {/* Document Area. The wrapper is the rail's anchor: its width is the
              scroller's BORDER box, which the scrollbar lives inside and so
              never changes. Anchoring the rail to the scroller's content box
              moved it sideways whenever a message was short enough not to
              scroll. */}
          <div className="relative flex min-w-0 flex-1">
          <OverlayScrollArea
            element="main"
            className={`flex-1 min-w-0 ${isHtmlSurface ? 'bg-background' : 'bg-card'}`}
            overflowX="hidden"
            overflowY="auto"
            // Native scrollbars take layout width, so a document short enough
            // not to scroll is WIDER than one that does — which slid the
            // message rail sideways on every message switch. A stable gutter
            // reserves the space whether the scrollbar is there or not.
            style={{ scrollbarGutter: 'stable' }}
            onViewportReady={handleDocumentViewportReady}
          >
            <div ref={planAreaRef} className={`${isHtmlSurface ? 'h-full flex flex-col' : 'min-h-full flex flex-col items-center px-2 py-3 md:px-10 md:py-8 xl:px-16'} relative z-10`}>
              {/* Sticky header lane — ghost bar that pins the toolstrip +
                  badges at top: 12px once the user scrolls. Invisible at top
                  of doc; original toolstrip/badges remain the source of
                  truth there. Hidden in plan diff mode, or when
                  sticky actions are disabled. remountToken re-anchors the
                  ResizeObserver when Viewer swaps content (linked docs or
                  message switches). */}
              {!isPlanDiffActive && !isHtmlSurface && uiPrefs.stickyActionsEnabled && (
                <StickyHeaderLane
                  inputMethod={inputMethod}
                  onInputMethodChange={handleInputMethodChange}
                  repoInfo={repoInfo}
                  planDiffStats={planDiff.diffStats}
                  isPlanDiffActive={isPlanDiffActive}
                  hasPreviousVersion={planDiff.hasPreviousVersion}
                  onPlanDiffToggle={() => setIsPlanDiffActive(!isPlanDiffActive)}
                  planDiffBaselineLabel="since last review"
                  planDiffBaselineTooltip="Changes since you last reviewed this file"
                  maxWidth={planMaxWidth}
                  remountToken={viewerContentKey}
                />
              )}

              {/* Annotation Toolstrip — the input method switcher (select / pinpoint).
                  Markdown surfaces only: HTML/live surfaces are comment-only with
                  pinpoint + drag both live, so no floating toolstrip ever overlays the
                  rendered page. Hidden during plan diff browsing. */}
              {toolstripVisible && (
                <div
                  className="w-full mb-3 md:mb-4 flex items-center justify-start"
                  style={{ maxWidth: planMaxWidth }}
                >
                  <AnnotationToolstrip
                    inputMethod={inputMethod}
                    onInputMethodChange={handleInputMethodChange}
                  />
                </div>
              )}

              {/* Plan Diff View — rendered when diff data exists, hidden when inactive */}
              {planDiff.diffBlocks && planDiff.diffStats && (
                <div className="w-full flex justify-center" style={{ display: isPlanDiffActive ? undefined : 'none' }}>
                  <PlanDiffViewer
                    diffBlocks={planDiff.diffBlocks}
                    diffStats={planDiff.diffStats}
                    diffMode={planDiffMode}
                    onDiffModeChange={setPlanDiffMode}
                    onPlanDiffToggle={() => setIsPlanDiffActive(false)}
                    repoInfo={repoInfo}
                    baseVersionLabel={planDiff.diffBaseVersion != null ? `v${planDiff.diffBaseVersion}` : undefined}
                    baseVersion={planDiff.diffBaseVersion ?? undefined}
                    maxWidth={planMaxWidth}
                    annotations={diffAnnotations}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAnnotation={handleSelectAnnotation}
                    selectedAnnotationId={selectedAnnotationId}
                  />
                </div>
              )}
              {/* Normal Plan View — always mounted, hidden during diff mode */}
              <div className={`w-full relative ${isHtmlSurface ? 'flex-1 flex flex-col' : 'flex justify-center'}`} style={{ display: isPlanDiffActive && planDiff.diffBlocks ? 'none' : undefined }}>
                {renderAs === 'html' ? (
                  <HtmlViewer
                    key={`${linkedDocHook.isActive ? `doc:${linkedDocHook.filepath}` : 'plan'}${isPlanDiffActive && htmlDiffHtml ? ':diff' : ''}:reload-${htmlRefresh.reloadGeneration}`}
                    ref={viewerRef}
                    rawHtml={isPlanDiffActive && htmlDiffHtml ? htmlDiffHtml : rawHtml}
                    annotations={viewerAnnotations}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAnnotation={handleSelectAnnotation}
                    selectedAnnotationId={selectedAnnotationId}
                    // HTML surfaces are always pinpoint: armed = click
                    // pins an element AND drag selects text (both live at
                    // once); Interact (Esc) keeps clicks native while drag
                    // commenting stays available. No input-method switch.
                    inputMethod="pinpoint"
                    annotateModeActive={htmlAnnotateArmed}
                    onAnnotateModeExit={handleHtmlAnnotateExit}
                    onAnnotateModeToggle={handleHtmlAnnotateToggle}
                    maxWidth={isHtmlSurface ? null : planMaxWidth}
                    fullViewport={isHtmlSurface}
                    // The header's eye toggle is the way back, so a
                    // restored toolsHidden:true is never a trap.
                    hideControls={isHtmlSurface && htmlToolsHidden}
                    diffAvailable={!!htmlDiffHtml}
                    diffActive={isPlanDiffActive && !!htmlDiffHtml}
                    onToggleDiff={() => setIsPlanDiffActive((v) => !v)}
                    onUnanchoredChange={htmlRefresh.reportAnnotationRestore}
                  />
                ) : (
                  <Viewer
                    key={viewerContentKey}
                    ref={viewerRef}
                    blocks={blocks}
                    markdown={displayedMarkdown}
                    frontmatter={frontmatter}
                    annotations={viewerAnnotations}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAnnotation={handleSelectAnnotation}
                    selectedAnnotationId={selectedAnnotationId}
                    inputMethod={effectiveInputMethod}
                    repoInfo={repoInfo}
                    stickyActions={uiPrefs.stickyActionsEnabled}
                    planDiffStats={planDiff.diffStats}
                    isPlanDiffActive={isPlanDiffActive}
                    onPlanDiffToggle={() => setIsPlanDiffActive(!isPlanDiffActive)}
                    hasPreviousVersion={planDiff.hasPreviousVersion}
                    planDiffBaselineLabel="since last review"
                    planDiffBaselineTooltip="Changes since you last reviewed this file"
                    showDemoBadge={!isApiMode}
                    maxWidth={planMaxWidth}
                    onOpenLinkedDoc={handleOpenLinkedDoc}
                    onOpenCodeFile={codeFilePopout.open}
                    linkedDocInfo={
                      linkedDocHook.isActive
                        ? {
                            filepath: linkedDocHook.filepath!,
                            onBack: handleLinkedDocBack,
                            label: undefined,
                            backLabel,
                            variant: 'breadcrumb',
                          }
                        : null
                    }
                    imageBaseDir={imageBaseDir}
                    codePathBaseDir={activeDocBaseDir}
                    copyLabel={annotateSource === 'message' ? 'Copy message' : annotateSource === 'file' ? 'Copy file' : undefined}
                    sourceInfo={sourceInfo}
                    onToggleCheckbox={checkbox.toggle}
                    checkboxOverrides={checkbox.overrides}
                    actionsLabelMode={actionsLabelMode}
                  />
                )}
              </div>
            </div>
          </OverlayScrollArea>
          {annotateSource === 'message' && recentMessages.length > 1 && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-panel hidden items-center lg:flex"
              style={{ paddingRight: MESSAGE_RAIL_INSET }}
            >
              <div className="pointer-events-auto">
                <MessageRail
                  messages={recentMessages}
                  selectedMessageId={selectedMessageId}
                  onSelect={handleSelectMessage}
                  annotationCounts={activeMessageAnnotationCounts}
                />
              </div>
            </div>
          )}
          </div>

          {/* Annotation Panel — permanent on desktop; on mobile it is a drawer
              opened by selecting a comment and closed by its own X. */}
          {renderAnnotationPanel(isMobile ? isMobilePanelOpen : true)}
        </div>
        </ScrollViewportProvider>

        {/* Code File Popout */}
        {codeFilePopout.popoutProps && (
          <CodeFilePopout
            {...codeFilePopout.popoutProps}
            annotations={codeAnnotations.filter((ann) => ann.filePath === codeFilePopout.popoutProps?.filepath)}
            selectedAnnotationId={selectedCodeAnnotationId}
            onAddAnnotation={handleAddCodeAnnotation}
            onEditAnnotation={handleEditCodeAnnotation}
            onDeleteAnnotation={handleDeleteCodeAnnotation}
            onSelectAnnotation={(id) => {
              setSelectedAnnotationId(null);
              setSelectedCodeAnnotationId(id);
            }}
          />
        )}

        <Toaster
          position="top-right"
          offset={64}
          toastOptions={{
            style: {
              '--normal-bg': 'var(--card)',
              '--normal-border': 'var(--border)',
              '--normal-text': 'var(--foreground)',
              '--success-bg': 'oklch(from var(--success) l c h / 0.15)',
              '--success-border': 'oklch(from var(--success) l c h / 0.3)',
              '--success-text': 'var(--success)',
              '--error-bg': 'oklch(from var(--destructive) l c h / 0.15)',
              '--error-border': 'oklch(from var(--destructive) l c h / 0.3)',
              '--error-text': 'var(--destructive)',
            } as React.CSSProperties,
          }}
        />

        {/* Completion overlay - shown after approve/deny */}
        <CompletionOverlay
          submitted={submitted}
          title={
            submitted === 'exited' ? 'Session Closed'
            : submitted === 'approved'
              ? 'Approved'
            : 'Feedback Sent'
          }
          subtitle={
            submitted === 'exited'
              ? 'Annotation session closed without feedback.'
              : submitted === 'approved'
                ? `${agentName} will proceed.`
                : `${agentName} will address your feedback on the ${annotateSource === 'message' ? 'message' : 'file'}.`
          }
          agentLabel={agentName}
        />
      </div>
      </TooltipProvider>
    </ThemeProvider>
  );
};

// Phosphor's default weight ("regular") is the app-wide
// default for every icon rendered under this root. Set once here instead of
// repeating `weight="regular"` at each call site; only a control that
// deliberately deviates overrides it per-call.
const App: React.FC = () => (
  <IconContext.Provider value={{ weight: 'regular' }}>
    <AppInner />
  </IconContext.Provider>
);

export default App;
