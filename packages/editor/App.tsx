// Eager renderer registration (side-effect imports, evaluated before every
// other module below). These keep Hypermark's first paint, identity minting
// and failure surface byte-identical now that @hypermark/ui loads KaTeX, the
// username dictionary and the Mermaid runtime lazily for hosts: math is typeset
// on the first commit, names come from the full dictionary, and Mermaid stays
// in this app's entry chunk (the review editor never renders Mermaid and does
// not import that entry). Guarded by tests/entry-assets.test.ts; do not drop
// or reorder any of these lines.
import '@hypermark/ui/utils/math-eager';
import '@hypermark/ui/utils/identity-tater';
import '@hypermark/ui/utils/mermaid-eager';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { toast, Toaster } from 'sonner';
import { type Origin, getAgentName } from '@hypermark/shared/agents';
import { shouldStripFrontmatter } from '@hypermark/shared/annotatable';
import { setExtraMarkdownExtensions } from '@hypermark/ui/utils/markdownExtensions';
import { annotateFileFeedback, annotateMessageFeedback, wrapFeedbackForClipboard, type AnnotateFeedbackTemplates } from '@hypermark/shared/feedback-templates';
import { parseMarkdownToBlocks, exportAnnotations, exportLinkedDocAnnotations, exportCodeFileAnnotations, extractFrontmatter, wrapFeedbackForAgent, Frontmatter, type LinkedDocAnnotationEntry, type MessageAnnotationEntry } from '@hypermark/ui/utils/parser';
import { primeSkillCatalog, primeSkillContentsForExport } from '@hypermark/ui/utils/skillCatalog';
import { Viewer, ViewerHandle } from '@hypermark/ui/components/Viewer';
import { HtmlViewer } from '@hypermark/ui/components/html-viewer';
import { MarkdownEditor, type MarkdownEditorHandle } from '@hypermark/ui/components/MarkdownEditor';
import { AnnotationPanel } from '@hypermark/ui/components/AnnotationPanel';
import { ConfirmDialog } from '@hypermark/ui/components/ConfirmDialog';
import { Annotation, AnnotationType, Block, EditorMode, type CodeAnnotation, type InputMethod, type ImageAttachment, type ActionsLabelMode } from '@hypermark/ui/types';
import { ThemeProvider } from '@hypermark/ui/components/ThemeProvider';
import { Tooltip, TooltipProvider } from '@hypermark/ui/components/Tooltip';
import { AnnotationToolstrip } from '@hypermark/ui/components/AnnotationToolstrip';
import { StickyHeaderLane } from '@hypermark/ui/components/StickyHeaderLane';
import { useActiveSection } from '@hypermark/ui/hooks/useActiveSection';
import { storage } from '@hypermark/ui/utils/storage';
import { getIdentity } from '@hypermark/ui/utils/identity';
import { copyTextToClipboard } from '@hypermark/ui/utils/clipboard';
import { configStore, useConfigValue } from '@hypermark/ui/config';
import { CompletionOverlay } from '@hypermark/ui/components/CompletionOverlay';
import { getUIPreferences, type PlanWidth } from '@hypermark/ui/utils/uiPreferences';
import { getEditorMode, saveEditorMode } from '@hypermark/ui/utils/editorMode';
import { getInputMethod, saveInputMethod } from '@hypermark/ui/utils/inputMethod';
import { getHtmlChromeState, saveHtmlChromeState } from '@hypermark/ui/utils/htmlChrome';
import { useInputMethodSwitch } from '@hypermark/ui/hooks/useInputMethodSwitch';
import { usePrintMode } from '@hypermark/ui/hooks/usePrintMode';
import { useResizablePanel } from '@hypermark/ui/hooks/useResizablePanel';
import { ResizeHandle } from '@hypermark/ui/components/ResizeHandle';
import { OverlayScrollArea } from '@hypermark/ui/components/OverlayScrollArea';
import { ScrollViewportProvider } from '@hypermark/ui/hooks/useScrollViewport';
import { useOverlayViewport } from '@hypermark/ui/hooks/useOverlayViewport';
import { useIsMobile } from '@hypermark/ui/hooks/useIsMobile';
import { useViewportEnvironment } from '@hypermark/ui/hooks/useViewportEnvironment';
import { PLAN_APPROVAL_PERMISSION_MODE } from '@hypermark/ui/utils/permissionMode';
import { useSidebar, type SidebarTab } from '@hypermark/ui/hooks/useSidebar';
import { usePlanDiff, type VersionInfo, type VersionEntry, type PlanDiffFetchers } from '@hypermark/ui/hooks/usePlanDiff';
import { useLinkedDoc, type LinkedDocSessionState } from '@hypermark/ui/hooks/useLinkedDoc';
import { useCodeFilePopout } from '@hypermark/ui/hooks/useCodeFilePopout';
import { useAnnotationDraft, type DraftEditedDocument } from '@hypermark/ui/hooks/useAnnotationDraft';
import { useSessionEndedStream } from '@hypermark/ui/hooks/useSessionEndedStream';
import { useExternalAnnotations } from '@hypermark/ui/hooks/useExternalAnnotations';
import { useExternalAnnotationHighlights } from '@hypermark/ui/hooks/useExternalAnnotationHighlights';
import { useUndoHistory } from '@hypermark/ui/hooks/useUndoHistory';
import { buildPlanAgentInstructions } from '@hypermark/ui/utils/planAgentInstructions';
import { useFileBrowser } from '@hypermark/ui/hooks/useFileBrowser';
import { getFileEditStatus } from '@hypermark/ui/components/sidebar/FileBrowser';
import { generateId } from '@hypermark/ui/utils/generateId';
import { SidebarTabs } from '@hypermark/ui/components/sidebar/SidebarTabs';
import { SidebarContainer } from '@hypermark/ui/components/sidebar/SidebarContainer';
import type { PickerMessage } from '@hypermark/ui/components/sidebar/MessagesBrowser';
import { PlanDiffViewer } from '@hypermark/ui/components/plan-diff/PlanDiffViewer';
import { CodeFilePopout, type CodeFileAnnotationInput } from '@hypermark/ui/components/CodeFilePopout';
import type { PlanDiffMode } from '@hypermark/ui/components/plan-diff/PlanDiffModeSwitcher';
import {
  GoalSetupSurface,
  type GoalSetupActionState,
  type GoalSetupSurfaceHandle,
} from '@hypermark/ui/components/goal-setup/GoalSetupSurface';
import type { GoalSetupBundle } from '@hypermark/shared/goal-setup';
import {
  hasSourceSaveConflictSnapshot,
  isSourceSaveFilePath,
  type SourceSaveCapability,
  type SourceSaveResponse,
} from '@hypermark/shared/source-save';
import type { AgentTerminalCapability } from '@hypermark/shared/agent-terminal';
import { observeActionsLabelMode } from './actionsLabelMode';
// Demo content toggle. Default: the original Real-time Collaboration plan.
// Opt-in diff-engine stress test: `VITE_DIFF_DEMO=1 bun run dev:hook` swaps
// in the 20-case Auth Service Refactor test plan. dev-mock-api.ts reads the
// same env var on the server side so V2/V3 stay paired.
import { DEMO_PLAN_CONTENT as DEFAULT_DEMO_PLAN_CONTENT } from './demoPlan';
import { DIFF_DEMO_PLAN_CONTENT } from './demoPlanDiffDemo';
import { canUseAnnotateWideMode, resolveFocusShortcutAction, resolveWideModeExitLayout, type WideModeLayoutSnapshot, type WideModeType } from '@hypermark/ui/utils/wideMode';
import { modKey } from '@hypermark/ui/utils/platform';
import {
  annotateSidebarShortcuts,
  useAnnotateSidebarShortcuts,
  useAnnotationModeShortcuts,
  useDocumentViewShortcuts,
  useDoubleTapShortcuts,
  useHtmlAnnotateShortcuts,
  useHistoryShortcuts,
} from '@hypermark/ui/shortcuts';
import {
  applyCollectionMutation,
  hasActiveHistoryOverlay,
  isHumanHistoryMutation,
  isNativeHistoryOwner,
  syncHistoryHighlight,
  type CollectionMutation,
  type HistoryDirection,
} from '@hypermark/ui/utils/undoHistory';
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
import { useHtmlRefresh, type HtmlRefreshedDocument } from './hooks/useHtmlRefresh';
import { FolderAnnotationEmptyState } from './components/FolderAnnotationEmptyState';
import {
  AnnotateAgentTerminalPanel,
  type AnnotateAgentTerminalPanelHandle,
} from './components/AnnotateAgentTerminalPanel';
import {
  saveAnnotateAgentTerminalSide,
  type AnnotateAgentTerminalSide,
} from '@hypermark/ui/utils/annotateAgentTerminal';
import {
  AGENT_TERMINAL_LG_BREAKPOINT,
  getAgentTerminalLayout,
} from './agentTerminalLayout';
import {
  buildAgentTerminalDeliveryRecord,
  isMatchingAgentTerminalDelivery,
  shouldSendAgentTerminalFeedback,
  type AgentTerminalDeliveryRecord,
  type AnnotateFeedbackTarget,
} from './agentTerminalIntegration';
import {
  buildPlanEditPanelItem,
  buildDirectEditsSection,
  buildSavedFileChangePanelItems,
  buildSavedFileChangesSection,
  computeEditStats,
  normalizeEditedMarkdown,
} from './directEdits';
import {
  buildAnnotateApprovalBody,
  buildCompleteAnnotateFeedback,
} from './annotateSubmission';
import { buildDecisionSpec, type DecisionActionId } from '@hypermark/ui/utils/decisionSpec';
import { DecisionNoteDialog, type DecisionHandler } from '@hypermark/ui/components/DecisionControl';
import { resolveAnnotateDecisionAction } from './annotateDecision';
import {
  openAnnotateClientLeaseStream,
  shouldConnectAnnotateClientLease,
  type AnnotateClientLeaseConfig,
} from './annotateClientLease';
import {
  editableDocumentKey,
  useEditableDocuments,
  type EnabledSourceSaveCapability,
  type SavedFileChangeDraftData,
} from './editableDocuments';
import {
  validateSavedFileChanges,
} from './savedFileChangeValidation';
import { fetchSourceDocumentSnapshot, probeSourceSave } from './sourceDocumentClient';
import { reconcileSourceDocuments, type SourceDocumentReconcileEvent } from './sourceDocumentReconciliation';
import {
  buildSourceWatchSubscription,
  normalizeBrowserPath,
  pathIsInsideDir,
} from './sourceDocumentPaths';
import { pickRestoredSingleFileDraftToDisplay } from './draftRestoreSelection';

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
      shareHtml: '',
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
      shareHtml: state.linkedDocSession.root.shareHtml ?? '',
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

const feedbackLossDescription = (annotationCount: number, hasDirectEdits: boolean): string => {
  const parts = [
    annotationCount > 0 ? `${annotationCount} annotation${annotationCount !== 1 ? 's' : ''}` : '',
    hasDirectEdits ? 'direct edits' : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' and ') : 'feedback';
};

type SourceFileEditWarningAction = 'send-feedback' | 'approve' | 'close';

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

/** Hint shown following the cursor while hovering a sidebar/panel resize handle. */
const RESIZE_HANDLE_TOOLTIP = 'Click to close · Drag to resize';

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
  const editableDocuments = useEditableDocuments();
  const activeEditableDocument = editableDocuments.activeDocument;
  const displayedMarkdown = activeEditableDocument?.currentText ?? markdown;
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
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [showClaudeCodeWarning, setShowClaudeCodeWarning] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showSourceFileEditWarning, setShowSourceFileEditWarning] = useState(false);
  const [sourceFileEditWarningAction, setSourceFileEditWarningAction] = useState<SourceFileEditWarningAction>('send-feedback');
  const sourceFileEditWarningContinuationRef = useRef<(() => void | Promise<void>) | null>(null);
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
  // Compact/touch decision surfaces: composer items open DecisionNoteDialog,
  // confirm items open one ConfirmDialog (the desktop popover lives inside
  // DecisionControl; compact has no popover to morph). L2: only the item ID
  // is state — the dialog contents resolve from the LIVE spec at render, so
  // a spec update while a dialog is up can never show or confirm stale copy.
  // The keydown effects mount above the decision callbacks; call through a
  // render-assigned ref (same pattern as headerHandlersRef) so keyboard and
  // header share literally one submitPrimaryDecision.
  const submitPrimaryDecisionRef = useRef<() => void>(() => {});
  const [isPanelOpen, setIsPanelOpen] = useState(() => window.innerWidth >= 768);
  const [editorMode, setEditorMode] = useState<EditorMode>(getEditorMode);
  const [inputMethod, setInputMethod] = useState<InputMethod>(getInputMethod);
  const [uiPrefs, setUiPrefs] = useState(() => getUIPreferences());

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
  // Warm the skill-reference catalog once per API session so export enrichment
  // covers comments whose composer never opened (draft restore, panel edits).
  useEffect(() => {
    if (isApiMode) primeSkillCatalog();
  }, [isApiMode]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  // Markdown edit mode (prototype): CM6 live-preview editor over the raw plan
  // text. originalMarkdownRef is the as-submitted baseline for the edit diff —
  // set once at plan load, never by linked-doc navigation or edit commits.
  const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
  const isEditingMarkdownRef = useRef(isEditingMarkdown);
  useEffect(() => {
    isEditingMarkdownRef.current = isEditingMarkdown;
  }, [isEditingMarkdown]);
  const [editStats, setEditStats] = useState<{ added: number; removed: number } | null>(null);
  // Bumped on every edit commit so the Viewer remounts: web-highlighter mutates
  // the Viewer DOM, and reconciling changed blocks against the old subtree throws.
  const [editGeneration, setEditGeneration] = useState(0);
  // True while the open editor buffer differs from what it mounted with.
  const [editorDirty, setEditorDirty] = useState(false);
  // True while the open editor buffer differs from the as-submitted baseline.
  const [editorDiffersFromBaseline, setEditorDiffersFromBaseline] = useState(false);
  const [agentFeedbackRevision, setAgentFeedbackRevision] = useState(0);
  // Two-step guard for the "Cancel" (discard edits + exit) action.
  const [confirmCancelEdits, setConfirmCancelEdits] = useState(false);
  const originalMarkdownRef = useRef<string | null>(null);
  // Last COMMITTED editor text (null = no edits). The Direct Edits diff reads
  // this — never the shared `markdown` state, which linked-doc navigation,
  // message switching, and checkbox toggles repurpose.
  const editedMarkdownRef = useRef<string | null>(null);
  // What the current edit session mounted with, for live dirty tracking.
  const editSessionBaseRef = useRef<string>('');
  const markdownEditorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const suspendedRootEditableKeyRef = useRef<string | null>(null);
  // Legacy, read-only (spec 05 §4.1): the toolbar Images action and the
  // document-level paste handler that used to write here are gone. This stays
  // at [] for the life of a session — restore-time normalization folds any
  // stored top-level images into a GLOBAL_COMMENT annotation instead — and is
  // only still threaded through useLinkedDoc/useAnnotationDraft/export
  // payload shapes that read it.
  const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [gate, setGate] = useState(false);
  const [approvalNotesSupported, setApprovalNotesSupported] = useState(false);
  const [clientLease, setClientLease] = useState<AnnotateClientLeaseConfig | null>(null);
  const [annotateSource, setAnnotateSource] = useState<'file' | 'message' | 'folder' | null>(null);
  const [recentMessages, setRecentMessages] = useState<PickerMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const messageStateCacheRef = useRef<Map<string, MessageAnnotationState>>(new Map());
  const [cachedMessageAnnotationCounts, setCachedMessageAnnotationCounts] = useState<Map<string, number>>(new Map());
  const [goalSetupBundle, setGoalSetupBundle] = useState<GoalSetupBundle | null>(null);
  const goalSetupSurfaceRef = useRef<GoalSetupSurfaceHandle>(null);
  const [goalSetupAction, setGoalSetupAction] = useState<GoalSetupActionState>({
    canSubmit: false,
    isSubmitting: false,
    submitted: false,
    submitLabel: 'Submit',
  });
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
  const [shareHtml, setShareHtml] = useState('');
  // Live app annotation (mode "annotate-app"): the HtmlViewer navigates the
  // loopback proxy origin instead of rendering srcdoc HTML. Pinpoint-only,
  // edit/diff/share hidden, annotations stamped with the page they were
  // made on.
  const [liveApp, setLiveApp] = useState<{ appUrl: string; origin: string; token: string } | null>(null);
  const [livePageUrl, setLivePageUrl] = useState('');
  // Interact/Annotate mode for HTML and live-app surfaces. Armed = the bridge
  // captures clicks for pinpoint annotation; disarmed (Interact) = clicks are
  // fully native while committed markers stay visible/clickable and text
  // drag-selection commenting stays live. Session-only, never persisted.
  // BOTH surface kinds start armed; Esc (or the header pen) drops to
  // Interact.
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
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [agentTerminalCapability, setAgentTerminalCapability] = useState<AgentTerminalCapability | null>(null);
  const [isAgentTerminalOpen, setIsAgentTerminalOpen] = useState(false);
  // Durable placement preference (server config > cookie > 'left'). Read through
  // ConfigStore rather than component state so the Settings dialog's copy of the
  // Position control and the terminal's own popover stay in step.
  const agentTerminalSide = useConfigValue('agentTerminalSide');
  const [isAgentTerminalRunning, setIsAgentTerminalRunning] = useState(false);
  const [isAgentTerminalReady, setIsAgentTerminalReady] = useState(false);
  const [agentTerminalSessionId, setAgentTerminalSessionId] = useState<number | null>(null);
  const [agentTerminalDelivery, setAgentTerminalDeliveryState] = useState<AgentTerminalDeliveryRecord | null>(null);
  const agentTerminalDeliveryRef = useRef<AgentTerminalDeliveryRecord | null>(null);
  const agentTerminalSessionSeqRef = useRef(0);
  const agentTerminalRef = useRef<AnnotateAgentTerminalPanelHandle>(null);
  const [wideModeType, setWideModeType] = useState<WideModeType | null>(null);
  const wideModeSnapshotRef = useRef<WideModeLayoutSnapshot | null>(null);
  const initialSidebarPreferenceAppliedRef = useRef(false);
  const lastAppliedTocEnabledRef = useRef(uiPrefs.tocEnabled);
  const goalSetupMode = goalSetupBundle !== null;

  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Hypermark` : "Hypermark";
  }, [repoInfo]);

  const [isPlanDiffActive, setIsPlanDiffActive] = useState(false);
  const [planDiffMode, setPlanDiffMode] = useState<PlanDiffMode>('clean');
  const [previousPlan, setPreviousPlan] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const isMobile = useIsMobile();
  const isBelowAgentTerminalBreakpoint = useIsMobile(AGENT_TERMINAL_LG_BREAKPOINT);
  const effectiveEditorMode: EditorMode = editorMode;
  const effectiveInputMethod = inputMethod;
  const effectivePanelOpen = isPanelOpen;

  // Resolved high, not at render time, because `isRightPanelVisible` is what
  // decides whether the right-hand annotations surface is actually on screen,
  // and consumers of that fact read it well before the JSX. Computing it late
  // let those consumers fall back to `effectivePanelOpen`, which stays true
  // under a right-docked terminal and so reported an invisible surface as open.
  const showAgentTerminalControls =
    annotateMode &&
    annotateSource !== 'message' &&
    agentTerminalCapability !== null &&
    !goalSetupMode;
  const {
    shouldRender: shouldRenderAgentTerminal,
    isVisible: isAgentTerminalVisible,
    isLeftVisible: isLeftAgentTerminalVisible,
    showOnLeft: showAgentTerminalOnLeft,
    showOnRight: showAgentTerminalOnRight,
    isRightPanelVisible,
    dockClassName: agentTerminalDockClassName,
    placement: agentTerminalPlacement,
  } = getAgentTerminalLayout({
    showControls: showAgentTerminalControls,
    isOpen: isAgentTerminalOpen,
    isRunning: isAgentTerminalRunning,
    isWideMode: wideModeType !== null,
    isBelowBreakpoint: isBelowAgentTerminalBreakpoint,
    side: agentTerminalSide,
    isRightPanelOpen: effectivePanelOpen,
  });

  const viewerRef = useRef<ViewerHandle>(null);
  const historyContext = [
    annotateSource ?? 'plan',
    selectedMessageId ?? 'message',
    linkedDocParsePath ?? sourceFilePath ?? 'root',
    livePageUrl || 'page',
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

  usePrintMode();

  // Sidebar (shared TOC + Version Browser)
  const sidebar = useSidebar(false);

  // Resizable panels
  const panelResize = useResizablePanel({
    storageKey: 'hypermark-panel-width',
    // Drag the right panel skinny → snap it shut (matches the contents sidebar).
    onSnapClose: () => setIsPanelOpen(false),
    // Single click on the handle (no drag) collapses it.
    onClick: () => setIsPanelOpen(false),
    // Render-free drag: write the live width to a :root var the panel reads,
    // so dragging never re-renders this (heavy) App.
    apply: (w) => document.documentElement.style.setProperty('--rpanel-w', `${w}px`),
  });
  const tocResize = useResizablePanel({
    storageKey: 'hypermark-toc-width',
    defaultWidth: 240, minWidth: 160, maxWidth: 400, side: 'left',
    // Drag the contents panel skinny → snap it shut (prototype behavior).
    onSnapClose: sidebar.close,
    // Single click on the handle (no drag) collapses it.
    onClick: sidebar.close,
    // Render-free drag: write the live width to a :root var the panel reads.
    apply: (w) => document.documentElement.style.setProperty('--toc-w', `${w}px`),
  });
  const agentTerminalResize = useResizablePanel({
    storageKey: 'hypermark-agent-terminal-width',
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 640,
    // The handle follows the edge the panel actually docks against, which for a
    // 'hidden' preference opened for the session is the left fallback.
    side: agentTerminalPlacement,
    onSnapClose: () => hideAgentTerminal(),
    // Single click on the handle (no drag) collapses it.
    onClick: () => hideAgentTerminal(),
    apply: (w) => document.documentElement.style.setProperty('--agent-terminal-w', `${w}px`),
  });
  const isResizing = panelResize.isDragging || tocResize.isDragging || agentTerminalResize.isDragging;

  // Whether the document has any TOC-eligible headings (level <= 3, matching
  // buildTocHierarchy). Drives the empty-doc auto-close behavior below — must
  // be declared before the effects that reference it (TDZ in dep arrays).
  const hasTocEntries = useMemo(
    () => blocks.some(b => b.type === 'heading' && (b.level ?? 0) <= 3),
    [blocks]
  );

  const exitWideMode = useCallback((options?: {
    restore?: boolean;
    sidebarTab?: SidebarTab;
    panelOpen?: boolean;
  }) => {
    if (wideModeType === null) {
      if (options?.sidebarTab) sidebar.open(options.sidebarTab);
      if (options?.panelOpen === true) setIsPanelOpen(true);
      else if (options?.panelOpen === false) setIsPanelOpen(false);
      return;
    }

    const snapshot = wideModeSnapshotRef.current;
    const layout = resolveWideModeExitLayout(snapshot, options);

    setWideModeType(null);
    wideModeSnapshotRef.current = null;

    if (layout.sidebarOpen && layout.sidebarTab) {
      sidebar.open(layout.sidebarTab);
    } else {
      sidebar.close();
    }

    if (layout.panelOpen !== undefined) {
      setIsPanelOpen(layout.panelOpen);
    }
  }, [wideModeType, sidebar.close, sidebar.open]);

  const openSidebarTab = useCallback((tab: SidebarTab) => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, sidebarTab: tab, panelOpen: false });
      return;
    }
    sidebar.open(tab);
  }, [exitWideMode, wideModeType, sidebar.open]);

  const toggleSidebarTab = useCallback((tab: SidebarTab) => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, sidebarTab: tab, panelOpen: false });
      return;
    }
    sidebar.toggleTab(tab);
  }, [exitWideMode, wideModeType, sidebar.toggleTab]);


  const hideAgentTerminal = useCallback(() => {
    setIsAgentTerminalOpen(false);
  }, []);

  /**
   * RIGHT-SLOT INVARIANT (see also getAgentTerminalLayout in
   * ./agentTerminalLayout, and the panel render site below).
   *
   * A right-docked Agent TUI and the annotations panel compete for the same
   * slot, and the coordination between them is deliberately ASYMMETRIC:
   *
   *  - Panel wins over terminal, destructively. Asking for annotations is a
   *    request for that specific surface, so the terminal gives up the slot:
   *    `isAgentTerminalOpen` goes false. Nothing is lost — a running agent
   *    stays mounted off-layout, so reopening returns to the same session
   *    rather than a fresh PTY.
   *  - Terminal wins over panel, non-destructively. Opening the terminal only
   *    suppresses the panel visually (`isRightPanelVisible`); `isPanelOpen`
   *    and the selected tab are left alone, so dismissing the terminal
   *    restores exactly the surface the user had.
   *
   * Making this symmetric (closing the panel outright when the terminal opens)
   * was considered and rejected: the terminal is frequently a short detour
   * from an annotation pass, and clearing the panel would make every detour
   * cost the user their place. The asymmetry is the UX, not an oversight.
   */
  const replaceRightAgentTerminalWithPanel = useCallback(() => {
    hideAgentTerminal();
    setIsPanelOpen(true);
  }, [hideAgentTerminal]);

  const handleAnnotationPanelToggle = useCallback(() => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: true });
      return;
    }
    // Right-slot invariant: only a VISIBLE right-docked terminal is holding the
    // slot. A collapsed-but-running one is off-layout and must not be evicted.
    if (agentTerminalPlacement === 'right' && isAgentTerminalVisible) {
      replaceRightAgentTerminalWithPanel();
      return;
    }
    setIsPanelOpen(prev => !prev);
  }, [agentTerminalPlacement, exitWideMode, isAgentTerminalVisible, replaceRightAgentTerminalWithPanel, wideModeType]);

  /**
   * Record the durable placement. Writing through ConfigStore is the whole
   * update: `agentTerminalSide` is a useConfigValue subscriber, so the terminal
   * popover and the Settings dialog observe the same value.
   */
  const handleAgentTerminalSideChange = useCallback((side: AnnotateAgentTerminalSide) => {
    saveAnnotateAgentTerminalSide(side);
  }, []);

  const setAgentTerminalDelivery = useCallback((delivery: AgentTerminalDeliveryRecord | null) => {
    agentTerminalDeliveryRef.current = delivery;
    setAgentTerminalDeliveryState(delivery);
  }, []);

  const closeAgentTerminal = useCallback(() => {
    if (agentTerminalRef.current) {
      agentTerminalRef.current.stop();
      return;
    }
    setIsAgentTerminalRunning(false);
    setIsAgentTerminalReady(false);
    setAgentTerminalSessionId(null);
    setAgentTerminalDelivery(null);
    hideAgentTerminal();
  }, [hideAgentTerminal, setAgentTerminalDelivery]);

  const handleAgentTerminalReadyChange = useCallback((ready: boolean) => {
    setIsAgentTerminalReady(ready);
    setAgentTerminalDelivery(null);
    if (!ready) {
      setAgentTerminalSessionId(null);
      return;
    }
    agentTerminalSessionSeqRef.current += 1;
    setAgentTerminalSessionId(agentTerminalSessionSeqRef.current);
  }, [setAgentTerminalDelivery]);

  /**
   * Explicit intent to see the terminal now: the rail toggle, Shift Shift, or
   * a message routed to the agent. Deliberately does NOT rewrite a 'hidden'
   * preference — asking for the panel once is not the same as asking for it
   * every session, so the open is session-scoped and the preference survives.
   */
  const openAgentTerminal = useCallback(() => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: false });
    }
    setIsAgentTerminalOpen(true);
  }, [exitWideMode, wideModeType]);

  const toggleAgentTerminal = useCallback(() => {
    if (isAgentTerminalOpen) {
      hideAgentTerminal();
      return;
    }
    openAgentTerminal();
  }, [hideAgentTerminal, isAgentTerminalOpen, openAgentTerminal]);

  useEffect(() => {
    if (annotateMode && annotateSource !== 'message' && agentTerminalCapability) return;
    closeAgentTerminal();
  }, [agentTerminalCapability, annotateMode, annotateSource, closeAgentTerminal]);

  // Choosing "Hidden" closes the terminal, from either surface that offers the
  // Position control (the terminal's own popover, which then disappears, and
  // the Settings dialog, which is how you get it back). Keyed on the preference
  // alone, so a later explicit open in the same session is not undone: the
  // effect does not re-run until the preference changes again.
  useEffect(() => {
    if (agentTerminalSide !== 'hidden') return;
    closeAgentTerminal();
  }, [agentTerminalSide, closeAgentTerminal]);

  // Sync sidebar open state when the "Auto-open Sidebar" preference changes in
  // Settings. Deliberately does NOT react to the document or render mode —
  // switching files (e.g. in annotate-folder) leaves the sidebar exactly as the
  // user left it.
  useEffect(() => {
    if (wideModeType !== null) return;
    if (lastAppliedTocEnabledRef.current === uiPrefs.tocEnabled) return;
    lastAppliedTocEnabledRef.current = uiPrefs.tocEnabled;
    if (uiPrefs.tocEnabled && hasTocEntries) sidebar.open('toc');
    else if (!uiPrefs.tocEnabled) sidebar.close();
  }, [wideModeType, sidebar.close, sidebar.open, uiPrefs.tocEnabled, hasTocEntries]);

  // Auto-close the sidebar when blocks parse with no TOC entries. Fires
  // only on blocks/hasTocEntries change (not on sidebar state) so a user
  // who manually re-opens the empty sidebar is left alone — until the
  // document changes again (e.g. picking a new file in annotate-folder).
  useEffect(() => {
    if (blocks.length === 0) return;
    if (hasTocEntries) return;
    if (sidebar.activeTab === 'toc' && sidebar.isOpen) {
      sidebar.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, hasTocEntries]);

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

  const linkedDocSidebar = useMemo(() => ({
    ...sidebar,
    // useLinkedDoc opens the relevant desktop rail after activating a file.
    open: (tab?: SidebarTab) => {
      openSidebarTab(tab ?? 'toc');
    },
    toggleTab: toggleSidebarTab,
  }), [
    openSidebarTab,
    sidebar.activeTab,
    sidebar.close,
    sidebar.isOpen,
    toggleSidebarTab,
  ]);

  const snapshotActiveEditableDocument = useCallback(() => {
    if (!activeEditableDocument) return;
    if (isEditingMarkdown) {
      const live = markdownEditorHandleRef.current?.getMarkdown();
      if (live != null) editableDocuments.updateActiveText(live, { forceNotify: true });
      return;
    }
    editableDocuments.updateActiveText(displayedMarkdown, { forceNotify: true });
  }, [activeEditableDocument, displayedMarkdown, editableDocuments, isEditingMarkdown]);

  const getLinkedDocumentMarkdown = useCallback((filepath: string, fallback?: string) => {
    return editableDocuments.getCurrentText(`file:${filepath}`) ?? fallback;
  }, [editableDocuments]);

  const restoreLinkedDocumentEditableKey = useCallback(() => {
    const restoreKey = suspendedRootEditableKeyRef.current;
    suspendedRootEditableKeyRef.current = null;
    editableDocuments.setActiveKey(restoreKey);
  }, [editableDocuments]);

  const handleLinkedDocumentLoaded = useCallback((doc: { markdown?: string; filepath?: string; renderAs?: 'markdown' | 'html'; sourceSave?: SourceSaveCapability }) => {
    if (annotateSource !== 'folder') {
      if (activeEditableDocument?.sourceSave?.enabled) {
        suspendedRootEditableKeyRef.current = activeEditableDocument.key;
        editableDocuments.setActiveKey(null);
      }
      return undefined;
    }

    if (doc.renderAs === 'html' || !doc.filepath || doc.markdown == null) {
      editableDocuments.setActiveKey(null);
      return undefined;
    }

    const sourceSave = doc.sourceSave ?? null;
    const key = editableDocumentKey(sourceSave, `file:${doc.filepath}`);
    editableDocuments.openDocument({ key, text: doc.markdown, sourceSave });
    const currentText = editableDocuments.getCurrentText(key) ?? doc.markdown;
    const record = editableDocuments.getDocument(key);

    if (isEditingMarkdown) {
      editSessionBaseRef.current = currentText;
      setEditorDirty(false);
      setEditorDiffersFromBaseline(record ? currentText !== record.diskBaseline : false);
    }

    return currentText;
  }, [activeEditableDocument, annotateSource, editableDocuments, isEditingMarkdown]);

  const handleLinkedDocumentActivated = useCallback(() => {}, []);

  const handleBeforeDocumentNavigation = useCallback(() => {
    annotationHistory.clear();
    snapshotActiveEditableDocument();
  }, [annotationHistory, snapshotActiveEditableDocument]);

  // Linked document navigation
  const linkedDocHook = useLinkedDoc({
    markdown, annotations, selectedAnnotationId, globalAttachments,
    setMarkdown, setAnnotations, setSelectedAnnotationId, setGlobalAttachments,
    renderAs, rawHtml, shareHtml, setRenderAs, setRawHtml, setShareHtml,
    viewerRef, sidebar: linkedDocSidebar, sourceFilePath, sourceConverted,
    onBeforeNavigate: handleBeforeDocumentNavigation,
    onDocumentLoaded: handleLinkedDocumentLoaded,
    onDocumentActivated: handleLinkedDocumentActivated,
    getDocumentMarkdown: getLinkedDocumentMarkdown,
    onAfterBack: restoreLinkedDocumentEditableKey,
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
    sidebar.activeTab === 'toc',
    exitPlanDiffView,
  );
  const warnFinishEditingFirst = useCallback((target: 'versions' | 'diff') => {
    toast('Finish editing first', {
      description: target === 'versions'
        ? 'Use "Done editing" before changing the comparison version.'
        : 'Use "Done editing" before opening the version diff.',
    });
  }, []);
  const handleSelectBaseVersion = useCallback((version: number) => {
    if (isEditingMarkdown) {
      warnFinishEditingFirst('versions');
      return Promise.resolve();
    }
    return planDiff.selectBaseVersion(version);
  }, [isEditingMarkdown, planDiff.selectBaseVersion, warnFinishEditingFirst]);
  const handleActivatePlanDiff = useCallback(() => {
    if (isEditingMarkdown) {
      warnFinishEditingFirst('diff');
      return;
    }
    setIsPlanDiffActive(true);
  }, [isEditingMarkdown, warnFinishEditingFirst]);

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
    setShareHtml('');
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
  const htmlRefresh = useHtmlRefresh({
    enabled: isApiMode && annotateMode && isHtmlSurface && !liveApp,
    activePath: activeHtmlPath,
    onSnapshot: applyRefreshedHtml,
    onUnanchored: handleHtmlRefreshUnanchored,
  });
  const canUseWideMode = useMemo(() => canUseAnnotateWideMode({
    isPlanDiffActive,
  }), [isPlanDiffActive]);

  const enterViewMode = useCallback((type: WideModeType) => {
    if (!canUseWideMode) return;
    if (wideModeType === null) {
      wideModeSnapshotRef.current = {
        sidebarIsOpen: sidebar.isOpen,
        sidebarTab: sidebar.activeTab,
        panelOpen: isPanelOpen,
      };
    }
    if (isAgentTerminalOpen) hideAgentTerminal();
    setWideModeType(type);
    sidebar.close();
    setIsPanelOpen(false);
  }, [canUseWideMode, hideAgentTerminal, isAgentTerminalOpen, isPanelOpen, wideModeType, sidebar.activeTab, sidebar.close, sidebar.isOpen]);

  const toggleViewMode = useCallback((type: WideModeType) => {
    if (wideModeType === type) {
      exitWideMode();
    } else {
      enterViewMode(type);
    }
  }, [enterViewMode, exitWideMode, wideModeType]);

  useEffect(() => {
    if (!canUseWideMode && wideModeType !== null) {
      exitWideMode();
    }
  }, [canUseWideMode, exitWideMode, wideModeType]);

  // Markdown file browser
  const fileBrowser = useFileBrowser();
  // The browser is scoped to the project the session was launched in. There
  // is no user-configured list of extra directories: browsing arbitrary
  // folders was a settings surface nobody used, so the project root is the
  // whole tree.
  const showFilesTab = !!projectRoot;

  // Shared gate for the chrome-level keyboard commands (sidebars, focus mode):
  // never while a dialog, an overlay, a submission, or a text field owns the
  // keystroke. Annotate-only commands layer their own conditions on top.
  const canHandleDocumentChromeShortcut = useCallback((event: KeyboardEvent) => {
    if (goalSetupMode) return false;
    if (event.defaultPrevented) return false;
    if (document.querySelector('[data-hypermark-confirm-dialog="true"]')) return false;
    if (showFeedbackPrompt || showClaudeCodeWarning ||
        showSourceFileEditWarning ||
        showExitWarning) return false;
    if (submitted || isSubmitting || isExiting || isEditingMarkdown) return false;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    return tag !== 'INPUT' && tag !== 'TEXTAREA' && !target?.isContentEditable;
  }, [
    goalSetupMode,
    showFeedbackPrompt,
    showClaudeCodeWarning,
    showSourceFileEditWarning,
    showExitWarning,
    submitted,
    isSubmitting,
    isExiting,
    isEditingMarkdown,
  ]);

  const canHandleAnnotateSidebarShortcut = useCallback(
    (event: KeyboardEvent) => annotateMode && canHandleDocumentChromeShortcut(event),
    [annotateMode, canHandleDocumentChromeShortcut],
  );

  const canHandleAnnotationHistoryShortcut = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || submitted || isSubmitting || isExiting) return false;
    if (isEditingMarkdown || isNativeHistoryOwner(event)) return false;
    return !hasActiveHistoryOverlay(document);
  }, [isEditingMarkdown, isExiting, isSubmitting, submitted]);

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

  // Focus mode from the keyboard. Mirrors the document card's `Focus` control —
  // including its availability — so the shortcut can never park the layout in a
  // state with no visible way back. HTML surfaces cannot ENTER focus mode (they
  // own their own persisted chrome and never render that control), but exit stays
  // available everywhere: a linked-doc navigation can flip the surface to HTML
  // while focus mode is active, and without the exit path that layout is stuck.
  const handleToggleFocusMode = useCallback(() => {
    const action = resolveFocusShortcutAction({
      canUseWideMode: canUseWideMode && !isHtmlSurface,
      wideModeType,
    });
    if (action === 'enter-focus') enterViewMode('focus');
    else if (action === 'exit') exitWideMode();
  }, [canUseWideMode, enterViewMode, exitWideMode, isHtmlSurface, wideModeType]);

  useDocumentViewShortcuts({
    handlers: {
      toggleFocusMode: {
        when: (event) =>
          canHandleDocumentChromeShortcut(event)
          && ((canUseWideMode && !isHtmlSurface) || wideModeType !== null),
        handle: handleToggleFocusMode,
      },
    },
  });

  useAnnotateSidebarShortcuts({
    handlers: {
      toggleContents: {
        when: canHandleAnnotateSidebarShortcut,
        handle: () => toggleSidebarTab('toc'),
      },
      toggleFiles: {
        when: (event) => canHandleAnnotateSidebarShortcut(event) && showFilesTab,
        handle: () => toggleSidebarTab('files'),
      },
    },
  });

  useDoubleTapShortcuts({
    scope: annotateSidebarShortcuts,
    handlers: {
      toggleAgentTui: {
        when: (event) =>
          canHandleAnnotateSidebarShortcut(event) &&
          annotateSource !== 'message' &&
          agentTerminalCapability !== null,
        handle: () => toggleAgentTerminal(),
      },
    },
  });

  const fileBrowserDirs = useMemo(
    () => (projectRoot ? [projectRoot] : []),
    [projectRoot],
  );

  // Clear active file when file browser is disabled
  useEffect(() => {
    if (!showFilesTab) fileBrowser.setActiveFile(null);
  }, [showFilesTab]);

  useEffect(() => {
    if (sidebar.activeTab === 'files' && showFilesTab) {
      if (fileBrowserDirs.length > 0) {
        const loaded = fileBrowser.dirs.map(d => d.path);
        const needsReload = fileBrowserDirs.some(d => !loaded.includes(d))
          || loaded.some(d => !fileBrowserDirs.includes(d));
        if (needsReload) fileBrowser.fetchAll(fileBrowserDirs);
      }
    }
  }, [fileBrowserDirs, showFilesTab, sidebar.activeTab]);

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
    // currentFeedbackPayload (useMemo) -> getCurrentFeedbackPayload.
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

  const handleFileBrowserSelect = React.useCallback(async (absolutePath: string, dirPath: string): Promise<void> => {
    const normalizedAbsolutePath = normalizeBrowserPath(absolutePath);
    const dirState = fileBrowser.dirs.find(d => d.path === dirPath);
    const normalizedDirPath = normalizeBrowserPath(dirPath);
    const dirPrefix = normalizedDirPath === "/" || /^[A-Za-z]:\/$/.test(normalizedDirPath)
      ? normalizedDirPath
      : `${normalizedDirPath}/`;
    const relativePath = normalizedAbsolutePath === normalizedDirPath
      ? ""
      : normalizedAbsolutePath.startsWith(dirPrefix)
        ? normalizedAbsolutePath.slice(dirPrefix.length)
        : undefined;
    const editableStatus = getFileEditStatus(
      absolutePath,
      editableDocuments.fileEditStatuses,
      relativePath,
      dirState?.workspaceStatus,
    );
    const editableKey = editableStatus?.key ?? `file:${absolutePath}`;
    const editableRecord = editableDocuments.getDocument(editableKey);
    if (editableRecord?.missingOnDisk && editableRecord.sourceSave?.enabled) {
      linkedDocHook.openLoaded({
        filepath: editableRecord.path ?? absolutePath,
        markdown: editableRecord.currentText,
        renderAs: 'markdown',
        sourceSave: editableRecord.sourceSave,
      }, 'files', { notifyDocumentLoaded: false });
      editableDocuments.setActiveKey(editableKey);
      if (isEditingMarkdown) {
        editSessionBaseRef.current = editableRecord.currentText;
        setEditorDirty(false);
        setEditorDiffersFromBaseline(editableRecord.currentText !== editableRecord.diskBaseline);
        setEditStats(
          editableRecord.currentText !== editableRecord.diskBaseline
            ? computeEditStats(editableRecord.diskBaseline, editableRecord.currentText)
            : null,
        );
      }
      fileBrowser.setActiveFile(absolutePath);
      return;
    }

    // `doc=1`: file-browser selections always want annotatable document
    // rendering — without it, extensions that overlap the code-file set
    // (.yaml, .json, .toml, …) would come back as code-file popout payloads.
    const buildUrl = (path: string) => `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(dirPath)}&doc=1${convertHtml ? '&convert=1' : ''}`;
    fileBrowser.setActiveFile(absolutePath);
    await linkedDocHook.open(absolutePath, buildUrl, 'files');
  }, [editableDocuments, linkedDocHook, fileBrowser, convertHtml, isEditingMarkdown]);

  // Route linked doc opens through the correct endpoint based on current context
  const handleOpenLinkedDoc = React.useCallback((docPath: string) => {
    if (fileBrowser.activeFile && fileBrowser.activeDirPath) {
      // When viewing a file browser doc, resolve links relative to current file's directory
      const baseDir = linkedDocHook.filepath?.replace(/\/[^/]+$/, '') || fileBrowser.activeDirPath;
      linkedDocHook.open(docPath, (path) =>
        `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(baseDir)}${convertHtml ? '&convert=1' : ''}`
      );
    } else {
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
    }
  }, [fileBrowser.dirs, fileBrowser.activeDirPath, fileBrowser.activeFile, linkedDocHook, imageBaseDir, convertHtml]);

  // Wrap linked doc back to also clear file browser active file
  const handleLinkedDocBack = React.useCallback(() => {
    linkedDocHook.back();
    if (isEditingMarkdown) {
      setIsEditingMarkdown(false);
      setEditorDirty(false);
      setEditorDiffersFromBaseline(false);
    }
    fileBrowser.setActiveFile(null);
  }, [linkedDocHook, isEditingMarkdown, fileBrowser]);

  // Derive annotation counts per file from linked doc cache (includes active doc's live state)
  const allAnnotationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [fp, cached] of linkedDocHook.getDocAnnotations()) {
      const count = cached.annotations.length + cached.globalAttachments.length;
      if (count > 0) counts.set(fp, count);
    }
    return counts;
  }, [linkedDocHook.getDocAnnotations, annotations, globalAttachments]);

  // FileBrowser counts: all files under any loaded dir (regular + vault)
  const fileAnnotationCounts = useMemo(() => {
    const allDirPaths = fileBrowser.dirs.map(d => d.path);
    if (allDirPaths.length === 0) return allAnnotationCounts;
    const counts = new Map<string, number>();
    for (const [fp, count] of allAnnotationCounts) {
      if (allDirPaths.some(dir => pathIsInsideDir(fp, dir))) {
        counts.set(fp, count);
      }
    }
    return counts;
  }, [allAnnotationCounts, fileBrowser.dirs]);

  const hasFileAnnotations = fileAnnotationCounts.size > 0;

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

  // Flash highlight for annotated files in the sidebar
  const [highlightedFiles, setHighlightedFiles] = useState<Set<string> | undefined>();
  const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleFlashAnnotatedFiles = React.useCallback(() => {
    const filePaths = new Set(allAnnotationCounts.keys());
    if (filePaths.size === 0) return;
    // Open sidebar to the files tab so the flash is visible
    if (!sidebar.isOpen || sidebar.activeTab !== 'files') {
      openSidebarTab('files');
    }
    // Cancel any pending clear from a previous flash
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    // Clear first so re-triggering restarts the CSS animation
    setHighlightedFiles(undefined);
    requestAnimationFrame(() => {
      setHighlightedFiles(filePaths);
      flashTimerRef.current = setTimeout(() => setHighlightedFiles(undefined), 1200);
    });
  }, [allAnnotationCounts, openSidebarTab, sidebar]);

  // Context-aware back label for linked doc navigation
  const backLabel = annotateSource === 'folder' ? 'file list'
    : annotateSource === 'file' ? 'file'
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
      : `plan:${editGeneration}`;

  // Track active section for TOC highlighting
  const headingCount = useMemo(() => blocks.filter(b => b.type === 'heading').length, [blocks]);
  const activeSection = useActiveSection(planAreaRef, headingCount, scrollViewport);

  const { externalAnnotations, updateExternalAnnotation, deleteExternalAnnotation } = useExternalAnnotations<Annotation>({
    enabled: isApiMode && !goalSetupMode,
  });

  // Drive DOM highlights for SSE-delivered external annotations. Disabled
  // while a linked doc overlay is open (Viewer DOM is hidden) and while the
  // plan diff view is active (diff view has its own annotation surface).
  const { reset: resetExternalHighlights } = useExternalAnnotationHighlights({
    viewerRef,
    externalAnnotations,
    enabled: isApiMode && !goalSetupMode && !linkedDocHook.isActive && !isPlanDiffActive && !isEditingMarkdown,
    planKey: markdown,
  });

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
        ext.originalText === a.originalText
      );
    });

    return [...local, ...externalAnnotations];
  }, [annotations, externalAnnotations]);

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

  // Lazily fetch the SKILL.md contents of referenced HUMAN-ONLY skills so the
  // exported feedback can inject their instructions (a human referencing a
  // human-only skill IS the human invocation). Runs whenever comment state
  // changes — covering typed comments, panel edits, draft restore, and
  // external annotations — and bumps a generation so memoized exports
  // recompute once content lands. A submit that races the fetch degrades to
  // the name + directory fallback inside skillReferenceExportBlock.
  const [skillContentGeneration, setSkillContentGeneration] = useState(0);
  useEffect(() => {
    if (!isApiMode) return;
    // Only reviewer-written comments prime skill contents. Annotations with a
    // `source` arrived through the unauthenticated external-annotations API
    // and can never cause injection (see skillReferenceExportBlock), so their
    // references must not trigger content fetches either.
    const texts: Array<string | undefined> = [];
    for (const a of allAnnotations) if (!a.source) texts.push(a.text);
    for (const a of codeAnnotations) if (!a.source) texts.push(a.text);
    for (const entry of linkedDocHook.getDocAnnotations().values()) {
      for (const a of entry.annotations) if (!a.source) texts.push(a.text);
    }
    if (messageMultiSelectMode) {
      for (const state of getMessageStatesWithCurrent().values()) {
        for (const a of state.linkedDocSession.root.annotations) if (!a.source) texts.push(a.text);
        for (const doc of state.linkedDocSession.docs.values()) {
          for (const a of doc.annotations) if (!a.source) texts.push(a.text);
        }
        for (const a of state.codeAnnotations) if (!a.source) texts.push(a.text);
      }
    }
    let cancelled = false;
    primeSkillContentsForExport(texts).then((changed) => {
      if (changed && !cancelled) setSkillContentGeneration((g) => g + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [
    isApiMode,
    allAnnotations,
    codeAnnotations,
    linkedDocHook.docAnnotationCount,
    linkedDocHook.getDocAnnotations,
    messageMultiSelectMode,
    getMessageStatesWithCurrent,
    activeMessageAnnotationCounts,
  ]);

  const annotationsOutput = useMemo(() => {
    const docAnnotations = linkedDocHook.getDocAnnotations();
    const hasDocAnnotations = Array.from(docAnnotations.values()).some(
      (d) => d.annotations.length > 0 || d.globalAttachments.length > 0
    );
    const hasPlanAnnotations = allAnnotations.length > 0 || globalAttachments.length > 0;
    const hasCodeAnnotations = codeAnnotations.length > 0;

    if (!hasPlanAnnotations && !hasDocAnnotations && !hasCodeAnnotations) {
      return 'User reviewed the document and has no feedback.';
    }

    const activeConverted = linkedDocHook.isActive
      ? (docAnnotations.get(linkedDocHook.filepath ?? '')?.isConverted ?? false)
      : sourceConverted;

    let output = hasPlanAnnotations
      ? exportAnnotations(
          blocks,
          allAnnotations,
          globalAttachments,
          annotateSource === 'message' ? 'Message Feedback' : annotateSource === 'folder' ? 'Folder Feedback' : annotateSource === 'file' ? 'File Feedback' : 'Plan Feedback',
          annotateSource ?? 'plan',
          { sourceConverted: activeConverted },
        )
      : '';

    if (hasDocAnnotations) {
      const enriched: Map<string, LinkedDocAnnotationEntry> = new Map(docAnnotations);
      for (const [filepath, entry] of enriched) {
        if (entry.markdown) {
          enriched.set(filepath, {
            ...entry,
            blocks: parseMarkdownToBlocks(entry.markdown, { frontmatter: shouldStripFrontmatter(filepath) }),
          });
        }
      }
      output += exportLinkedDocAnnotations(enriched);
    }

    if (hasCodeAnnotations) {
      output += exportCodeFileAnnotations(codeAnnotations);
    }

    return output;
    // skillContentGeneration re-runs this once lazily fetched human-only skill
    // contents land in the export registry (module state the exporters read).
  }, [blocks, allAnnotations, globalAttachments, linkedDocHook.getDocAnnotations, codeAnnotations, sourceConverted, annotateSource, linkedDocHook.isActive, linkedDocHook.filepath, skillContentGeneration]);

  useEffect(() => {
    if (initialSidebarPreferenceAppliedRef.current) return;
    if (isLoading) return;
    if (wideModeType !== null) return;

    initialSidebarPreferenceAppliedRef.current = true;
    if (goalSetupMode || annotateSource === 'folder') return;
    // HTML chrome is owned by the surface-transition effect below, which also
    // covers linked .html docs opened from a markdown session.
    if (renderAs === 'html') return;
    if (uiPrefs.tocEnabled && hasTocEntries) {
      sidebar.open('toc');
    }
  }, [
    annotateSource,
    goalSetupMode,
    hasTocEntries,
    isLoading,
    renderAs,
    sidebar.close,
    sidebar.open,
    uiPrefs.tocEnabled,
    wideModeType,
  ]);

  // Restore-on-entry: every time the session transitions ONTO an HTML surface
  // (a root raw-HTML session, or a linked .html doc opened from markdown),
  // apply the sidebar/panel/toolsHidden state the user last left an HTML
  // session with (first-ever run: both closed, tools visible). A restored
  // toolsHidden:true always has a way back: the header's eye toggle.
  // Re-restoring on each entry is also what keeps a markdown surface's
  // sidebar state from leaking into the HTML cookie on the way back.
  const prevHtmlChromeSurfaceRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (wideModeType !== null) return;
    const wasHtml = prevHtmlChromeSurfaceRef.current;
    prevHtmlChromeSurfaceRef.current = isHtmlSurface;
    if (!isHtmlSurface || wasHtml) return;
    if (goalSetupMode || annotateSource === 'folder') return;
    const chrome = getHtmlChromeState();
    skipNextHtmlChromeSaveRef.current = true;
    if (chrome.sidebarOpen) sidebar.open();
    else sidebar.close();
    setIsPanelOpen(chrome.panelOpen);
    setHtmlToolsHidden(chrome.toolsHidden);
    htmlChromeRestoredRef.current = true;
  }, [
    annotateSource,
    goalSetupMode,
    isHtmlSurface,
    isLoading,
    sidebar.close,
    sidebar.open,
    wideModeType,
  ]);

  // Persist the chrome the user leaves an HTML session in (sidebar + panel
  // open state), so the next raw-HTML session opens exactly as they left this
  // one. Gated on the restore having run — a pre-restore render must not save
  // the transient defaults over the user's remembered state — and on being ON
  // the HTML surface, so a linked markdown doc's sidebar use never writes here.
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
    saveHtmlChromeState({ sidebarOpen: sidebar.isOpen, panelOpen: isPanelOpen, toolsHidden: htmlToolsHidden });
  }, [isHtmlSurface, sidebar.isOpen, isPanelOpen, htmlToolsHidden]);

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

  // The user's current direct-edit text: the open editor buffer, else the
  // last commit; null when there is none or it matches the baseline. Never
  // the shared `markdown` state, which linked docs, message switching, and
  // checkbox toggles legitimately mutate. Feeds both the draft auto-save and
  // the Direct Edits feedback section.
  const getEditedMarkdown = useCallback((): string | null => {
    const activeDocument = editableDocuments.getActiveDocumentLive();
    if (activeDocument?.sourceSave?.enabled) {
      const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
      return normalizeEditedMarkdown(activeDocument.diskBaseline, live ?? activeDocument.currentText);
    }

    const base = originalMarkdownRef.current;
    if (base === null) return null;
    const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
    return normalizeEditedMarkdown(base, live ?? editedMarkdownRef.current);
  }, [editableDocuments, isEditingMarkdown]);

  const getDraftEditedMarkdown = useCallback((): string | null => {
    if (editableDocuments.getActiveDocumentLive()?.sourceSave?.enabled) return null;
    return getEditedMarkdown();
  }, [editableDocuments, getEditedMarkdown]);

  // Auto-save annotation drafts
  const handleRestoreDraftRef = useRef<(loadedDraft?: any, meta?: any) => Promise<void>>(() => Promise.resolve());
  const { restoreDraft, scheduleDraftSave, scheduleDraftSaveAfterSubmitFailure, getDraftGeneration, discardDraft, flushDraft } = useAnnotationDraft({
    annotations: allAnnotations,
    codeAnnotations,
    globalAttachments,
    getEditedMarkdown: getDraftEditedMarkdown,
    getEditedDocuments: editableDocuments.getDraftDocuments,
    getSavedFileChanges: editableDocuments.getDraftSavedFileChanges,
    isApiMode: isApiMode && !goalSetupMode,
    // No share transport remains, so drafts always persist for a live session.
    isSharedSession: false,
    // isSubmitting counts: a save firing while approve/deny is in flight can
    // land after the server's draft delete and ghost a draft
    // into the next session for this plan. Saving resumes if it fails.
    submitted: !!submitted || isSubmitting,
    onDraftLoaded: (draft, meta) => handleRestoreDraftRef.current(draft, meta),
  });

  // Markdown edit mode: single consolidated gate. The editor only ever opens on
  // the main plan/file markdown — never on HTML surfaces, goal-setup
  // views, linked docs, messages, folder pickers, or diff view.
  const canEditMarkdown =
    renderAs !== 'html' &&
    // editStats non-null keeps the toggle available after committing an
    // emptied document, so the user can re-enter and undo. Source-backed files
    // are editable even when they start empty.
    (activeEditableDocument?.sourceSave?.enabled || displayedMarkdown !== '' || editStats !== null) &&
    !goalSetupMode &&
    (!linkedDocHook.isActive || (annotateSource === 'folder' && activeEditableDocument?.sourceSave?.enabled)) &&
    !isPlanDiffActive &&
    annotateSource !== 'message' &&
    !submitted;

  // Swap the document to `next` and re-resolve annotation block anchors against
  // the new parse so exported line labels don't point at stale content.
  // Annotations whose text no longer exists get blockId '' — exportAnnotations
  // omits the line label instead of emitting a wrong one. Returns the remapped
  // objects so callers repaint THOSE, not the pre-remap ones (whose stale
  // startMeta/endMeta would let fromStore() silently highlight wrong content).
  // `list` defaults to current state; draft restore passes the restored set,
  // which isn't in state yet when the remap runs.
  const applyEditedDocument = useCallback((next: string, list?: Annotation[]): Annotation[] => {
    annotationHistory.clear();
    const sourceAnnotations = list ?? annotationsRef.current;
    // Match the display parse (blocks memo) — the active document's
    // frontmatter rule must apply here too or the remapped blockIds drift.
    const newBlocks = parseMarkdownToBlocks(next, { frontmatter: parseFrontmatterRef.current });
    const remapped = sourceAnnotations.map((a) => {
      if (a.diffContext || a.type === AnnotationType.GLOBAL_COMMENT || a.id.startsWith('ann-checkbox-')) return a;
      const blk = newBlocks.find((b) => b.content.includes(a.originalText));
      if ((blk?.id ?? '') === a.blockId) return a;
      // Block moved: also strip startMeta/endMeta — fromStore() anchors by
      // positional parent index without validating text. Text-search is safe.
      return { ...a, blockId: blk?.id ?? '', startMeta: undefined, endMeta: undefined };
    });
    setMarkdown(next);
    setEditGeneration((g) => g + 1);
    annotationsRef.current = remapped;
    setAnnotations(remapped);
    return remapped;
  }, [annotationHistory]);

  // The Viewer is remounted after every edit-mode exit (it was unmounted while
  // editing), so highlight DOM is rebuilt from scratch. Re-anchor via the same
  // text-search restore used by draft/share/linked-doc flows, then report
  // annotations whose text vanished. resetExternalHighlights repaints live SSE
  // annotation highlights the same way the share-import path does.
  const repaintHighlights = useCallback((list: Annotation[]) => {
    resetExternalHighlights();
    const planAnnotations = list.filter(
      (a) => !a.diffContext && a.type !== AnnotationType.GLOBAL_COMMENT && !a.id.startsWith('ann-checkbox-')
    );
    if (planAnnotations.length === 0) return;
    setTimeout(() => {
      viewerRef.current?.applySharedAnnotations(planAnnotations);
      // web-highlighter restores use data-highlight-id; manual code-block
      // wraps use data-bind-id. Either counts as present.
      const missing = planAnnotations.filter(
        (a) => !document.querySelector(`[data-bind-id="${a.id}"], [data-highlight-id="${a.id}"]`)
      );
      if (missing.length > 0) {
        toast(`${missing.length} annotation${missing.length === 1 ? '' : 's'} no longer match the text`, {
          description: 'The highlighted text was edited. They remain listed in the panel.',
          duration: 5000,
        });
      }
    }, 120);
  }, [resetExternalHighlights]);

  // Commits the open editor buffer: updates markdown state, records the edit
  // for the Direct Edits diff, re-anchors annotations, repaints highlights.
  const commitMarkdownEdits = useCallback(() => {
    if (!isEditingMarkdown) return;
    const edited = markdownEditorHandleRef.current?.getMarkdown();
    setIsEditingMarkdown(false);
    setEditorDirty(false);
    setEditorDiffersFromBaseline(false);

    const base = originalMarkdownRef.current;
    if (edited != null) {
      if (activeEditableDocument?.sourceSave?.enabled) {
        editableDocuments.updateActiveText(edited, { forceNotify: true });
        const sourceEdited = normalizeEditedMarkdown(activeEditableDocument.diskBaseline, edited);
        editedMarkdownRef.current = null;
        setEditStats(sourceEdited !== null ? computeEditStats(activeEditableDocument.diskBaseline, sourceEdited) : null);
        if (sourceEdited !== null && window.innerWidth >= 768) {
          setIsPanelOpen(true);
        }
      } else {
        const normalizedEdited = normalizeEditedMarkdown(base, edited);
        editedMarkdownRef.current = normalizedEdited;
        setEditStats(base !== null && normalizedEdited !== null ? computeEditStats(base, normalizedEdited) : null);
        // Surface the Direct Edits card so the user sees where their changes went.
        if (base !== null && normalizedEdited !== null && window.innerWidth >= 768) {
          setIsPanelOpen(true);
        }
      }
    }

    const renderedBaseline = activeEditableDocument?.sourceSave?.enabled ? markdown : displayedMarkdown;
    const remapped = edited != null && edited !== renderedBaseline ? applyEditedDocument(edited) : annotations;
    repaintHighlights(remapped);
    scheduleDraftSave();
  }, [activeEditableDocument, displayedMarkdown, editableDocuments, isEditingMarkdown, annotations, markdown, applyEditedDocument, repaintHighlights, scheduleDraftSave]);

  // Discards direct edits for one document. Source-backed folder edits are
  // file-scoped; normal plan-review edits still have a single document.
  const handleDiscardEdits = useCallback((sourceKey?: string) => {
    const targetKey = sourceKey ?? activeEditableDocument?.key;
    const targetIsActive = !!targetKey && editableDocuments.getActiveKey() === targetKey;
    const targetRecord = targetKey ? editableDocuments.getDocument(targetKey) : null;
    if (sourceKey && !targetRecord?.sourceSave?.enabled) return;

    if (targetKey && targetRecord?.sourceSave?.enabled) {
      const discarded = editableDocuments.discardDocument(targetKey);
      if (!discarded) return;
      if (!targetIsActive) {
        scheduleDraftSave();
        return;
      }

      setIsEditingMarkdown(false);
      setEditorDirty(false);
      setEditorDiffersFromBaseline(false);
      editedMarkdownRef.current = null;
      setEditStats(null);
      if (discarded.missingOnDisk) {
        if (linkedDocHook.isActive) {
          linkedDocHook.back();
          fileBrowser.setActiveFile(null);
        } else {
          const remapped = displayedMarkdown !== ''
            ? applyEditedDocument('')
            : annotations;
          repaintHighlights(remapped);
          originalMarkdownRef.current = '';
        }
        scheduleDraftSave();
        return;
      }
      const remapped = displayedMarkdown !== discarded.diskBaseline
        ? applyEditedDocument(discarded.diskBaseline)
        : annotations;
      repaintHighlights(remapped);
      scheduleDraftSave();
      return;
    }

    const base = originalMarkdownRef.current;
    if (base === null) return;
    setIsEditingMarkdown(false);
    setEditorDirty(false);
    setEditorDiffersFromBaseline(false);
    editedMarkdownRef.current = null;
    setEditStats(null);
    const remapped = markdown !== base ? applyEditedDocument(base) : annotations;
    repaintHighlights(remapped);
    scheduleDraftSave();
  }, [activeEditableDocument, editableDocuments, displayedMarkdown, markdown, annotations, applyEditedDocument, repaintHighlights, linkedDocHook, fileBrowser, scheduleDraftSave]);

  // Restores a recovered draft: annotations always; direct edits when present
  // and the baseline exists. Edits flow through the same helpers
  // commitMarkdownEdits uses, with the RESTORED annotations remapped against
  // the edited document (they aren't in state yet when the remap runs).
  const resolveSavedFileChangeSource = useCallback((
    change: SavedFileChangeDraftData,
  ) => {
    return probeSourceSave(change.path);
  }, []);

  const validateDraftSavedFileChanges = useCallback(async (
    changes: SavedFileChangeDraftData[],
  ): Promise<{ kept: SavedFileChangeDraftData[]; changedOrMissing: SavedFileChangeDraftData[]; unverified: SavedFileChangeDraftData[] }> => {
    if (changes.length === 0) return { kept: [], changedOrMissing: [], unverified: [] };
    const result = await validateSavedFileChanges(changes, resolveSavedFileChangeSource);
    const changedOrMissing = result.dropped
      .filter((entry) => entry.reason === 'changed' || entry.reason === 'missing')
      .map((entry) => entry.change);

    if (changedOrMissing.length > 0) {
      toast('Some saved edit context was not restored', {
        description: 'Those files changed or disappeared after Hypermark saved them.',
        duration: 5000,
      });
    }
    if (result.unverified.length > 0) {
      toast('Some saved edit context could not be verified', {
        description: 'Hypermark kept it for now and will check again before sending feedback.',
        duration: 5000,
      });
    }

    return {
      kept: [...result.valid, ...result.unverified],
      changedOrMissing,
      unverified: result.unverified,
    };
  }, [resolveSavedFileChangeSource]);

  const handleRestoreDraft = React.useCallback(async (
    loadedDraft?: ReturnType<typeof restoreDraft>,
    meta?: { count: number; timeAgo: string; hasEdits: boolean },
  ) => {
    annotationHistory.clear();
    const {
      annotations: restored,
      codeAnnotations: restoredCode,
      // Legacy top-level images arrive already folded into a GLOBAL_COMMENT
      // inside `restored` by useAnnotationDraft's restore-time normalizer
      // (spec 05 §4.1) — `globalAttachments` here is always empty and has no
      // write path left.
      editedMarkdown,
      editedDocuments,
      savedFileChanges,
    } = loadedDraft ?? restoreDraft();
    if (restoredCode.length > 0) setCodeAnnotations(restoredCode);

    const showRestoredToast = () => {
      if (meta) {
        const parts = [
          meta.count > 0 ? `${meta.count} annotation${meta.count !== 1 ? 's' : ''}` : '',
          meta.hasEdits ? 'unsent direct edits' : '',
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
    };

    const nestedSavedFileChanges = editedDocuments
      .map((doc) => doc.savedChange)
      .filter((change): change is SavedFileChangeDraftData => !!change);
    const savedChangeCandidates = new Map<string, SavedFileChangeDraftData>();
    for (const change of [...savedFileChanges, ...nestedSavedFileChanges]) {
      savedChangeCandidates.set(change.key, change);
    }
    const validatedSaved = await validateDraftSavedFileChanges([...savedChangeCandidates.values()]);
    const validSavedChangeByKey = new Map(validatedSaved.kept.map((change) => [change.key, change]));
    const editedDocumentKeys = new Set(editedDocuments.map((doc) => doc.key));
    const cleanSavedFileChanges = validatedSaved.kept.filter((change) => !editedDocumentKeys.has(change.key));
    const editedDocumentsForRestore: DraftEditedDocument[] = editedDocuments.map((doc) =>
      doc.savedChange
        ? { ...doc, savedChange: validSavedChangeByKey.get(doc.savedChange.key) }
        : doc
    );

    if (cleanSavedFileChanges.length > 0) {
      editableDocuments.restoreSavedFileChanges(cleanSavedFileChanges);
      if (window.innerWidth >= 768) {
        setIsPanelOpen(true);
      }
    }

    if (editedDocumentsForRestore.length > 0) {
      if (isEditingMarkdown) {
        toast('Draft file edits were not restored', {
          description: 'You already have edits in this session — those take precedence.',
          duration: 5000,
        });
      } else {
        const restoredDocumentKeys = editableDocuments.restoreDraftDocuments(editedDocumentsForRestore);
        if (restoredDocumentKeys.length < editedDocumentsForRestore.length) {
          toast('Some draft file edits were not restored', {
            description: 'You already have edits in this session — those take precedence.',
            duration: 5000,
          });
        }
        const restoredSingleFileDraft = pickRestoredSingleFileDraftToDisplay(
          editedDocumentsForRestore,
          restoredDocumentKeys,
          editableDocuments.getActiveKey(),
        );
        if (restoredSingleFileDraft) {
          editableDocuments.setActiveKey(restoredSingleFileDraft.key);
          const restoredDocument = editableDocuments.getDocument(restoredSingleFileDraft.key);
          if (restoredDocument?.sourceSave?.enabled) {
            const remapped = applyEditedDocument(restoredDocument.currentText, restored);
            repaintHighlights(remapped);
            if (restoredDocument.currentText !== restoredDocument.diskBaseline) {
              setEditStats(computeEditStats(restoredDocument.diskBaseline, restoredDocument.currentText));
              if (window.innerWidth >= 768) {
                setIsPanelOpen(true);
              }
            }
            scheduleDraftSave();
            showRestoredToast();
            return;
          }
        }
        const activeRestoredDocument = editableDocuments.getActiveDocumentLive();
        const activeDraft = activeRestoredDocument?.sourceSave?.enabled && restoredDocumentKeys.includes(activeRestoredDocument.key)
          ? editedDocumentsForRestore.find((doc) => doc.key === activeRestoredDocument.key)
          : undefined;
        if (activeDraft && activeRestoredDocument) {
          const remapped = applyEditedDocument(activeRestoredDocument.currentText, restored);
          repaintHighlights(remapped);
          if (activeRestoredDocument.currentText !== activeRestoredDocument.diskBaseline) {
            setEditStats(computeEditStats(activeRestoredDocument.diskBaseline, activeRestoredDocument.currentText));
            if (window.innerWidth >= 768) {
              setIsPanelOpen(true);
            }
          }
          scheduleDraftSave();
          showRestoredToast();
          return;
        }
      }
    }

    // CRLF normalize is insurance against a hand-edited draft file — a \r
    // here would fabricate a whole-document diff against the LF baseline.
    const base = originalMarkdownRef.current;
    const edited = editedMarkdown !== null ? editedMarkdown.replace(/\r\n?/g, '\n') : null;
    // editStats/isEditingMarkdown guards are defensive: the restore dialog is
    // modal on load, so live edits can't exist yet — but if they ever do,
    // the user's current work wins over the draft.
    if (edited !== null && base !== null && edited !== base && editStats === null && !isEditingMarkdown) {
      editedMarkdownRef.current = edited;
      setEditorDiffersFromBaseline(false);
      setEditStats(computeEditStats(base, edited));
      if (window.innerWidth >= 768) {
        setIsPanelOpen(true);
      }
      const remapped = applyEditedDocument(edited, restored);
      repaintHighlights(remapped);
      scheduleDraftSave();
      showRestoredToast();
      return;
    }
    if (edited !== null && (editStats !== null || isEditingMarkdown)) {
      // Skipped, not silently dropped: the user started editing before the
      // (late) draft banner was answered. Their live work wins.
      toast('Draft edits were not restored', {
        description: 'You already have edits in this session — those take precedence.',
        duration: 5000,
      });
    }

    if (restored.length > 0) {
      setAnnotations(restored);
      // Apply highlights to DOM after a tick
      setTimeout(() => {
        viewerRef.current?.applySharedAnnotations(restored.filter(a => !a.diffContext));
      }, 100);
    }
    scheduleDraftSave();
    showRestoredToast();
  }, [annotationHistory, restoreDraft, validateDraftSavedFileChanges, editStats, isEditingMarkdown, editableDocuments, activeEditableDocument, markdown, applyEditedDocument, repaintHighlights, scheduleDraftSave, discardDraft]);
  handleRestoreDraftRef.current = handleRestoreDraft;

  const handleEditToggle = useCallback(() => {
    if (isEditingMarkdown) {
      commitMarkdownEdits();
      return;
    }
    // Normalize CRLF before it becomes a baseline (e.g. share-imported content) —
    // CM6 emits \n-joined text, and a CRLF baseline would fabricate a full diff.
    const normalized = displayedMarkdown.includes('\r') ? displayedMarkdown.replace(/\r\n?/g, '\n') : displayedMarkdown;
    if (normalized !== displayedMarkdown) {
      if (activeEditableDocument?.sourceSave?.enabled) {
        editableDocuments.updateActiveText(normalized, { forceNotify: true });
      } else {
        setMarkdown(normalized);
      }
    }
    // Safety net for paths that loaded content without setting the baseline.
    if (originalMarkdownRef.current === null) originalMarkdownRef.current = normalized;
    const base = originalMarkdownRef.current;
    editSessionBaseRef.current = normalized;
    if (activeEditableDocument?.sourceSave?.enabled) {
      editableDocuments.beginEdit(normalized);
    }
    setEditorDirty(false);
    setEditorDiffersFromBaseline(
      activeEditableDocument?.sourceSave?.enabled
        ? normalized !== activeEditableDocument.diskBaseline
        : base !== null && normalized !== base
    );
    setIsEditingMarkdown(true);
  }, [activeEditableDocument, displayedMarkdown, editableDocuments, isEditingMarkdown, commitMarkdownEdits]);

  // Live dirty tracking for the open editor session. String compare per
  // keystroke is fine at plan sizes; setState bails out on unchanged values.
  const handleEditorChange = useCallback((md: string) => {
    setEditorDirty(md !== editSessionBaseRef.current);
    if (activeEditableDocument?.sourceSave?.enabled) {
      editableDocuments.updateActiveText(md);
      setEditorDiffersFromBaseline(md !== activeEditableDocument.diskBaseline);
    } else {
      const base = originalMarkdownRef.current;
      setEditorDiffersFromBaseline(base !== null && md !== base);
    }
    // Mid-edit keystrokes persist too — a crash loses at most the debounce
    // window. The hook reads the live buffer via getDraftEditedMarkdown.
    if (agentTerminalDeliveryRef.current) {
      setAgentFeedbackRevision((version) => version + 1);
    }
    scheduleDraftSave();
  }, [activeEditableDocument, editableDocuments, scheduleDraftSave]);

  const unsavedEditableDocuments = useMemo(
    () => editableDocuments.getUnsavedDocuments(),
    [editableDocuments, editableDocuments.version],
  );
  const savedFileChanges = useMemo(
    () => editableDocuments.getSavedFileChanges(),
    [editableDocuments, editableDocuments.version],
  );
  const openSourceDocuments = useMemo(
    () => editableDocuments.getSourceDocuments(),
    [editableDocuments, editableDocuments.version],
  );
  const savedFileChangesForValidation = useMemo(() => {
    const sourceByKey = new Map(openSourceDocuments.map((doc) => [doc.key, doc.sourceSave]));
    return savedFileChanges
      .map((change): SavedFileChangeDraftData | null => {
        const sourceSave = sourceByKey.get(change.key);
        return sourceSave ? { ...change, sourceSave } : null;
      })
      .filter((change): change is SavedFileChangeDraftData => change !== null);
  }, [openSourceDocuments, savedFileChanges]);
  const activeSourceSave = activeEditableDocument?.sourceSave?.enabled
    ? activeEditableDocument.sourceSave
    : null;

  // Save-button display is driven by the editableDocuments state machine — one
  // source of truth for dirty/saving/saved, rather than a parallel flag.
  const activeSaveStatus = activeEditableDocument?.saveStatus;
  const hasUnsavedDiskChanges =
    activeSaveStatus === 'dirty' || activeSaveStatus === 'conflict' || activeSaveStatus === 'error' || activeSaveStatus === 'missing';
  // Emphasize the Save control (dot + primary text) whenever there is work to
  // persist or a save is in flight — one predicate drives both so they can't diverge.
  const emphasizeSave = hasUnsavedDiskChanges || activeSaveStatus === 'saving';
  // A rejected save (disk conflict or write error) — surfaced as a destructive
  // dot/label so it reads as "save failed, retry" rather than ordinary unsaved.
  const saveFailed = activeSaveStatus === 'conflict' || activeSaveStatus === 'error';
  const activeSourceBufferDirty =
    activeEditableDocument?.sourceSave?.enabled === true &&
    activeEditableDocument.currentText !== activeEditableDocument.diskBaseline;
  const canOverwriteDiskConflict =
    activeEditableDocument?.sourceSave?.enabled === true &&
    !!activeEditableDocument.diskConflict &&
    activeEditableDocument.currentText !== activeEditableDocument.diskConflict.text;

  // Editing exit control: a source-backed session with unsaved edits gets a
  // two-step "Cancel" (discard + exit). Plan mode and clean source sessions keep
  // the plain "Done" (commit edits + exit), so plan-mode keep behavior is unchanged.
  const cancelMode = isEditingMarkdown && !!activeSourceSave && (
    activeSourceBufferDirty ||
    activeSaveStatus === 'conflict' ||
    activeSaveStatus === 'error'
  );
  const handleEditExitClick = useCallback(() => {
    if (!isEditingMarkdown) { handleEditToggle(); return; }      // enter edit mode
    if (cancelMode) {                                            // discard flow (two-step)
      if (confirmCancelEdits) { setConfirmCancelEdits(false); handleDiscardEdits(); }
      else setConfirmCancelEdits(true);
      return;
    }
    handleEditToggle();                                          // commit edits + exit
  }, [isEditingMarkdown, cancelMode, confirmCancelEdits, handleEditToggle, handleDiscardEdits]);
  // Drop the discard confirmation once it no longer applies — exited the editor,
  // or the doc went clean (e.g. the user saved).
  useEffect(() => {
    if (!cancelMode && confirmCancelEdits) setConfirmCancelEdits(false);
  }, [cancelMode, confirmCancelEdits]);
  // Each file owns its edit state: switching the active file (folder mode keeps
  // the editor open across files) starts the discard confirmation fresh, so an
  // armed "Discard?" on one file can never drop another file's edits on first click.
  useEffect(() => {
    setConfirmCancelEdits(false);
  }, [activeEditableDocument?.key]);

  const hasUnsavedSourceFileBuffers = unsavedEditableDocuments.length > 0;

  // True when the feedback payload carries unsaved direct edits. Source-backed
  // file buffers are ordinary dirty editor state; they only become review
  // context once saved to disk and tracked through savedFileChanges.
  const hasDirectEdits =
    !activeSourceSave &&
    !hasUnsavedSourceFileBuffers &&
    (isEditingMarkdown ? editorDiffersFromBaseline : editedMarkdownRef.current !== null);
  const hasSavedFileChanges = savedFileChanges.length > 0;
  const hasFeedbackContent = hasAnyAnnotations || hasDirectEdits || hasSavedFileChanges;
  const feedbackLoss = feedbackLossDescription(feedbackAnnotationCount, hasDirectEdits);
  const hasUnsentFeedback = feedbackAnnotationCount > 0 || hasDirectEdits;
  const hasOnlySavedFileChanges = hasSavedFileChanges && !hasUnsentFeedback;
  const savedFileChangesLabel = savedFileChanges.length === 1 ? 'saved file change' : 'saved file changes';
  const savedFileChangesVerb = savedFileChanges.length === 1 ? 'is' : 'are';
  const savedFileChangesPronoun = savedFileChanges.length === 1 ? 'it' : 'them';
  const savedFileChangesOnDiskMessage = <>Your {savedFileChangesLabel} {savedFileChangesVerb} already on disk.</>;
  const savedFileAwarenessOnlyMessage = <>{savedFileChangesOnDiskMessage} The agent won't be told about {savedFileChangesPronoun}.</>;
  const savedFileAwarenessMixedMessage = hasSavedFileChanges
    ? <> Your {savedFileChangesLabel} will stay on disk, but the agent won't be told about {savedFileChangesPronoun}.</>
    : null;

  // Pinned "Direct edits" card data for the annotation sidebar. Source-backed
  // documents show saved-to-disk changes only; dirty buffers stay in the editor
  // and file tree until the user explicitly saves.
  const directEditsPanelInfo = useMemo(() => {
    if (savedFileChanges.length > 0) {
      return buildSavedFileChangePanelItems(savedFileChanges);
    }

    if (activeEditableDocument?.sourceSave?.enabled) return null;
    if (!editStats) return null;
    const base = originalMarkdownRef.current;
    const edited = editedMarkdownRef.current;
    if (base === null || edited === null) return null;
    return [buildPlanEditPanelItem(base, edited)];
  }, [activeEditableDocument, editStats, savedFileChanges]);

  // "Direct Edits" feedback section: unified diff of user edits vs the
  // as-submitted baseline. getEditedMarkdown owns the read discipline.
  const buildEditsSection = useCallback((): string => {
    if (activeSourceSave || hasUnsavedSourceFileBuffers) return '';
    const base = originalMarkdownRef.current;
    return buildDirectEditsSection(base, getEditedMarkdown(), sourceConverted);
  }, [activeSourceSave, getEditedMarkdown, hasUnsavedSourceFileBuffers, sourceConverted]);

  const buildSavedChangesSection = useCallback((changes = savedFileChanges): string => {
    return buildSavedFileChangesSection(
      changes.map((change) => ({
        path: change.path,
        basename: change.basename,
        beforeText: change.beforeText,
        afterText: change.afterText,
      })),
    );
  }, [savedFileChanges]);

  const getCurrentFeedbackPayload = useCallback((
    checkedSavedFileChanges = savedFileChanges,
    options?: {
      /** Discard flow: every annotation source is dropped, so the builder
       *  emits the legacy zero payload (plus any direct-edit sections). */
      discardAnnotations?: boolean;
      /** Positive-finish framing for the non-gated discard (spec §3.1). */
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
      title: annotateSource === 'message'
        ? 'Message Feedback'
        : annotateSource === 'folder'
          ? 'Folder Feedback'
          : annotateSource === 'file'
            ? 'File Feedback'
            : 'Plan Feedback',
      subject: annotateSource ?? 'plan',
      sourceConverted: activeConverted,
      directEditsSection: buildEditsSection(),
      savedFileChangesSection: buildSavedChangesSection(checkedSavedFileChanges),
      ...(messageMultiSelectMode && !discard
        ? { messageEntries: buildMessageAnnotationEntries() }
        : {}),
      ...(options?.approvalFraming ? { approvalFraming: true } : {}),
    });
  }, [
    allAnnotations,
    annotateSource,
    blocks,
    buildEditsSection,
    buildMessageAnnotationEntries,
    buildSavedChangesSection,
    codeAnnotations,
    globalAttachments,
    linkedDocHook.filepath,
    linkedDocHook.getDocAnnotations,
    linkedDocHook.isActive,
    messageMultiSelectMode,
    savedFileChanges,
    sourceConverted,
  ]);

  const withDraftGeneration = useCallback((path: string): string => {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}draftGeneration=${getDraftGeneration()}`;
  }, [getDraftGeneration]);

  const validateSavedFileChangesBeforeSubmit = useCallback(async (): Promise<SavedFileChangeDraftData[] | null> => {
    if (savedFileChangesForValidation.length === 0) return [];
    const result = await validateSavedFileChanges(savedFileChangesForValidation, resolveSavedFileChangeSource);
    const stale = result.dropped.filter((entry) => entry.reason === 'changed' || entry.reason === 'missing');

    if (stale.length > 0) {
      editableDocuments.clearSavedFileChanges(stale.map((entry) => entry.change.key));
      scheduleDraftSave();
      toast.error('Saved edits changed on disk', {
        description: 'Hypermark removed the stale edit context. Nothing was sent.',
      });
      return null;
    }

    if (result.unverified.length > 0) {
      toast.error('Saved edits could not be verified', {
        description: 'Check the file tree and try sending feedback again.',
      });
      return null;
    }

    return result.valid;
  }, [editableDocuments, resolveSavedFileChangeSource, savedFileChangesForValidation, scheduleDraftSave]);

  const sourceReconcileSeqRef = useRef<Map<string, number>>(new Map());

  const reconcileOpenSourceDocuments = useCallback(async (changedDir?: string) => {
    const activeKey = editableDocuments.getActiveKey();
    if (isEditingMarkdownRef.current && activeKey) {
      const live = markdownEditorHandleRef.current?.getMarkdown();
      if (live != null) editableDocuments.updateActiveText(live, { forceNotify: true });
    }

    const handleReconcileEvent = (event: SourceDocumentReconcileEvent) => {
      if (event.type === 'file-missing') {
        const { result } = event;
        if (!result.alreadyMissing && result.record.key === editableDocuments.getActiveKey()) {
          setEditorDiffersFromBaseline(result.record.currentText !== result.record.diskBaseline);
          if (isEditingMarkdownRef.current) {
            setEditorDirty(result.record.currentText !== editSessionBaseRef.current);
            setEditStats(
              result.record.currentText !== result.record.diskBaseline
                ? computeEditStats(result.record.diskBaseline, result.record.currentText)
                : null,
            );
          }
          toast('File no longer exists on disk', {
            description: `Save ${result.record.basename} to recreate it.`,
            duration: 5000,
          });
        }
        return;
      }

      if (event.type === 'clean-updated') {
        const { result } = event;
        if (result.record.key === editableDocuments.getActiveKey()) {
          const remapped = applyEditedDocument(result.record.currentText);
          repaintHighlights(remapped);
          editSessionBaseRef.current = result.record.currentText;
          setEditorDirty(false);
          setEditorDiffersFromBaseline(false);
          setEditStats(null);
        }
        if (result.clearedSavedChange) {
          toast('File updated from disk', {
            description: `${result.record.basename} changed outside Hypermark, so its old Edits card was cleared.`,
          });
        }
      } else if (event.type === 'conflict') {
        const { result } = event;
        if (result.record.key === editableDocuments.getActiveKey()) {
          setEditorDirty(true);
          setEditorDiffersFromBaseline(true);
          setEditStats(computeEditStats(result.record.diskBaseline, result.record.currentText));
          toast.error('File changed on disk', {
            description: 'Choose whether to overwrite disk or reload the file.',
          });
        }
      }
    };

    const changed = await reconcileSourceDocuments({
      changedDir,
      documents: editableDocuments.getSourceDocuments(),
      sequenceByKey: sourceReconcileSeqRef.current,
      getDocument: editableDocuments.getDocument,
      fetchSnapshot: fetchSourceDocumentSnapshot,
      markFileMissing: editableDocuments.markFileMissing,
      reconcileDiskSnapshot: editableDocuments.reconcileDiskSnapshot,
      onEvent: handleReconcileEvent,
    });
    if (changed) scheduleDraftSave();
  }, [applyEditedDocument, editableDocuments, repaintHighlights, scheduleDraftSave]);
  const reconcileOpenSourceDocumentsRef = useRef(reconcileOpenSourceDocuments);
  useEffect(() => {
    reconcileOpenSourceDocumentsRef.current = reconcileOpenSourceDocuments;
  }, [reconcileOpenSourceDocuments]);

  const sourceWatchSubscription = useMemo(
    () => buildSourceWatchSubscription(openSourceDocuments.map((doc) => doc.sourceSave.path)),
    [openSourceDocuments],
  );

  useEffect(() => {
    if (!sourceWatchSubscription.key || typeof EventSource === 'undefined') return;

    const dirs = sourceWatchSubscription.dirs;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const source = new EventSource(`/api/reference/files/stream?${sourceWatchSubscription.query}`);

    const schedule = (dir?: string) => {
      const key = dir ?? '*';
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        void reconcileOpenSourceDocumentsRef.current(dir);
      }, 120));
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; dirPath?: string };
        const dir = typeof data.dirPath === 'string' && dirs.includes(data.dirPath) ? data.dirPath : undefined;
        if (data.type === 'ready') {
          schedule(dir);
          return;
        }
        if (data.type !== 'changed') return;
        schedule(dir);
      } catch {
        return;
      }
    };

    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      source.close();
    };
  }, [sourceWatchSubscription.key]);

  const handleEditorModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
    saveEditorMode(mode);
  };

  const handleInputMethodChange = (method: InputMethod) => {
    // HTML and live-app surfaces pin the viewer to pinpoint (drag-selection
    // commenting is simultaneously live there, so there is nothing to
    // switch): the toolstrip is not rendered and the Alt shortcut must not
    // flip state the surface ignores or write the html cookie.
    if (liveApp || isHtmlSurface) return;
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
  useInputMethodSwitch(effectiveInputMethod, handleInputMethodChange);

  // Gates both the toolstrip's own render and its shortcuts, so a mode can never
  // change with no visible pill to report it. HTML/live surfaces have no
  // toolstrip at all: they are comment-only with pinpoint + drag both live,
  // so there is no input method or annotation mode left to switch.
  const toolstripVisible = useMemo(
    () =>
      !goalSetupMode && !isPlanDiffActive && !isEditingMarkdown && !isHtmlSurface,
    [
      goalSetupMode,
      isHtmlSurface,
      isEditingMarkdown,
      isPlanDiffActive,
    ],
  );

  const canHandleAnnotationModeShortcut = useCallback(
    (event: KeyboardEvent) => toolstripVisible && canHandleDocumentChromeShortcut(event),
    [canHandleDocumentChromeShortcut, toolstripVisible],
  );

  // Interact/Annotate toggle (Mod+Shift+A) — HTML and live-app surfaces only.
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

  useAnnotationModeShortcuts({
    handlers: {
      selectMarkupMode: { when: canHandleAnnotationModeShortcut, handle: () => handleEditorModeChange('selection') },
      selectCommentMode: { when: canHandleAnnotationModeShortcut, handle: () => handleEditorModeChange('comment') },
      selectRedlineMode: { when: canHandleAnnotationModeShortcut, handle: () => handleEditorModeChange('redline') },
    },
  });

  // Check if we're in API mode (served from Bun hook server)
  useEffect(() => {
    fetch('/api/plan')
      .then(res => {
        if (!res.ok) throw new Error('Not in API mode');
        return res.json();
      })
      .then((data: { plan: string; origin?: Origin; mode?: 'annotate' | 'annotate-last' | 'annotate-folder' | 'annotate-app' | 'goal-setup'; goalSetup?: GoalSetupBundle; filePath?: string; appUrl?: string; targetUrl?: string; liveToken?: string; sourceInfo?: string; sourceConverted?: boolean; sourceSave?: SourceSaveCapability; gate?: boolean; approvalNotesSupported?: boolean; clientLease?: AnnotateClientLeaseConfig; renderAs?: 'html' | 'markdown'; rawHtml?: string; shareHtml?: string; diffHtml?: string; convertHtml?: boolean; repoInfo?: { display: string; branch?: string; host?: string }; previousPlan?: string | null; versionInfo?: { version: number; totalVersions: number; project: string }; projectRoot?: string; markdownExtensions?: string[]; serverConfig?: { displayName?: string; gitUser?: string }; recentMessages?: PickerMessage[]; agentTerminal?: AgentTerminalCapability; feedbackTemplates?: AnnotateFeedbackTemplates }) => {
        // Initialize config store with server-provided values (config file > cookie > default)
        configStore.init(data.serverConfig);
        // Extra extensions the user registered as markdown (#1307) — the
        // renderer needs them to treat links to sibling `.livemd`-style docs
        // as openable local documents rather than external links.
        setExtraMarkdownExtensions(data.markdownExtensions);
        // Session-level force-markdown preference (--markdown); threaded into folder/linked
        // /api/doc requests so on-demand HTML files convert too.
        setConvertHtml(data.convertHtml ?? false);
        if (data.mode === 'goal-setup' && data.goalSetup) {
          setGoalSetupBundle(data.goalSetup);
          setMarkdown('');
        } else if (data.mode === 'annotate-app' && data.appUrl && data.liveToken) {
          // Live app annotation: full-viewport live surface on the loopback
          // proxy origin. No rawHtml and no version fields.
          setRenderAs('html');
          setMarkdown('');
          // Live sessions open ARMED like every HTML surface (htmlAnnotateArmed
          // defaults true): pinpoint is the default, Esc drops to Interact.
          setLiveApp({
            appUrl: data.appUrl,
            origin: new URL(data.appUrl).origin,
            token: data.liveToken,
          });
        } else if (data.renderAs === 'html' && data.rawHtml) {
          setRenderAs('html');
          setRawHtml(data.rawHtml);
          setShareHtml(data.shareHtml ?? '');
          setHtmlDiffHtml(data.diffHtml ?? null);
          setMarkdown('');
        } else if (data.mode === 'annotate-folder') {
          // Folder annotation mode: clear demo content, let user pick a file
          setMarkdown('');
        } else if (typeof data.plan === 'string') {
          // CM6 joins lines with \n; CRLF input would make an untouched
          // edit round-trip fabricate a whole-document diff. Normalize once.
          const normalizedPlan = data.plan.replace(/\r\n?/g, '\n');
          setMarkdown(normalizedPlan);
          originalMarkdownRef.current = normalizedPlan;
          if (data.mode === 'annotate' && data.sourceSave?.enabled) {
            const key = editableDocumentKey(data.sourceSave, `file:${data.sourceSave.path}`);
            editableDocuments.openDocument({ key, text: normalizedPlan, sourceSave: data.sourceSave });
          }
        }
        setIsApiMode(true);
        if (data.mode === 'annotate' || data.mode === 'annotate-last' || data.mode === 'annotate-folder' || data.mode === 'annotate-app') {
          setAnnotateMode(true);
          setGate(data.gate ?? false);
          setApprovalNotesSupported(data.approvalNotesSupported ?? false);
          setClientLease(data.clientLease ?? null);
        }
        if (data.mode === 'annotate-folder') {
          sidebar.open('files');
        }
        if (data.mode === 'annotate' || data.mode === 'annotate-last' || data.mode === 'annotate-folder' || data.mode === 'annotate-app') {
          setAnnotateSource(data.mode === 'annotate-last' ? 'message' : data.mode === 'annotate-folder' ? 'folder' : 'file');
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
          setImageBaseDir(data.mode === 'annotate-folder' ? data.filePath : data.filePath.replace(/\/[^/]+$/, ''));
          if (data.mode === 'annotate') {
            setSourceFilePath(data.filePath);
          }
        }
        if (data.repoInfo) {
          setRepoInfo(data.repoInfo);
        }
        if (data.projectRoot) {
          setProjectRoot(data.projectRoot);
        }
        setAgentTerminalCapability(data.agentTerminal ?? null);
        // Capture plan version history data
        if (data.previousPlan !== undefined) {
          setPreviousPlan(data.previousPlan);
        }
        if (data.versionInfo) {
          setVersionInfo(data.versionInfo);
        }
        if (data.origin) {
          setOrigin(data.origin);
          // For Claude Code, check if user needs to configure permission mode.
        }
      })
      .catch(() => {
        // Not in API mode - use default content
        setIsApiMode(false);
        setAgentTerminalCapability(null);
        // Demo mode still exercises edit mode; baseline is the demo plan.
        originalMarkdownRef.current = DEMO_PLAN_CONTENT;
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
    if (!shouldConnectAnnotateClientLease({ annotateMode, submitted, clientLease })) return;

    const stream = openAnnotateClientLeaseStream(EventSource);
    return () => stream.close();
  }, [annotateMode, submitted, clientLease]);

  // Session-ended: the parent watcher (packages/server/parent-watch.ts)
  // announces when the Claude Code process that owns this session has
  // exited. Flush the draft first — the reviewer's typing was never sent
  // anywhere else — then show the same "Session Closed" overlay a manual
  // exit shows. Stops listening once a decision is already in.
  const handleSessionEnded = useCallback(() => {
    flushDraft();
    setSubmitted('exited');
  }, [flushDraft]);
  // Goal-setup sessions are served by packages/server/goal-setup.ts, which
  // this spec does not touch (spec 12 removes goal-setup entirely) and
  // which advertises no /api/session/stream route.
  useSessionEndedStream(submitted == null && !goalSetupMode, handleSessionEnded);

  // Document-level image paste was removed: global attachments are no longer
  // a writable surface (spec 05 §4.1). A composer that is open claims its own
  // paste (see CommentPopover's capture-phase listener); a paste with no
  // composer open now simply does nothing, rather than filing the image
  // under the document's top-level `globalAttachments`.

  const sendToAgentTerminal = useCallback((message: string) => {
    const sent = agentTerminalRef.current?.sendMessage(message) ?? false;
    if (!sent) return false;
    openAgentTerminal();
    return true;
  }, [openAgentTerminal]);

  const getAnnotateFeedbackTarget = useCallback((): AnnotateFeedbackTarget => {
    if (linkedDocHook.isActive && linkedDocHook.filepath) {
      return { fileHeader: 'File', filePath: linkedDocHook.filepath };
    }
    if (sourceFilePath) {
      return { fileHeader: 'File', filePath: sourceFilePath };
    }
    if (fileBrowser.activeFile) {
      return { fileHeader: 'File', filePath: fileBrowser.activeFile };
    }
    if (annotateSource === 'folder') {
      return { fileHeader: 'Folder', filePath: fileBrowser.activeDirPath ?? projectRoot ?? 'selected folder' };
    }
    return { fileHeader: 'File', filePath: 'current file' };
  }, [
    annotateSource,
    fileBrowser.activeDirPath,
    fileBrowser.activeFile,
    linkedDocHook.filepath,
    linkedDocHook.isActive,
    projectRoot,
    sourceFilePath,
  ]);

  const buildAnnotateAgentFeedback = useCallback((feedback: string) => {
    if (annotateSource === 'message') {
      return annotateMessageFeedback(feedback);
    }

    return annotateFileFeedback(feedback, getAnnotateFeedbackTarget());
  }, [annotateSource, getAnnotateFeedbackTarget]);

  // Clipboard copy wrapper (#1107): plan review keeps the deliberately forceful
  // plan-deny framing; annotate sessions wrap with the server-resolved template
  // (the same one Send Feedback gets, including custom prompts.annotate.*
  // config), falling back to the built-in annotate defaults when the server
  // didn't ship one. Shared/static sessions never set annotateMode
  // and keep today's behavior.
  const wrapCopiedFeedback = useCallback((feedback: string) => {
    if (annotateMode) {
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
    }
    return wrapFeedbackForAgent(feedback);
  }, [annotateMode, annotateSource, feedbackTemplates, getAnnotateFeedbackTarget]);

  const currentFeedbackPayload = useMemo(() => getCurrentFeedbackPayload(), [
    agentFeedbackRevision,
    editableDocuments.version,
    editorDiffersFromBaseline,
    getCurrentFeedbackPayload,
    savedFileChanges,
  ]);
  const currentAgentFeedbackTarget = useMemo(
    () => getAnnotateFeedbackTarget(),
    [getAnnotateFeedbackTarget],
  );
  const currentAgentFeedbackDelivery = useMemo(() => {
    if (agentTerminalSessionId === null) return null;
    return buildAgentTerminalDeliveryRecord({
      terminalSessionId: agentTerminalSessionId,
      feedback: currentFeedbackPayload,
      targetPath: annotateSource === 'message' ? null : currentAgentFeedbackTarget.filePath,
    });
  }, [
    agentTerminalSessionId,
    annotateSource,
    currentFeedbackPayload,
    currentAgentFeedbackTarget.filePath,
  ]);
  const isCurrentFeedbackDeliveredToAgent = isMatchingAgentTerminalDelivery(
    agentTerminalDelivery,
    currentAgentFeedbackDelivery,
  );
  const showAgentTerminalDeliveryStatus =
    annotateMode &&
    agentTerminalDelivery !== null &&
    isCurrentFeedbackDeliveredToAgent;
  const hasFeedbackToSend =
    hasFeedbackContent &&
    !isCurrentFeedbackDeliveredToAgent;

  // API mode handlers
  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      // Integrations must describe the same document the feedback diff does —
      // mid-edit submits read the live editor buffer, not stale markdown state.
      const currentMarkdown = isEditingMarkdown
        ? markdownEditorHandleRef.current?.getMarkdown() ?? displayedMarkdown
        : displayedMarkdown;
      // Build request body - include integrations if enabled
      const body: { draftGeneration: number; feedback?: string; permissionMode?: string } = {
        draftGeneration: getDraftGeneration(),
      };

      // Include permission mode for Claude Code
      if (origin === 'claude-code') {
        body.permissionMode = PLAN_APPROVAL_PERMISSION_MODE;
      }

      // Annotations and direct edits ride the approval as feedback.
      // Direct edits count as feedback too — without the editsSection check here,
      // an edit-only approval would silently drop the user's changes.
      const hasDocAnnotations = Array.from(linkedDocHook.getDocAnnotations().values()).some(
        (d) => d.annotations.length > 0 || d.globalAttachments.length > 0
      );
      const checkedSavedFileChanges = await validateSavedFileChangesBeforeSubmit();
      if (checkedSavedFileChanges === null) {
        setIsSubmitting(false);
        return;
      }
      const editsSection = buildEditsSection();
      const savedChangesSection = buildSavedChangesSection(checkedSavedFileChanges);
      if (allAnnotations.length > 0 || codeAnnotations.length > 0 || globalAttachments.length > 0 || hasDocAnnotations || editsSection || savedChangesSection) {
        body.feedback = getCurrentFeedbackPayload(checkedSavedFileChanges);
      }

      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSubmitted('approved');
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    setIsSubmitting(true);
    try {
      const checkedSavedFileChanges = await validateSavedFileChangesBeforeSubmit();
      if (checkedSavedFileChanges === null) {
        setIsSubmitting(false);
        return;
      }
      await fetch('/api/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          feedback: getCurrentFeedbackPayload(checkedSavedFileChanges),
        })
      });
      setSubmitted('denied');
    } catch {
      setIsSubmitting(false);
    }
  };

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
      snapshotActiveEditableDocument();
      const checkedSavedFileChanges = await validateSavedFileChangesBeforeSubmit();
      if (checkedSavedFileChanges === null) {
        setIsSubmitting(false);
        return false;
      }
      const discard = options?.discardAnnotations === true;
      const feedback = getCurrentFeedbackPayload(checkedSavedFileChanges, options);
      const agentFeedbackDelivery = agentTerminalSessionId === null
        ? null
        : buildAgentTerminalDeliveryRecord({
            terminalSessionId: agentTerminalSessionId,
            feedback,
            targetPath: annotateSource === 'message' ? null : getAnnotateFeedbackTarget().filePath,
          });
      if (isAgentTerminalReady) {
        if (!shouldSendAgentTerminalFeedback(agentTerminalDeliveryRef.current, agentFeedbackDelivery)) {
          discardDraft();
          setIsSubmitting(false);
          return true;
        }
        const agentFeedback = buildAnnotateAgentFeedback(feedback);
        if (agentFeedbackDelivery && sendToAgentTerminal(agentFeedback)) {
          setAgentTerminalDelivery(agentFeedbackDelivery);
          discardDraft();
          annotationHistory.clear();
          setIsSubmitting(false);
          return true;
        }
        handleAgentTerminalReadyChange(false);
        toast.error('Agent terminal is not ready. Sending through the original session.');
      }

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
      snapshotActiveEditableDocument();
      const checkedSavedFileChanges = await validateSavedFileChangesBeforeSubmit();
      if (checkedSavedFileChanges === null) {
        setIsSubmitting(false);
        return false;
      }
      const discard = options?.discardAnnotations === true;
      // hasFeedbackToSend (not hasFeedbackContent) so notes already delivered
      // via the agent terminal are not re-sent on approve.
      const feedback = !discard && hasFeedbackToSend
        ? getCurrentFeedbackPayload(checkedSavedFileChanges)
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

  const handleGoalSetupSubmit = useCallback(() => {
    goalSetupSurfaceRef.current?.submit();
  }, []);

  const handleGoalSetupExit = useCallback(async () => {
    setIsExiting(true);
    try {
      const res = await fetch('/api/exit', { method: 'POST' });
      if (res.ok) {
        setSubmitted('exited');
      } else {
        throw new Error('Failed to exit');
      }
    } catch {
      setIsExiting(false);
    }
  }, []);

  const confirmUnsavedSourceFileEdits = useCallback((
    action: SourceFileEditWarningAction,
    continueAction: () => void | Promise<void>,
  ) => {
    sourceFileEditWarningContinuationRef.current = continueAction;
    setSourceFileEditWarningAction(action);
    setShowSourceFileEditWarning(true);
  }, []);

  const maybeConfirmUnsavedSourceFileEdits = useCallback((
    action: SourceFileEditWarningAction,
    continueAction: () => void | Promise<void>,
  ): boolean => {
    if (!hasUnsavedSourceFileBuffers) return false;
    confirmUnsavedSourceFileEdits(action, continueAction);
    return true;
  }, [confirmUnsavedSourceFileEdits, hasUnsavedSourceFileBuffers]);

  const closeSourceFileEditWarning = useCallback(() => {
    sourceFileEditWarningContinuationRef.current = null;
    setShowSourceFileEditWarning(false);
  }, []);

  const confirmSourceFileEditWarning = useCallback(() => {
    const continuation = sourceFileEditWarningContinuationRef.current;
    sourceFileEditWarningContinuationRef.current = null;
    setShowSourceFileEditWarning(false);
    void continuation?.();
  }, []);

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

      // Don't intercept if any modal is open
      if (showFeedbackPrompt || showClaudeCodeWarning ||
          showSourceFileEditWarning ||
          showExitWarning) return;

      // Don't intercept if already submitted, submitting, or exiting
      if (submitted || isSubmitting || isExiting || goalSetupAction.isSubmitting) return;

      // Don't intercept in demo/share mode (no API)
      if (!isApiMode) return;

      // While the markdown editor is open, submit shortcuts belong to editing,
      // not the review session.
      if (isEditingMarkdown) return;

      // Folder files are the active review target; normal linked docs are side
      // references and should not submit the root plan.
      if (linkedDocHook.isActive && annotateSource !== 'folder') return;

      if (goalSetupMode) {
        if (document.querySelector('[data-comment-popover="true"]')) return;
        if (isTextField && !target?.closest('.goal-shell')) return;
        e.preventDefault();
        if (goalSetupAction.canSubmit) goalSetupSurfaceRef.current?.submit();
        return;
      }

      // Don't intercept if typing in an input/textarea outside goal setup.
      if (isTextField) return;

      e.preventDefault();

      // Annotate mode: Mod+Enter always equals the visible header primary —
      // one submitPrimaryDecision for keyboard, header, and compact (spec §4).
      if (annotateMode) {
        submitPrimaryDecisionRef.current();
        return;
      }

      // No feedback → Approve, otherwise → Send Feedback
      if (!hasFeedbackToSend) {
        const approve = () => {
          handleApprove();
        };
        if (maybeConfirmUnsavedSourceFileEdits('approve', approve)) return;
        approve();
      } else {
        // Direct edits route through deny too: on Claude Code, deny is the only
        // channel whose output carries feedback to the agent.
        if (maybeConfirmUnsavedSourceFileEdits('send-feedback', () => handleDeny())) return;
        handleDeny();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showFeedbackPrompt, showClaudeCodeWarning, showSourceFileEditWarning, showExitWarning,
    submitted, isSubmitting, isExiting, goalSetupAction.isSubmitting, isApiMode, isEditingMarkdown, linkedDocHook.isActive, annotations.length, codeAnnotations.length, externalAnnotations.length, annotateMode,
    hasFeedbackToSend, goalSetupMode, goalSetupAction.canSubmit, isAgentTerminalReady,
    annotateSource, origin,
    maybeConfirmUnsavedSourceFileEdits,
  ]);

  const handleAddAnnotation = (ann: Annotation) => {
    // Live app sessions stamp every page-located annotation with the page it
    // was made on (restore filters per page; export groups by page). Global
    // comments have no page location and stay unstamped.
    const stamped =
      liveApp && livePageUrl && ann.type !== AnnotationType.GLOBAL_COMMENT
        ? { ...ann, pageUrl: livePageUrl }
        : ann;
    const beforeSelection = selectionRef.current;
    const index = annotationsRef.current.length;
    annotationsRef.current = [...annotationsRef.current, stamped];
    setAnnotations(annotationsRef.current);
    setSelectedAnnotationId(stamped.id);
    setSelectedCodeAnnotationId(null);
    selectionRef.current = { annotationId: stamped.id, codeAnnotationId: null };
    if (isHumanHistoryMutation(stamped)) {
      annotationHistory.record({
        kind: 'annotation',
        mutation: { kind: 'add', item: stamped, index },
        beforeSelection,
        afterSelection: selectionRef.current,
      });
    }
    // Annotation activity keeps the HTML chrome preference alive: re-stamp it
    // so it only expires for users who have not annotated HTML within the
    // staleness TTL (see preferenceTtl.ts).
    if (isHtmlSurface) {
      if (htmlChromeRestoredRef.current) {
        saveHtmlChromeState({ sidebarOpen: sidebar.isOpen, panelOpen: isPanelOpen, toolsHidden: htmlToolsHidden });
      }
    }
  };

  // Keep selection behavior explicit across mobile/wide-mode transitions.
  const handleSelectAnnotation = React.useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
    if (id) setSelectedCodeAnnotationId(null);
    selectionRef.current = {
      annotationId: id,
      codeAnnotationId: id ? null : selectionRef.current.codeAnnotationId,
    };
    if (id && isMobile && wideModeType === null) setIsPanelOpen(true);
  }, [isMobile, wideModeType]);

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
      author: configStore.get('displayName') || undefined,
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
  const handleSelectCodeAnnotation = React.useCallback((id: string) => {
    const annotation = codeAnnotations.find(a => a.id === id);
    if (!annotation) return;
    setSelectedAnnotationId(null);
    setSelectedCodeAnnotationId(id);
    selectionRef.current = { annotationId: null, codeAnnotationId: id };
    codeFilePopout.open(annotation.filePath);
    if (isMobile && wideModeType === null) setIsPanelOpen(true);
  }, [codeAnnotations, codeFilePopout.open, isMobile, wideModeType]);

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
    if (isHumanHistoryMutation(annotation)) {
      annotationHistory.record({
        kind: 'code-annotation',
        mutation: { kind: 'delete', item: annotation, index },
        beforeSelection,
        afterSelection,
      });
    }
  }, [annotationHistory]);

  const handleEditCodeAnnotation = React.useCallback((id: string, updates: Partial<CodeAnnotation>) => {
    const before = codeAnnotationsRef.current.find((annotation) => annotation.id === id);
    if (!before) return;
    const after = { ...before, ...updates };
    codeAnnotationsRef.current = codeAnnotationsRef.current.map((annotation) => annotation.id === id ? after : annotation);
    setCodeAnnotations(codeAnnotationsRef.current);
    if (isHumanHistoryMutation(before)) {
      annotationHistory.record({
        kind: 'code-annotation',
        mutation: { kind: 'edit', before, after },
        beforeSelection: selectionRef.current,
        afterSelection: selectionRef.current,
      });
    }
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

  const deleteAnnotation = (id: string, history: 'record' | 'silent') => {
    const ann = allAnnotations.find(a => a.id === id);
    if (ann?.source) annotationHistory.clear();
    // External annotations (live in SSE hook) route to the SSE hook, not local state.
    // Check membership by ID — source alone is insufficient because share-imported
    // and draft-restored annotations also carry source but live in local state.
    if (ann?.source && externalAnnotations.some(e => e.id === id)) {
      deleteExternalAnnotation(id);
      if (selectionRef.current.annotationId === id) {
        selectionRef.current = { ...selectionRef.current, annotationId: null };
        setSelectedAnnotationId(null);
      }
      return;
    }
    // Checkbox deletion is one composite action: visual state and generated
    // annotation must travel together through history.
    if (id.startsWith('ann-checkbox-')) {
      if (ann) {
        const beforeSelection = selectionRef.current;
        const beforeOverrides = [...checkbox.overrides.entries()] as CheckboxOverrideSnapshot;
        const annotationIndex = annotationsRef.current.findIndex((item) => item.id === id);
        checkbox.revertOverride(ann.blockId);
        removeAnnotation(id);
        if (history === 'record') annotationHistory.record({
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
    if (history === 'record' && isHumanHistoryMutation(ann)) {
      annotationHistory.record({
        kind: 'annotation',
        mutation: { kind: 'delete', item: ann, index },
        beforeSelection,
        afterSelection: selectionRef.current,
      });
    }
  };
  const handleDeleteAnnotation = (id: string) => deleteAnnotation(id, 'record');
  const deleteAnnotationSilently = (id: string) => deleteAnnotation(id, 'silent');

  const editAnnotation = (
    id: string,
    updates: Partial<Annotation>,
    history: 'record' | 'silent',
  ) => {
    const ann = allAnnotations.find(a => a.id === id);
    if (ann?.source) annotationHistory.clear();
    if (ann?.source && externalAnnotations.some(e => e.id === id)) {
      updateExternalAnnotation(id, updates);
      return;
    }
    if (!ann) return;
    const after = { ...ann, ...updates };
    annotationsRef.current = annotationsRef.current.map((annotation) => annotation.id === id ? after : annotation);
    setAnnotations(annotationsRef.current);
    if (history === 'record' && isHumanHistoryMutation(ann)) {
      annotationHistory.record({
        kind: 'annotation',
        mutation: { kind: 'edit', before: ann, after },
        beforeSelection: selectionRef.current,
        afterSelection: selectionRef.current,
      });
    }
  };
  const handleEditAnnotation = (id: string, updates: Partial<Annotation>) =>
    editAnnotation(id, updates, 'record');
  const editAnnotationSilently = (id: string, updates: Partial<Annotation>) =>
    editAnnotation(id, updates, 'silent');

  const handleTocNavigate = (blockId: string) => {
    // Navigation handled by TableOfContents component
    // This is just a placeholder for future custom logic
  };

  const handleSaveEditedSourceFile = useCallback(async (options?: { overwriteDiskConflict?: boolean }): Promise<boolean> => {
    const activeDocument = editableDocuments.getActiveDocumentLive();
    const activeSourceSave = activeDocument?.sourceSave;
    if (!activeDocument || !activeSourceSave?.enabled) {
      toast.error('This document cannot be saved to a file');
      return true;
    }

    const edited = isEditingMarkdown
      ? markdownEditorHandleRef.current?.getMarkdown()
      : activeDocument.currentText;
    if (edited == null) {
      toast.error('Editor is not ready');
      return true;
    }

    if (activeDocument.diskConflict && !options?.overwriteDiskConflict) {
      toast.error('Resolve the disk conflict first', {
        description: 'Choose Overwrite disk or Reload from disk.',
      });
      return true;
    }

    const saveBaseSource = options?.overwriteDiskConflict && activeDocument.diskConflict
      ? activeDocument.diskConflict.sourceSave
      : activeSourceSave;
    const savedChangeBaseText = options?.overwriteDiskConflict
      ? activeDocument.diskConflict?.text
      : undefined;
    const savedChangeBaseHash = options?.overwriteDiskConflict
      ? activeDocument.diskConflict?.sourceSave.hash
      : undefined;

    editableDocuments.updateActiveText(edited);
    editableDocuments.markSaving(activeDocument.key);
    try {
      const res = await fetch('/api/source/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: saveBaseSource.scope === 'folder-file' ? saveBaseSource.path : undefined,
          text: edited,
          baseHash: saveBaseSource.hash,
          baseMtimeMs: saveBaseSource.mtimeMs,
          baseEol: saveBaseSource.eol,
          allowMissingBase: true,
        }),
      });
      const data = (await res.json()) as SourceSaveResponse;

      if (!res.ok || !data.ok) {
        if (data.ok === false) {
          const message = data.message;
          if (data.code === 'conflict') {
            const hasConflictSnapshot = hasSourceSaveConflictSnapshot(data);
            if (hasConflictSnapshot) {
              const conflictSourceSave: EnabledSourceSaveCapability = {
                ...saveBaseSource,
                hash: data.currentHash,
                mtimeMs: data.currentMtimeMs,
                size: data.currentSize,
                eol: data.currentEol,
              };
              const result = editableDocuments.reconcileDiskSnapshot({
                key: activeDocument.key,
                text: data.currentText,
                sourceSave: conflictSourceSave,
              });
              if (result.type === 'conflict' && editableDocuments.getActiveKey() === activeDocument.key) {
                setEditorDirty(true);
                setEditorDiffersFromBaseline(true);
                setEditStats(computeEditStats(result.record.diskBaseline, result.record.currentText));
                scheduleDraftSave();
                toast.error('File changed on disk', {
                  description: 'Choose whether to overwrite disk or reload the file.',
                });
              } else if (result.type === 'conflict') {
                scheduleDraftSave();
                toast.error('File changed on disk', {
                  description: 'Choose whether to overwrite disk or reload the file.',
                });
              } else if (result.type === 'clean-updated') {
                if (editableDocuments.getActiveKey() === activeDocument.key) {
                  const remapped = applyEditedDocument(result.record.currentText);
                  repaintHighlights(remapped);
                  editSessionBaseRef.current = result.record.currentText;
                  setEditorDirty(false);
                  setEditorDiffersFromBaseline(false);
                  setEditStats(null);
                }
                scheduleDraftSave();
                toast('File updated from disk', {
                  description: `${result.record.basename} changed outside Hypermark, so it was reloaded instead of saved.`,
                });
              } else if (!editableDocuments.getDocument(activeDocument.key)?.diskConflict) {
                editableDocuments.markError(activeDocument.key, message);
                toast.error('File changed on disk', {
                  description: 'Hypermark could not load the latest disk version. Try saving again.',
                });
              }
            } else {
              editableDocuments.markError(activeDocument.key, message);
              toast.error('File changed on disk', {
                description: 'Hypermark could not load the latest disk version. Try saving again.',
              });
            }
          } else {
            editableDocuments.markError(activeDocument.key, message);
            toast.error(message);
          }
        } else {
          const message = 'Save failed';
          editableDocuments.markError(activeDocument.key, message);
          toast.error(message);
        }
        return true;
      }

      const nextSourceSave = {
        ...saveBaseSource,
        hash: data.hash,
        mtimeMs: data.mtimeMs,
        size: data.size,
        eol: data.eol,
      };
      editableDocuments.markSaved({
        key: activeDocument.key,
        text: edited,
        sourceSave: nextSourceSave,
        savedChangeBaseText,
        savedChangeBaseHash,
      });
      const normalizedEdited = edited.replace(/\r\n?/g, '\n');
      const savedChangedFromOpen = normalizedEdited !== activeDocument.sessionOpenText;
      editedMarkdownRef.current = null;
      if (editableDocuments.getActiveKey() === activeDocument.key) {
        const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
        const normalizedLive = live?.replace(/\r\n?/g, '\n');
        editSessionBaseRef.current = normalizedEdited;
        const currentText = normalizedLive ?? editableDocuments.getDocument(activeDocument.key)?.currentText ?? normalizedEdited;
        if (currentText === normalizedEdited) {
          setEditorDirty(false);
          setEditorDiffersFromBaseline(false);
          setEditStats(null);
        } else {
          editableDocuments.updateActiveText(currentText, { forceNotify: true });
          setEditorDirty(true);
          setEditorDiffersFromBaseline(true);
          setEditStats(computeEditStats(normalizedEdited, currentText));
        }
      }
      if (savedChangedFromOpen && window.innerWidth >= 768) {
        setIsPanelOpen(true);
      }
      scheduleDraftSave();
      toast.success(`Saved ${activeSourceSave.basename}`);
      return true;
    } catch {
      editableDocuments.markError(activeDocument.key, 'Save failed');
      toast.error('Save failed');
      return true;
    }
  }, [applyEditedDocument, editableDocuments, isEditingMarkdown, repaintHighlights, scheduleDraftSave]);

  const handleOverwriteDiskConflict = useCallback(() => {
    void handleSaveEditedSourceFile({ overwriteDiskConflict: true });
  }, [handleSaveEditedSourceFile]);

  const handleReloadDiskConflict = useCallback(() => {
    const activeDocument = editableDocuments.getActiveDocumentLive();
    if (!activeDocument?.diskConflict) return;
    const reloaded = editableDocuments.reloadDiskConflict(activeDocument.key);
    if (!reloaded) return;
    const remapped = applyEditedDocument(reloaded.currentText);
    repaintHighlights(remapped);
    editSessionBaseRef.current = reloaded.currentText;
    setEditorDirty(false);
    setEditorDiffersFromBaseline(false);
    setEditStats(null);
    scheduleDraftSave();
    toast.success(`Reloaded ${reloaded.basename} from disk`);
  }, [applyEditedDocument, editableDocuments, repaintHighlights, scheduleDraftSave]);

  // Agent Instructions — copy a clipboard payload teaching external agents
  // (Claude Code, Codex, etc.) how to POST annotations into this session via
  // /api/external-annotations. The instruction body lives in a separate module
  // (utils/agentInstructions.ts) so it's easy to edit independently of UI code.
  const handleCopyAgentInstructions = async () => {
    const payload = buildPlanAgentInstructions(window.location.origin);
    if (await copyTextToClipboard(payload)) {
      toast.success('Agent instructions copied');
    } else {
      toast.error('Failed to copy');
    }
  };

  // Cmd/Ctrl+S keyboard shortcut — saves the active source file while editing.
  useEffect(() => {
    const handleSaveShortcut = (e: KeyboardEvent) => {
      if (e.key !== 's' || !(e.metaKey || e.ctrlKey)) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (showFeedbackPrompt || showClaudeCodeWarning ||
          showSourceFileEditWarning ||
          showExitWarning) return;

      if (submitted || !isApiMode) return;

      if (isEditingMarkdown && editableDocuments.getActiveDocumentLive()?.sourceSave?.enabled) {
        e.preventDefault();
        void handleSaveEditedSourceFile();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [
    showFeedbackPrompt, showClaudeCodeWarning, showSourceFileEditWarning, showExitWarning,
    submitted, isApiMode, isEditingMarkdown, handleSaveEditedSourceFile, displayedMarkdown, annotationsOutput,
  ]);

  const agentName = useMemo(() => getAgentName(origin), [origin]);

  // Header handlers ref — stores latest handler references so the stable
  // callbacks below always call the current version without needing useCallback
  // dep arrays for every handler. This lets React.memo on AppHeader work.
  const headerHandlersRef = useRef({
    handleApprove,
    handleDeny,
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    handleCopyAgentInstructions,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  });
  headerHandlersRef.current = {
    handleApprove,
    handleDeny,
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    handleCopyAgentInstructions,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  };

  const handleHeaderFeedback = useCallback(() => {
    const sendFeedback = () => {
      const h = headerHandlersRef.current;
      // Direct edits count as feedback — deny is the only Claude Code channel
      // whose output carries feedback to the agent.
      if (!hasFeedbackToSend) {
        setShowFeedbackPrompt(true);
      } else {
        h.handleDeny();
      }
    };
    if (maybeConfirmUnsavedSourceFileEdits('send-feedback', sendFeedback)) return;
    sendFeedback();
  }, [hasFeedbackToSend, maybeConfirmUnsavedSourceFileEdits]);

  const handleHeaderApprove = useCallback(() => {
    const approve = () => {
      const h = headerHandlersRef.current;
      if (origin === 'claude-code' && hasFeedbackToSend) {
        setShowClaudeCodeWarning(true);
        return;
      }
      h.handleApprove();
    };
    if (maybeConfirmUnsavedSourceFileEdits('approve', approve)) return;
    approve();
  }, [hasFeedbackToSend, maybeConfirmUnsavedSourceFileEdits, origin]);

  // --- The unified annotate decision control (spec §3.1/§4) ----------------
  // One primary, one callback: the header's left segment, the global
  // Mod+Enter handler (via submitPrimaryDecisionRef), and the compact primary
  // row all call this. The zero-state Done submit is the SAME /api/feedback
  // POST the keyboard-only silent submit made (byte-identical payload —
  // spec §5.3); gate mode's empty primary is Approve on /api/approve.
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
    if (maybeConfirmUnsavedSourceFileEdits(route === 'approve' ? 'approve' : 'send-feedback', run)) return;
    void run();
  }, [maybeConfirmUnsavedSourceFileEdits]);

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
      const approve = () => { void headerHandlersRef.current.handleAnnotateApprove(); };
      if (maybeConfirmUnsavedSourceFileEdits('approve', approve)) return;
      approve();
      return;
    }
    const sendFeedback = () => { void headerHandlersRef.current.handleAnnotateFeedback(); };
    if (maybeConfirmUnsavedSourceFileEdits('send-feedback', sendFeedback)) return;
    sendFeedback();
  }, [
    dispatchPendingDecision,
    gate,
    hasFeedbackToSend,
    isExiting,
    isSubmitting,
    maybeConfirmUnsavedSourceFileEdits,
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
      author: getIdentity(),
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
        const approve = () => { void headerHandlersRef.current.handleAnnotateApprove(); };
        if (maybeConfirmUnsavedSourceFileEdits('approve', approve)) return;
        approve();
        return;
      }
      case 'close': {
        // Same in-flight guard as the primary path: a confirm left open across
        // an in-flight decision POST must not produce a second one.
        if (submitted || isSubmitting || isExiting) return;
        // The spec's own confirm already ran when annotations would be lost.
        // Direct edits and saved-file changes are feedback the spec cannot
        // count, so that case still routes through the richer exit warning —
        // and the two never both fire, because the spec confirms only at
        // count > 0.
        const close = () => {
          if (feedbackAnnotationCount === 0 && hasFeedbackToSend) {
            setShowExitWarning(true);
            return;
          }
          void headerHandlersRef.current.handleAnnotateExit();
        };
        if (maybeConfirmUnsavedSourceFileEdits('close', close)) return;
        close();
      }
    }
  }, [feedbackAnnotationCount, gate, hasFeedbackToSend, isExiting, isSubmitting, maybeConfirmUnsavedSourceFileEdits, queueNoteDecision, submitPrimaryDecision, submitted]);

  const annotateDecisionSpec = useMemo(() => buildDecisionSpec({
    app: 'annotate',
    gate,
    count: feedbackAnnotationCount,
    hasFeedback: hasFeedbackToSend,
    approvalNotesSupported,
    // M1 ruling: agent-terminal delivered feedback flips the state to empty,
    // but Done still posts the full payload — the spec adjusts its copy.
    feedbackDelivered: isCurrentFeedbackDeliveredToAgent,
  }), [
    approvalNotesSupported,
    feedbackAnnotationCount,
    gate,
    hasFeedbackToSend,
    isCurrentFeedbackDeliveredToAgent,
  ]);

  const annotateDecisionHandlers = useMemo<Record<DecisionActionId, DecisionHandler>>(() => ({
    'primary': () => runAnnotateDecisionAction('primary'),
    'note-with-approval': (note) => runAnnotateDecisionAction('note-with-approval', note),
    'request-changes': (note) => runAnnotateDecisionAction('request-changes', note),
    'note-with-feedback': (note) => runAnnotateDecisionAction('note-with-feedback', note),
    'approve-with-notes': () => runAnnotateDecisionAction('approve-with-notes'),
    'close-session': () => runAnnotateDecisionAction('close-session'),
  }), [runAnnotateDecisionAction]);

  // Per-surface Close titles (spec §3.1 / prototype :521-522).
  const annotateCloseTitle = annotateSource === 'message'
    ? 'Dismiss without telling the agent'
    : 'Close session without sending';

  const annotateDecision = useMemo(() => ({
    spec: annotateDecisionSpec,
    handlers: annotateDecisionHandlers,
    closeTitle: annotateCloseTitle,
    // Framed surfaces: clicks inside the iframe never reach the parent
    // document, so iframe focus dismisses the popover instead (spec §2.4).
    dismissOnIframeFocus: isHtmlSurface,
  }), [annotateCloseTitle, annotateDecisionHandlers, annotateDecisionSpec, isHtmlSurface]);

  const handleHeaderCopyAgentInstructions = useCallback(() => headerHandlersRef.current.handleCopyAgentInstructions(), []);

  const planMaxWidth = useMemo(() => {
    const widths: Record<PlanWidth, number> = { compact: 832, default: 1040, wide: 1280 };
    return widths[uiPrefs.planWidth] ?? 832;
  }, [uiPrefs.planWidth]);
  const annotateReaderMaxWidth = canUseWideMode && wideModeType === 'wide' ? null : planMaxWidth;
  const agentTerminalPanel = shouldRenderAgentTerminal && agentTerminalCapability ? (
    <div
      key="agent-terminal"
      className={agentTerminalDockClassName}
      aria-hidden={!isAgentTerminalVisible}
      inert={!isAgentTerminalVisible}
    >
      <AnnotateAgentTerminalPanel
        ref={agentTerminalRef}
        capability={agentTerminalCapability}
        width={`var(--agent-terminal-w, ${agentTerminalResize.width}px)`}
        side={agentTerminalSide}
        placement={agentTerminalPlacement}
        onSideChange={handleAgentTerminalSideChange}
        onSessionActiveChange={setIsAgentTerminalRunning}
        onSessionReadyChange={handleAgentTerminalReadyChange}
        onClose={hideAgentTerminal}
      />
      {isAgentTerminalVisible && (
        <ResizeHandle
          {...agentTerminalResize.handleProps}
          className="hidden lg:block z-[55]"
          side={agentTerminalPlacement}
          hideHoverTrack
          tooltip={RESIZE_HANDLE_TOOLTIP}
          onCollapse={hideAgentTerminal}
        />
      )}
    </div>
  ) : null;
  const handleNavigatorTabChange = (tab: SidebarTab) => {
    toggleSidebarTab(tab);
  };

  const handleNavigatorFileSelect = async (...args: Parameters<typeof handleFileBrowserSelect>) => {
    // Plan/review linked-doc browsing still swaps the root document under the
    // editor. Folder mode snapshots the active file first.
    if (isEditingMarkdown && annotateSource !== 'folder') {
      toast('Finish editing first', { description: 'Use "Done editing" before opening files.' });
      return;
    }
    // Wider annotatable types are view-only. Switching to one mid-edit would
    // silently downgrade "Done editing" to feedback-only edits.
    if (isEditingMarkdown && !isSourceSaveFilePath(args[0])) {
      toast('Finish editing first', { description: 'Use "Done editing" before opening non-editable files.' });
      return;
    }
    void handleFileBrowserSelect(...args);
  };

  const handleNavigatorMessageSelect = (messageId: string) => {
    handleSelectMessage(messageId);
  };

  const handleNavigatorDiffActivate = () => {
    handleActivatePlanDiff();
  };

  const renderPlanSidebar = () => {
    return (
      <SidebarContainer
        activeTab={sidebar.activeTab}
        onTabChange={handleNavigatorTabChange}
        onClose={sidebar.close}
        width={`var(--toc-w, ${tocResize.width}px)`}
        showAgentTerminalButton={showAgentTerminalControls}
        isAgentTerminalOpen={isAgentTerminalOpen}
        isAgentTerminalRunning={isAgentTerminalRunning}
        onToggleAgentTerminal={toggleAgentTerminal}
        showContentsTab
        blocks={blocks}
        annotations={annotations}
        activeSection={activeSection}
        onTocNavigate={handleTocNavigate}
        linkedDocFilepath={linkedDocHook.filepath}
        onLinkedDocBack={linkedDocHook.isActive ? handleLinkedDocBack : undefined}
        backLabel={backLabel}
        showFilesTab={showFilesTab}
        fileAnnotationCounts={fileAnnotationCounts}
        highlightedFiles={highlightedFiles}
        fileEditStatuses={editableDocuments.fileEditStatuses}
        fileBrowser={fileBrowser}
        onFilesSelectFile={handleNavigatorFileSelect}
        onFilesFetchAll={() => fileBrowser.fetchAll(fileBrowserDirs)}
        hasFileAnnotations={hasFileAnnotations}
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
        showMessagesTab={annotateSource === 'message' && recentMessages.length > 1}
        messages={recentMessages}
        selectedMessageId={selectedMessageId}
        onSelectMessage={handleNavigatorMessageSelect}
        messageAnnotationCounts={activeMessageAnnotationCounts}
      />
    );
  };

  const renderAnnotationPanel = (presentation: 'panel' | 'embedded', isOpen = true) => (
    <AnnotationPanel
      isOpen={isOpen}
      presentation={presentation}
      blocks={blocks}
      annotations={allAnnotations}
      selectedId={selectedAnnotationId ?? selectedCodeAnnotationId}
      onSelect={handleSelectAnnotation}
      onDelete={handleDeleteAnnotation}
      onEdit={handleEditAnnotation}
      codeAnnotations={codeAnnotations}
      onSelectCodeAnnotation={handleSelectCodeAnnotation}
      onDeleteCodeAnnotation={handleDeleteCodeAnnotation}
      onEditCodeAnnotation={handleEditCodeAnnotation}
      width={presentation === 'panel' ? `var(--rpanel-w, ${panelResize.width}px)` : undefined}
      unanchoredIds={isHtmlSurface && htmlUnanchoredIds.size > 0 ? htmlUnanchoredIds : undefined}
      onClose={presentation === 'panel' ? () => setIsPanelOpen(false) : undefined}
      onQuickCopy={async () => {
        const output = getCurrentFeedbackPayload();
        return copyTextToClipboard(wrapCopiedFeedback(output));
      }}
      otherFileAnnotations={otherFileAnnotations}
      directEdits={directEditsPanelInfo?.map((item) => ({
        ...item,
        onDiscard: item.id === 'plan' ? () => handleDiscardEdits() : undefined,
      })) ?? null}
      onOtherFileAnnotationsClick={handleFlashAnnotatedFiles}
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
          annotateMode={annotateMode}
          goalSetupMode={goalSetupMode}
          goalSetupCanSubmit={goalSetupAction.canSubmit}
          goalSetupIsSubmitting={goalSetupAction.isSubmitting}
          goalSetupSubmitLabel={goalSetupAction.submitLabel}
          origin={origin}
          isSubmitting={isSubmitting}
          isExiting={isExiting}
          isPanelOpen={isRightPanelVisible}
          annotationCount={feedbackAnnotationCount}
          linkedDocIsActive={linkedDocHook.isActive}
          agentName={agentName}
          showAnnotationsWarning={hasFeedbackToSend}
          annotateDecision={annotateMode ? annotateDecision : undefined}
          onGoalSetupExit={handleGoalSetupExit}
          onGoalSetupSubmit={handleGoalSetupSubmit}
          onFeedback={handleHeaderFeedback}
          onApprove={handleHeaderApprove}
          onAnnotationPanelToggle={handleAnnotationPanelToggle}
          onCopyAgentInstructions={handleHeaderCopyAgentInstructions}
          agentInstructionsEnabled={isApiMode && !annotateMode && !goalSetupMode}
        />

        {/* The provider is render-transparent (context only, no DOM), so it can
            open here without changing the shell's element structure or order.
            It has to: the compact navigator renders the SAME TableOfContents as
            the desktop rail, and a TOC outside this provider resolves a null
            viewport, which makes every "jump to heading" tap a silent no-op. */}
        <ScrollViewportProvider viewport={scrollViewport}>



        {linkedDocHook.error && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-destructive">{linkedDocHook.error}</span>
            <button
              onClick={linkedDocHook.dismissError}
              className="ml-auto text-xs text-destructive/60 hover:text-destructive"
            >
              dismiss
            </button>
          </div>
        )}

        {activeEditableDocument?.diskConflict && (
          <div className="bg-warning/10 border-b border-warning/25 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="min-w-0 flex-1 text-xs text-warning-foreground">
              {activeEditableDocument.basename} changed on disk{isEditingMarkdown ? ' while you were editing' : ''}.
            </span>
            {canOverwriteDiskConflict && (
              <button
                type="button"
                onClick={handleOverwriteDiskConflict}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                Overwrite disk
              </button>
            )}
            <button
              type="button"
              onClick={handleReloadDiskConflict}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Reload from disk
            </button>
          </div>
        )}

        {activeEditableDocument?.missingOnDisk && !activeEditableDocument.diskConflict && (
          <div className="bg-warning/10 border-b border-warning/25 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="min-w-0 flex-1 text-xs text-warning-foreground">
              {activeEditableDocument.basename} no longer exists on disk. Save to recreate it.
            </span>
            <button
              type="button"
              onClick={() => { void handleSaveEditedSourceFile(); }}
              disabled={activeSaveStatus === 'saving'}
              className="text-xs font-medium text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
        {showAgentTerminalDeliveryStatus && (
          <div className="border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground flex-shrink-0">
            <span className="font-medium text-foreground">Sent to agent.</span>{" "}
            Keep this window open while it runs. Close Hypermark when you're done.
          </div>
        )}

        {/* Main Content */}
        <div className={`flex-1 flex overflow-hidden relative z-0 ${isResizing ? 'select-none' : ''}`}>
          {showAgentTerminalOnLeft && agentTerminalPanel}
          {/* Left Sidebar: collapsed tab flags (when sidebar is closed) */}
          {wideModeType === null && !sidebar.isOpen && !goalSetupMode && !isLeftAgentTerminalVisible && !(isHtmlSurface && htmlToolsHidden) && (
            <SidebarTabs
              activeTab={sidebar.activeTab}
              onToggleTab={toggleSidebarTab}
              hasDiff={planDiff.hasPreviousVersion}
              showVersionsTab={!isHtmlSurface && activeDiffVersionInfo !== null && activeDiffVersionInfo.totalVersions > 1}
              showFilesTab={showFilesTab}
              showMessagesTab={annotateSource === 'message' && recentMessages.length > 1}
              showAgentTerminalTab={showAgentTerminalControls}
              isAgentTerminalOpen={isAgentTerminalOpen}
              isAgentTerminalRunning={isAgentTerminalRunning}
              onToggleAgentTerminal={toggleAgentTerminal}
              hasMessageAnnotations={activeMessageAnnotationCounts.size > 0}
              hasFileAnnotations={hasFileAnnotations}
              className="hidden lg:flex absolute left-0 top-0 z-20"
            />
          )}

          {/* Left Sidebar: open state (TOC or Version Browser) */}
          {sidebar.isOpen && !goalSetupMode && (
            <div className="contents group/sidebar">
              {renderPlanSidebar()}
              <ResizeHandle {...tocResize.handleProps} className="hidden lg:block z-[55]" side="left" hideHoverTrack tooltip={RESIZE_HANDLE_TOOLTIP} onCollapse={sidebar.close} />
            </div>
          )}

          {/* Document Area */}
          <OverlayScrollArea
            element="main"
            className={`flex-1 min-w-0 ${isHtmlSurface ? 'bg-background' : `bg-card ${!goalSetupMode && !sidebar.isOpen && !isLeftAgentTerminalVisible && wideModeType === null ? 'lg:pl-[30px]' : ''}`}`}
            overflowX="hidden"
            overflowY="auto"
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
              {!goalSetupMode && !isPlanDiffActive && !isHtmlSurface && !isEditingMarkdown && uiPrefs.stickyActionsEnabled && (
                <StickyHeaderLane
                  inputMethod={inputMethod}
                  onInputMethodChange={handleInputMethodChange}
                  mode={editorMode}
                  onModeChange={handleEditorModeChange}
                  repoInfo={repoInfo}
                  planDiffStats={planDiff.diffStats}
                  isPlanDiffActive={isPlanDiffActive}
                  hasPreviousVersion={planDiff.hasPreviousVersion}
                  onPlanDiffToggle={() => setIsPlanDiffActive(!isPlanDiffActive)}
                  planDiffBaselineLabel={annotateMode ? 'since last review' : undefined}
                  planDiffBaselineTooltip={annotateMode ? 'Changes since you last reviewed this file' : undefined}
                  maxWidth={annotateReaderMaxWidth}
                  remountToken={viewerContentKey}
                />
              )}

              {/* Annotation Toolstrip — the mode switcher (selection/redline input +
                  comment/markup mode). Markdown surfaces only: HTML/live surfaces
                  are comment-only with pinpoint + drag both live, so no floating
                  toolstrip ever overlays the rendered page. Hidden during plan
                  diff browsing. */}
              {toolstripVisible && (
                <div
                  className="w-full mb-3 md:mb-4 flex items-center justify-start"
                  style={annotateReaderMaxWidth == null ? undefined : { maxWidth: annotateReaderMaxWidth }}
                >
                  <AnnotationToolstrip
                    inputMethod={inputMethod}
                    onInputMethodChange={handleInputMethodChange}
                    mode={editorMode}
                    onModeChange={handleEditorModeChange}
                  />
                </div>
              )}

              {/* Plan Diff View — rendered when diff data exists, hidden when inactive */}
              {goalSetupBundle && (
                <div className="w-full flex justify-center">
                  <GoalSetupSurface
                    ref={goalSetupSurfaceRef}
                    bundle={goalSetupBundle}
                    maxWidth={planMaxWidth}
                    onActionStateChange={setGoalSetupAction}
                    onSubmitted={() => setSubmitted('approved')}
                  />
                </div>
              )}

              {planDiff.diffBlocks && planDiff.diffStats && !goalSetupMode && (
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
                    mode={effectiveEditorMode}
                  />
                </div>
              )}
              {/* Folder annotation empty state — shown before user picks a file */}
              {annotateSource === 'folder' && !markdown && !linkedDocHook.isActive && !goalSetupMode && (
                <FolderAnnotationEmptyState />
              )}
              {/* Normal Plan View — always mounted, hidden during diff mode */}
              <div className={`w-full relative ${isHtmlSurface ? 'flex-1 flex flex-col' : `flex justify-center${isEditingMarkdown ? ' flex-1 min-h-0' : ''}`}`} style={{ display: goalSetupMode || (isPlanDiffActive && planDiff.diffBlocks) || (annotateSource === 'folder' && !markdown && !linkedDocHook.isActive) ? 'none' : undefined }}>
                {(canUseWideMode || canEditMarkdown) && !isPlanDiffActive && !isHtmlSurface && (
                  <div
                    className="absolute -top-5 left-0 right-0 mx-auto w-full flex justify-end pointer-events-none"
                    style={annotateReaderMaxWidth === null ? undefined : { maxWidth: annotateReaderMaxWidth ?? 832 }}
                  >
                    <div className={`pointer-events-auto flex items-center gap-1.5 text-[11px] tracking-wide mr-[4px]`}>
                      {canUseWideMode && (['wide', 'focus'] as const).map((type, i) => (
                        <React.Fragment key={type}>
                          {i > 0 && <span aria-hidden className="text-muted-foreground/30 select-none">|</span>}
                          <Tooltip
                            side="top"
                            align="end"
                            content={type === 'wide' ? 'Hide panels and expand document width' : `Hide panels, keep document width (${modKey}+.)`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleViewMode(type)}
                              aria-pressed={wideModeType === type}
                              className={`cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 ${
                                wideModeType === type
                                  ? 'text-foreground'
                                  : 'text-muted-foreground/50 hover:text-muted-foreground'
                              }`}
                            >
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                          </Tooltip>
                        </React.Fragment>
                      ))}
                      {canEditMarkdown && (
                        <>
                          {canUseWideMode && <span aria-hidden className="text-muted-foreground/30 select-none">|</span>}
                          {isEditingMarkdown && activeSourceSave && (
                            <>
                              <Tooltip
                                side="top"
                                align="end"
                                content={`Save changes to ${activeSourceSave.basename}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => { void handleSaveEditedSourceFile(); }}
                                  disabled={activeSaveStatus === 'saving'}
                                  className={`flex items-center gap-1 cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${
                                    saveFailed
                                      ? 'text-destructive'
                                      : emphasizeSave
                                        ? 'text-primary'
                                        : 'text-muted-foreground/50 hover:text-muted-foreground'
                                  }`}
                                >
                                  {/* Invisible widest label reserves the width so Save/Saving/Saved
                                      swap without nudging neighbors (font-agnostic, no fixed px). */}
                                  <span className="grid justify-items-start">
                                    <span aria-hidden className="invisible col-start-1 row-start-1">Saving</span>
                                    <span className="col-start-1 row-start-1">
                                      {activeSaveStatus === 'saving'
                                        ? 'Saving'
                                        : hasUnsavedDiskChanges
                                          ? 'Save'
                                          : 'Saved'}
                                    </span>
                                  </span>
                                  {/* Dot slot is always present — only its color changes — so the
                                      button never reflows when edits appear/clear. */}
                                  <span
                                    aria-hidden
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ${
                                      saveFailed ? 'bg-destructive' : emphasizeSave ? 'bg-primary' : 'bg-transparent'
                                    }`}
                                  />
                                </button>
                              </Tooltip>
                              <span aria-hidden className="text-muted-foreground/30 select-none">|</span>
                            </>
                          )}
                          <Tooltip
                            side="top"
                            align="end"
                            content={
                              !isEditingMarkdown
                                ? 'Edit the document text directly'
                                : cancelMode
                                  ? 'Discard your edits and stop editing'
                                  : 'Commit your edits and return to annotating'
                            }
                          >
                            <button
                              type="button"
                              onClick={handleEditExitClick}
                              aria-pressed={isEditingMarkdown}
                              className={`cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 ${
                                cancelMode
                                  ? (confirmCancelEdits
                                      ? 'text-destructive'
                                      : 'text-muted-foreground/70 hover:text-foreground')
                                  : isEditingMarkdown
                                    ? 'text-primary'
                                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                              }`}
                            >
                              {!isEditingMarkdown
                                ? 'Edit'
                                : cancelMode
                                  ? (confirmCancelEdits ? 'Discard?' : 'Cancel')
                                  : 'Done'}
                            </button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {renderAs === 'html' ? (
                  <HtmlViewer
                    key={`${liveApp ? 'live-app' : linkedDocHook.isActive ? `doc:${linkedDocHook.filepath}` : 'plan'}${isPlanDiffActive && htmlDiffHtml ? ':diff' : ''}:reload-${htmlRefresh.reloadGeneration}`}
                    ref={viewerRef}
                    rawHtml={isPlanDiffActive && htmlDiffHtml ? htmlDiffHtml : rawHtml}
                    src={liveApp?.appUrl}
                    liveSession={liveApp ? { origin: liveApp.origin, token: liveApp.token } : undefined}
                    currentPageUrl={liveApp ? livePageUrl : undefined}
                    onPageChange={liveApp ? setLivePageUrl : undefined}
                    annotations={viewerAnnotations}
                    onAddAnnotation={handleAddAnnotation}
                    onSelectAnnotation={handleSelectAnnotation}
                    selectedAnnotationId={selectedAnnotationId}
                    mode={effectiveEditorMode}
                    // HTML/live surfaces are always pinpoint: armed = click
                    // pins an element AND drag selects text (both live at
                    // once); Interact (Esc) keeps clicks native while drag
                    // commenting stays available. No input-method switch.
                    inputMethod="pinpoint"
                    annotateModeActive={htmlAnnotateArmed}
                    onAnnotateModeExit={handleHtmlAnnotateExit}
                    onAnnotateModeToggle={handleHtmlAnnotateToggle}
                    maxWidth={isHtmlSurface ? null : annotateReaderMaxWidth}
                    fullViewport={isHtmlSurface}
                    // The header's eye toggle is the way back, so a
                    // restored toolsHidden:true is never a trap.
                    hideControls={isHtmlSurface && htmlToolsHidden}
                    diffAvailable={!liveApp && !!htmlDiffHtml}
                    diffActive={!liveApp && isPlanDiffActive && !!htmlDiffHtml}
                    onToggleDiff={() => setIsPlanDiffActive((v) => !v)}
                    onUnanchoredChange={htmlRefresh.reportAnnotationRestore}
                  />
                ) : isEditingMarkdown ? (
                  <MarkdownEditor
                    markdown={displayedMarkdown}
                    documentId={`edit:${activeEditableDocument?.key ?? 'root'}:${editGeneration}`}
                    editorHandleRef={markdownEditorHandleRef}
                    onMarkdownChange={handleEditorChange}
                    maxWidth={annotateReaderMaxWidth}
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
                    mode={effectiveEditorMode}
                    inputMethod={effectiveInputMethod}
                    repoInfo={repoInfo}
                    stickyActions={uiPrefs.stickyActionsEnabled}
                    planDiffStats={planDiff.diffStats}
                    isPlanDiffActive={isPlanDiffActive}
                    onPlanDiffToggle={() => setIsPlanDiffActive(!isPlanDiffActive)}
                    hasPreviousVersion={planDiff.hasPreviousVersion}
                    planDiffBaselineLabel={annotateMode ? 'since last review' : undefined}
                    planDiffBaselineTooltip={annotateMode ? 'Changes since you last reviewed this file' : undefined}
                    showDemoBadge={!isApiMode}
                    maxWidth={annotateReaderMaxWidth}
                    onOpenLinkedDoc={handleOpenLinkedDoc}
                    onOpenCodeFile={codeFilePopout.open}
                    linkedDocInfo={
                      linkedDocHook.isActive
                        ? {
                            filepath: linkedDocHook.filepath!,
                            onBack: handleLinkedDocBack,
                            label: annotateSource === 'folder'
                              ? undefined
                              : fileBrowser.activeFile ? 'File' : undefined,
                            backLabel,
                            variant: annotateSource === 'folder' ? 'folder-file' : 'breadcrumb',
                          }
                        : null
                    }
                    imageBaseDir={imageBaseDir}
                    codePathBaseDir={activeDocBaseDir}
                    copyLabel={annotateSource === 'message' ? 'Copy message' : annotateSource === 'file' || annotateSource === 'folder' ? 'Copy file' : undefined}
                    sourceInfo={sourceInfo}
                    messagePickerInfo={
                      annotateSource === 'message' && recentMessages.length > 1
                        ? {
                            // selectedMessageId is always one of recentMessages (set on init,
                            // only changed via handleSelectMessage), so findIndex is >= 0.
                            current: recentMessages.findIndex((m) => m.messageId === selectedMessageId) + 1,
                            total: recentMessages.length,
                            onOpen: () => openSidebarTab('messages'),
                          }
                        : undefined
                    }
                    onToggleCheckbox={checkbox.toggle}
                    checkboxOverrides={checkbox.overrides}
                    actionsLabelMode={actionsLabelMode}
                  />
                )}
              </div>
            </div>
          </OverlayScrollArea>

          {showAgentTerminalOnRight && agentTerminalPanel}

          {/* Right panel region — `group/sidebar` so the collapse button reveals when
              hovering the whole panel, not just the thin handle. The handle and the
              panel(s) are separate sibling conditionals, so they need a shared hover
              ancestor (`contents` = no layout box). */}
          <div className="contents group/sidebar">
          {/* Resize Handle */}
          {isRightPanelVisible && wideModeType === null && !goalSetupMode && <ResizeHandle {...panelResize.handleProps} className="hidden md:block z-[55]" side="right" hideHoverTrack tooltip={RESIZE_HANDLE_TOOLTIP} onCollapse={() => setIsPanelOpen(false)} />}

          {/* Annotation Panel */}
          {renderAnnotationPanel(
            'panel',
            isRightPanelVisible && wideModeType === null && !goalSetupMode,
          )}
          </div>
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

        {/* Feedback prompt dialog */}
        <ConfirmDialog
          isOpen={showFeedbackPrompt}
          onClose={() => setShowFeedbackPrompt(false)}
          title="Add Feedback First"
          message={
            canEditMarkdown
              ? `To provide feedback, add annotations or direct edits. ${agentName} will use your feedback to revise the ${annotateMode ? 'document' : 'plan'}.`
              : `To provide feedback, select text and add annotations. ${agentName} will use your annotations to revise the ${annotateMode ? 'document' : 'plan'}.`
          }
          variant="info"
        />

        {/* Unsaved source-file edit warning dialog */}
        <ConfirmDialog
          isOpen={showSourceFileEditWarning}
          onClose={closeSourceFileEditWarning}
          onConfirm={confirmSourceFileEditWarning}
          title={sourceFileEditWarningAction === 'close' ? 'Unsaved File Edits' : "File Edits Won't Be Sent"}
          message={
            sourceFileEditWarningAction === 'close'
              ? <>You have unsaved file edits. They are not saved to disk and will be lost if you close this session.</>
              : <>You have unsaved file edits. They are not saved to disk, and {agentName} won't get them if you {sourceFileEditWarningAction === 'approve' ? 'approve' : 'send feedback'}.</>
          }
          subMessage="Save or discard the file edits first if you want Hypermark to keep them."
          confirmText={
            sourceFileEditWarningAction === 'approve'
              ? 'Approve Anyway'
              : sourceFileEditWarningAction === 'close'
                ? 'Close Anyway'
                : 'Send Anyway'
          }
          cancelText="Cancel"
          variant="warning"
          showCancel
        />

        {/* Claude Code feedback warning dialog */}
        <ConfirmDialog
          isOpen={showClaudeCodeWarning}
          onClose={() => setShowClaudeCodeWarning(false)}
          onConfirm={() => {
            setShowClaudeCodeWarning(false);
            handleApprove();
          }}
          title="Feedback Won't Be Sent"
          message={
            hasOnlySavedFileChanges
              ? <>{agentName} doesn't yet support feedback on approval. {savedFileAwarenessOnlyMessage}</>
              : <>{agentName} doesn't yet support feedback on approval. Your {feedbackLoss} will be lost.{savedFileAwarenessMixedMessage}</>
          }
          subMessage={
            <>
              To send feedback, use <strong>Send Feedback</strong> instead.
              <br /><br />
              Want this feature? Upvote these issues:
              <br />
              <a href="https://github.com/anthropics/claude-code/issues/16001" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#16001</a>
              {' · '}
              <a href="https://github.com/anthropics/claude-code/issues/15755" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#15755</a>
            </>
          }
          confirmText="Approve Anyway"
          cancelText="Cancel"
          variant="warning"
          showCancel
        />

        {/* Unsent feedback warning dialog — raised by the Close menu item for
            the feedback the decision spec cannot count (direct edits, saved
            file changes). Annotations get the spec's own confirm instead. */}
        <ConfirmDialog
          isOpen={showExitWarning}
          onClose={() => setShowExitWarning(false)}
          onConfirm={() => {
            setShowExitWarning(false);
            handleAnnotateExit();
          }}
          title="Feedback Won't Be Sent"
          message={
            hasOnlySavedFileChanges
              ? <>{savedFileChangesOnDiskMessage} The agent will not get that context if you close.</>
              : <>You have {feedbackLoss} that will be lost if you close.{savedFileAwarenessMixedMessage}</>
          }
          subMessage={hasOnlySavedFileChanges ? 'To tell the agent what changed, use Send Feedback instead.' : 'To send this feedback, use Send Feedback instead.'}
          confirmText="Close Anyway"
          cancelText="Cancel"
          variant="warning"
          showCancel
        />

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
            : goalSetupMode ? 'Answers Submitted'
            : submitted === 'approved'
              ? (annotateMode ? 'Approved' : 'Plan Approved')
              : annotateMode ? 'Feedback Sent'
            : 'Feedback Sent'
          }
          subtitle={
            submitted === 'exited'
              ? 'Annotation session closed without feedback.'
              : goalSetupMode
                  ? `${agentName} will use your answers to continue.`
                : submitted === 'approved'
                  ? (annotateMode
                      ? `${agentName} will proceed.`
                      : `${agentName} will proceed with the implementation.`)
                  : annotateMode
                    ? `${agentName} will address your feedback on the ${annotateSource === 'message' ? 'message' : annotateSource === 'folder' ? 'files' : 'file'}.`
                    : `${agentName} will revise the plan based on your feedback.`
          }
          agentLabel={agentName}
        />
      </div>
      </TooltipProvider>
    </ThemeProvider>
  );
};

// Spec 03 step 5: Phosphor's default weight ("regular") is the app-wide
// default for every icon rendered under this root. Set once here instead of
// repeating `weight="regular"` at each call site; only a control that
// deliberately deviates overrides it per-call.
const App: React.FC = () => (
  <IconContext.Provider value={{ weight: 'regular' }}>
    <AppInner />
  </IconContext.Provider>
);

export default App;
