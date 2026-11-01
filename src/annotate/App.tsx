// Eager math registration (side-effect import, evaluated before every other
// module below): KaTeX fills the renderer slot before the first render, so
// math is typeset on the first commit instead of after the lazy chunk loads.
// Keep this line first.
import '@/ui/utils/math-eager';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Toaster } from 'sonner';
import { shouldStripFrontmatter } from '@/shared/annotatable';
import { parseMarkdownToBlocks, extractFrontmatter, type MessageAnnotationEntry } from '@/ui/utils/parser';
import { Viewer, ViewerHandle } from '@/ui/components/Viewer';
import { AnnotationPanel, type AnnotationScope, type AnnotationMessageGroup } from '@/ui/components/AnnotationPanel';
import { Annotation, AnnotationType, type ImageAttachment } from '@/ui/types';
import { ThemeProvider } from '@/ui/components/ThemeProvider';
import { FluidRoot } from '@/ui/fluid/components/fluid-root';
import { TooltipProvider } from '@/ui/components/Tooltip';
import { configStore } from '@/ui/config';
import { CompletionOverlay } from '@/ui/components/CompletionOverlay';
import { OverlayScrollArea } from '@/ui/components/OverlayScrollArea';
import { ScrollViewportProvider } from '@/ui/hooks/useScrollViewport';
import { useOverlayViewport } from '@/ui/hooks/useOverlayViewport';
import { useIsMobile } from '@/ui/hooks/useIsMobile';
import { useViewportEnvironment } from '@/ui/hooks/useViewportEnvironment';
import { useAnnotationDraft, type MessageDrafts } from '@/ui/hooks/useAnnotationDraft';
import { useSessionEndedStream } from '@/ui/hooks/useSessionEndedStream';
import { useUndoHistory } from '@/ui/hooks/useUndoHistory';
import { generateId } from '@/ui/utils/generateId';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { MessageRail, type PickerMessage } from '@/ui/components/MessageRail';

/** Distance from the document scroller's right edge to the message rail: the
 *  11px native scrollbar plus the rail's own 12px gutter, reserved whether the
 *  scrollbar is drawn or not so the rail never moves between messages. */
const MESSAGE_RAIL_INSET = 24;
import { CompactionSquiggle } from '@/ui/components/CompactionSquiggle';
import { compactionEndIds } from '@/ui/utils/messageRail';
import { CommentPopover } from '@/ui/components/CommentPopover';
import { SideChatCard } from '@/ui/components/SideChatCard';
import { useSideChat } from '@/ui/hooks/useSideChat';
import { useQuickLabels } from '@/ui/hooks/useQuickLabels';
import { DEMO_CONTENT } from './demoDocument';
import {
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
import {
  useCheckboxOverrides,
  type CheckboxOverrideSnapshot,
  type CheckboxToggleMutation,
} from './hooks/useCheckboxOverrides';
import { AppHeader } from './components/AppHeader';
import { buildCompleteAnnotateFeedback } from './utils/annotateSubmission';
import { buildDecisionSpec, type DecisionActionId } from '@/ui/utils/decisionSpec';
import { type DecisionHandler } from '@/ui/components/DecisionControl';
import {
  openAnnotateClientLeaseStream,
  shouldConnectAnnotateClientLease,
  type AnnotateClientLeaseConfig,
} from './annotateClientLease';

/** One message's document and annotations, kept while another message is on screen. */
type MessageDocState = {
  markdown: string;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  globalAttachments: ImageAttachment[];
};

type MessageAnnotationState = {
  messageId: string;
  text: string;
  timestamp?: string;
  doc: MessageDocState;
};

const countMessageAnnotations = (state: MessageAnnotationState): number =>
  state.doc.annotations.length + state.doc.globalAttachments.length;

const createEmptyMessageState = (message: PickerMessage): MessageAnnotationState => ({
  messageId: message.messageId,
  text: message.text,
  timestamp: message.timestamp,
  doc: {
    markdown: message.text,
    annotations: [],
    selectedAnnotationId: null,
    globalAttachments: [],
  },
});

const normalizeMessageState = (
  state: MessageAnnotationState,
  message: PickerMessage,
): MessageAnnotationState => ({
  ...state,
  text: message.text,
  timestamp: message.timestamp,
  doc: {
    ...state.doc,
    // The message text is immutable and comes from the picker. Keep it as the
    // source of truth so transient UI state cannot cache an empty markdown
    // value for a message.
    markdown: message.text,
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
}

type DocumentHistoryAction =
  | {
      kind: 'annotation';
      mutation: CollectionMutation<Annotation>;
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
  return annotation.type !== AnnotationType.GLOBAL_COMMENT
    && !annotation.id.startsWith('ann-checkbox-');
}

const AppInner: React.FC = () => {
  useViewportEnvironment();
  const [markdown, setMarkdown] = useState(DEMO_CONTENT);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const selectionRef = useRef<HistorySelection>({ annotationId: null });
  selectionRef.current = { annotationId: selectedAnnotationId };
  const restoreCheckboxOverridesRef = useRef<(snapshot: CheckboxOverrideSnapshot) => void>(() => {});
  const checkboxSelectionBeforeRef = useRef<HistorySelection | null>(null);
  const [sourceFilePath, setSourceFilePath] = useState<string | undefined>();
  // Frontmatter stripping is a markdown convention — for non-markdown
  // annotatable sources (.yaml/.txt/…) a leading `--- … ---` pair is real
  // content (multi-document YAML), so it must survive parsing.
  const parseFrontmatter = shouldStripFrontmatter(sourceFilePath);
  const parseFrontmatterRef = useRef(parseFrontmatter);
  useEffect(() => {
    parseFrontmatterRef.current = parseFrontmatter;
  }, [parseFrontmatter]);
  const frontmatter = useMemo(
    () => (parseFrontmatter ? extractFrontmatter(markdown).frontmatter : null),
    [markdown, parseFrontmatter],
  );
  const blocks = useMemo(
    () => parseMarkdownToBlocks(markdown, { frontmatter: parseFrontmatter }),
    [markdown, parseFrontmatter],
  );
  // The keydown effects mount above the decision callbacks; call through a
  // render-assigned ref (same pattern as headerHandlersRef) so keyboard and
  // header share literally one submitPrimaryDecision.
  const submitPrimaryDecisionRef = useRef<() => void>(() => {});
  // The annotations panel is permanent on desktop. This state is the MOBILE
  // drawer only: it opens when a comment is selected and closes on its own X.
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const documentAreaRef = useRef<HTMLDivElement>(null);
  // Anchor of the global comment composer: the + in the annotations panel.
  const [globalComposerAnchor, setGlobalComposerAnchor] = useState<HTMLElement | null>(null);
  // Composer reopened on an existing annotation, by a click on its highlight or
  // on its panel card's edit button
  const [editComposer, setEditComposer] = useState<{ annotation: Annotation; anchorEl: HTMLElement } | null>(null);
  // Whether the edit composer's text or images differ from the saved
  // annotation; a cleared one doesn't count, since closing it deletes it.
  const editDirtyRef = useRef(false);
  // The annotation whose edit composer has been cleared of text and images.
  const clearedEditRef = useRef<string | null>(null);
  // Whether the global comment composer holds a draft.
  const globalDirtyRef = useRef(false);
  const [selectionComposerOpen, setSelectionComposerOpen] = useState(false);
  // Send and Close wait while any composer is open, so a draft is
  // never sent or dropped along with the session.
  const composerOpen = selectionComposerOpen || globalComposerAnchor !== null || editComposer !== null;
  const [isApiMode, setIsApiMode] = useState(false);
  // Legacy, read-only: the toolbar Images action and the
  // document-level paste handler that used to write here are gone. This stays
  // at [] for the life of a session — restore-time normalization folds any
  // stored top-level images into a GLOBAL_COMMENT annotation instead — and is
  // only still threaded through the message state, useAnnotationDraft and
  // export payload shapes that read it.
  const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
  const [clientLease, setClientLease] = useState<AnnotateClientLeaseConfig | null>(null);
  const [annotateSource, setAnnotateSource] = useState<'file' | 'message' | null>(null);
  const [recentMessages, setRecentMessages] = useState<PickerMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  // Messages the squiggle goes under, counted over the messages the rail shows.
  const compactionEnds = useMemo(() => {
    const hidden = new Set(recentMessages.filter((m) => m.hidden && m.messageId !== selectedMessageId).map((m) => m.messageId));
    return compactionEndIds([...recentMessages].reverse(), (id) => !hidden.has(id));
  }, [recentMessages, selectedMessageId]);
  const [annotationScope, setAnnotationScope] = useState<AnnotationScope>('this');
  const [pendingAnnotationSelection, setPendingAnnotationSelection] = useState<string | null>(null);
  const messageStateCacheRef = useRef<Map<string, MessageAnnotationState>>(new Map());
  const [cachedMessageAnnotationCounts, setCachedMessageAnnotationCounts] = useState<Map<string, number>>(new Map());
  const [imageBaseDir, setImageBaseDir] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [submitted, setSubmitted] = useState<'all-good' | 'feedback-sent' | 'exited' | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ display: string; branch?: string; host?: string } | null>(null);
  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Hypermark` : "Hypermark";
  }, [repoInfo]);

  const isMobile = useIsMobile();

  const viewerRef = useRef<ViewerHandle>(null);
  const [quickLabels] = useQuickLabels();
  const sideChat = useSideChat();
  const sideChatAsk = sideChat.ask;
  const handleAskSideQuestion = useCallback((question: string, quote: string) => {
    sideChatAsk(quote.trim(), quote.trim(), question);
  }, [sideChatAsk]);
  const historyContext = [
    annotateSource ?? 'file',
    selectedMessageId ?? 'message',
    sourceFilePath ?? 'root',
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
      selectionRef.current = selection;
      return;
    }

    const selection = direction === 'undo' ? action.beforeSelection : action.afterSelection;
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
    setSelectedAnnotationId(selection.annotationId);
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

  // The message on screen, for keeping it while another message is shown.
  const snapshotMessageDoc = useCallback((): MessageDocState => ({
    markdown,
    annotations: [...annotations],
    selectedAnnotationId,
    globalAttachments: [...globalAttachments],
  }), [markdown, annotations, selectedAnnotationId, globalAttachments]);

  const restoreMessageDoc = useCallback((doc: MessageDocState) => {
    // Clear web-highlighter marks before swapping content to prevent a React
    // DOM mismatch, then re-apply the message's highlights once it renders.
    viewerRef.current?.clearAllHighlights();
    setMarkdown(doc.markdown);
    setAnnotations([...doc.annotations]);
    setGlobalAttachments([...doc.globalAttachments]);
    setSelectedAnnotationId(doc.selectedAnnotationId);
    if (doc.annotations.length) {
      setTimeout(() => {
        viewerRef.current?.clearAllHighlights();
        viewerRef.current?.applyAnnotations(doc.annotations);
      }, 100);
    }
  }, []);

  useEffect(() => {
    annotationHistory.clear();
  }, [annotationHistory]);
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


  const buildCurrentMessageState = React.useCallback((): MessageAnnotationState | null => {
    if (annotateSource !== 'message' || !selectedMessageId) return null;
    const msg = recentMessages.find((m) => m.messageId === selectedMessageId);
    if (!msg) return null;
    return normalizeMessageState({
      messageId: msg.messageId,
      text: msg.text,
      timestamp: msg.timestamp,
      doc: snapshotMessageDoc(),
    }, msg);
  }, [
    annotateSource,
    selectedMessageId,
    recentMessages,
    snapshotMessageDoc,
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
    // re-render loop in multi-message mode. getMessageStatesWithCurrent
    // returns the same merged data without the setState side effect; the cache
    // persistence happens in event handlers (handleSelectMessage) instead.
    const states = getMessageStatesWithCurrent();
    return recentMessages.map((msg) => {
      const state = states.get(msg.messageId) ?? createEmptyMessageState(msg);
      return {
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        annotations: state.doc.annotations,
        globalAttachments: state.doc.globalAttachments,
        blocks: parseMarkdownToBlocks(state.doc.markdown),
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
    restoreMessageDoc(targetState.doc);
  }, [
    recentMessages,
    selectedMessageId,
    saveCurrentMessageState,
    restoreMessageDoc,
    annotationHistory,
  ]);

  // Viewer identity must change when the rendered document changes: web-highlighter
  // mutates the Viewer DOM, so reconciling new content against the old subtree throws
  // removeChild errors — a changed key remounts it cleanly instead.
  const viewerContentKey = annotateSource === 'message' && selectedMessageId
    ? `msg:${selectedMessageId}`
    : 'file';

  const allAnnotations = annotations;

  // Any-annotations flag used by Close/Send guards. Consolidates the
  // four-term check that was inlined across the annotate-mode header + keyboard paths.
  const messageMultiSelectMode = annotateSource === 'message' && recentMessages.length > 1;
  const hasAnyAnnotations = useMemo(
    () => messageMultiSelectMode
      ? messageFeedbackAnnotationCount > 0
      : allAnnotations.length > 0
        || globalAttachments.length > 0,
    [
      messageMultiSelectMode,
      messageFeedbackAnnotationCount,
      allAnnotations.length,
      globalAttachments.length,
    ],
  );
  const feedbackAnnotationCount = messageMultiSelectMode
    ? messageFeedbackAnnotationCount
    : allAnnotations.length + globalAttachments.length;

  // Auto-save annotation drafts
  const handleRestoreDraftRef = useRef<(loadedDraft?: any) => void>(() => {});
  const { restoreDraft, scheduleDraftSave, scheduleDraftSaveAfterSubmitFailure, getDraftGeneration, discardDraft, flushDraft } = useAnnotationDraft({
    annotations: allAnnotations,
    globalAttachments,
    isApiMode,
    // isSubmitting counts: a save firing while a submit is in flight can
    // land after the server's draft delete and ghost a draft
    // into the next session for this file. Saving resumes if it fails.
    submitted: !!submitted || isSubmitting,
    getMessageDrafts: messageMultiSelectMode
      ? () => {
        const drafts: MessageDrafts = {};
        for (const [id, state] of getMessageStatesWithCurrent()) {
          if (countMessageAnnotations(state) > 0) {
            drafts[id] = { annotations: state.doc.annotations, globalAttachments: state.doc.globalAttachments };
          }
        }
        return drafts;
      }
      : undefined,
    onDraftLoaded: (draft) => handleRestoreDraftRef.current(draft),
  });

  const handleRestoreDraft = React.useCallback((
    loadedDraft?: ReturnType<typeof restoreDraft>,
  ) => {
    annotationHistory.clear();
    const { annotations: flat, messages } = loadedDraft ?? restoreDraft();
    let restored = flat;

    // A per-message draft: other messages go back into the cache, the selected
    // one onto the page. Messages no longer in the rail are dropped.
    if (messages && annotateSource === 'message') {
      const cache = new Map<string, MessageAnnotationState>();
      for (const msg of recentMessages) {
        const entry = messages[msg.messageId];
        if (!entry || msg.messageId === selectedMessageId) continue;
        const empty = createEmptyMessageState(msg);
        cache.set(msg.messageId, { ...empty, doc: { ...empty.doc, ...entry } });
      }
      messageStateCacheRef.current = cache;
      setCachedMessageAnnotationCounts(buildMessageAnnotationCounts(cache));
      restored = (selectedMessageId ? messages[selectedMessageId]?.annotations : undefined) ?? [];
    }

    if (restored.length > 0) {
      setAnnotations(restored);
      // Apply highlights to DOM after a tick
      setTimeout(() => {
        viewerRef.current?.applyAnnotations(restored);
      }, 100);
    }
    scheduleDraftSave();
  }, [annotationHistory, restoreDraft, scheduleDraftSave, annotateSource, recentMessages, selectedMessageId]);
  handleRestoreDraftRef.current = handleRestoreDraft;

  const getCurrentFeedbackPayload = useCallback((): string => {
    return buildCompleteAnnotateFeedback({
      blocks,
      annotations: allAnnotations,
      globalAttachments,
      title: annotateSource === 'message' ? 'Message Feedback' : 'File Feedback',
      subject: annotateSource ?? 'file',
      ...(messageMultiSelectMode
        ? { messageEntries: buildMessageAnnotationEntries() }
        : {}),
    });
  }, [
    allAnnotations,
    annotateSource,
    blocks,
    buildMessageAnnotationEntries,
    globalAttachments,
    messageMultiSelectMode,
  ]);

  const withDraftGeneration = useCallback((path: string): string => {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}draftGeneration=${getDraftGeneration()}`;
  }, [getDraftGeneration]);

  // Check if we're in API mode (served from Bun hook server)
  useEffect(() => {
    fetch('/api/document')
      .then(res => {
        if (!res.ok) throw new Error('Not in API mode');
        return res.json();
      })
      .then((data: { markdown: string; mode?: 'annotate' | 'annotate-last'; filePath?: string; clientLease?: AnnotateClientLeaseConfig; repoInfo?: { display: string; branch?: string; host?: string }; projectRoot?: string; serverConfig?: Record<string, unknown>; recentMessages?: PickerMessage[]; selectedMessageId?: string }) => {
        // Initialize config store with server-provided values (config file > cookie > default)
        configStore.init(data.serverConfig);
        if (typeof data.markdown === 'string') {
          const normalizedMarkdown = data.markdown.replace(/\r\n?/g, '\n');
          setMarkdown(normalizedMarkdown);
        }
        setIsApiMode(true);
        if (data.mode === 'annotate' || data.mode === 'annotate-last') {
          setClientLease(data.clientLease ?? null);
          setAnnotateSource(data.mode === 'annotate-last' ? 'message' : 'file');
        }
        if (data.mode === 'annotate-last' && data.recentMessages && data.recentMessages.length > 0) {
          messageStateCacheRef.current = new Map();
          setCachedMessageAnnotationCounts(new Map());
          setRecentMessages(data.recentMessages);
          // The message the server opened, whose text is `markdown`.
          const opened = data.recentMessages.find((m) => m.messageId === data.selectedMessageId);
          setSelectedMessageId((opened ?? data.recentMessages[0]).messageId);
        } else {
          messageStateCacheRef.current = new Map();
          setCachedMessageAnnotationCounts(new Map());
          setRecentMessages([]);
          setSelectedMessageId(null);
        }
        if (data.filePath) {
          setImageBaseDir(data.filePath.replace(/\/[^/]+$/, ''));
          if (data.mode === 'annotate') {
            setSourceFilePath(data.filePath);
          }
        }
        if (data.repoInfo) {
          setRepoInfo(data.repoInfo);
        }
      })
      .catch(() => {
        // Not in API mode - use default content
        setIsApiMode(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Client-lease: while the session is open, keep exactly one EventSource
  // open so the server can detect this tab going away and dismiss the session
  // after its grace period instead of hanging the CLI forever. Grace only
  // starts once the transport reports a
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

  const hasFeedbackToSend = hasAnyAnnotations;

  // Which message(s) a submission is about.
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

  // Send Feedback, or All good when there is nothing to send. Returns whether
  // the submission was posted.
  const handleAnnotateFeedback = async (): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const feedback = getCurrentFeedbackPayload();

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          feedback,
          annotations: allAnnotations,
          ...getFeedbackMessageScope(),
        }),
      });
      if (!res.ok) throw new Error('Failed to send feedback');
      discardDraft();
      setSubmitted(hasFeedbackToSend ? 'feedback-sent' : 'all-good');
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

      // An open composer holds the decision until it is saved or closed.
      if (composerOpen) return;

      // Don't intercept in demo/share mode (no API)
      if (!isApiMode) return;

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
    submitted, isSubmitting, isExiting, isApiMode, annotations.length,
    annotateSource, composerOpen,
  ]);

  const handleAddAnnotation = (ann: Annotation) => {
    const beforeSelection = selectionRef.current;
    const index = annotationsRef.current.length;
    annotationsRef.current = [...annotationsRef.current, ann];
    setAnnotations(annotationsRef.current);
    setSelectedAnnotationId(ann.id);
    selectionRef.current = { annotationId: ann.id };
    annotationHistory.record({
      kind: 'annotation',
      mutation: { kind: 'add', item: ann, index },
      beforeSelection,
      afterSelection: selectionRef.current,
    });
  };

  // Keep selection behavior explicit across mobile/wide-mode transitions.
  const handleSelectAnnotation = React.useCallback((id: string | null, messageId?: string) => {
    if (messageId && messageId !== selectedMessageId) {
      handleSelectMessage(messageId);
      if (id) setPendingAnnotationSelection(id);
      return;
    }
    setSelectedAnnotationId(id);
    selectionRef.current = { annotationId: id };
    if (id && isMobile) setIsMobilePanelOpen(true);
  }, [isMobile, selectedMessageId, handleSelectMessage]);

  useEffect(() => {
    if (!pendingAnnotationSelection) return;
    const id = pendingAnnotationSelection;
    setPendingAnnotationSelection(null);
    requestAnimationFrame(() => {
      handleSelectAnnotation(id);
    });
  }, [selectedMessageId, handleSelectAnnotation]);

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
      selectionRef.current = { annotationId: annotation.id };
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
  // A panel card click selects the card's annotation, which scrolls its
  // highlight into view when off screen; a click on the already selected card
  // scrolls it again. Editing is the card's edit button (handleOpenAnnotation).
  const handleSelectCard = (id: string, messageId?: string) => {
    if (id !== selectedAnnotationId || (messageId && messageId !== selectedMessageId)) {
      handleSelectAnnotation(id, messageId);
      return;
    }
    const escaped = CSS.escape(id);
    const highlight = Array.from(document.querySelectorAll<HTMLElement>(
      `.annotation-highlight[data-highlight-id="${escaped}"], [data-bind-id="${escaped}"]`,
    )).find((el) => el.getClientRects().length > 0);
    const rect = highlight?.getBoundingClientRect();
    if (rect && (rect.top < 64 || rect.bottom > window.innerHeight - 16)) {
      highlight!.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Closing an edit composer whose text was cleared, by any route, deletes
  // its annotation, undoably like the card's delete button.
  const deleteAnnotationRef = useRef(deleteAnnotation);
  deleteAnnotationRef.current = deleteAnnotation;
  const closeEditComposer = useCallback(() => {
    const cleared = clearedEditRef.current;
    clearedEditRef.current = null;
    if (cleared) deleteAnnotationRef.current(cleared);
    setEditComposer(null);
  }, []);

  // Selects the annotation and opens the composer on it, anchored to its first
  // visible highlight. A global comment anchors to the panel's +, where new
  // ones open; a highlight scrolled out of the DOM (or a global comment with
  // the + hidden) anchors to its panel card. A second click on the same
  // annotation closes it. Only one composer is open at a time, and one holding
  // a draft stays.
  const handleOpenAnnotation = (id: string | null, messageId?: string) => {
    if (id && editComposer?.annotation.id === id) {
      if (!editDirtyRef.current) closeEditComposer();
      return;
    }
    handleSelectAnnotation(id, messageId);
    if (!id || (messageId && messageId !== selectedMessageId)) return;
    if ((editComposer && editDirtyRef.current) || (globalComposerAnchor && globalDirtyRef.current)) return;
    const annotation = allAnnotations.find((item) => item.id === id);
    if (!annotation || annotation.type === AnnotationType.DELETION) return;
    const escaped = CSS.escape(id);
    const isVisible = (el: Element) => el.getClientRects().length > 0;
    const primary = Array.from(document.querySelectorAll<HTMLElement>(
      annotation.type === AnnotationType.GLOBAL_COMMENT
        ? '[data-global-comment-add]'
        : `.annotation-highlight[data-highlight-id="${escaped}"], [data-bind-id="${escaped}"]`,
    )).find(isVisible);
    const anchorEl = primary
      ?? Array.from(document.querySelectorAll<HTMLElement>(`[data-annotation-id="${escaped}"]`)).find(isVisible);
    if (!anchorEl) return;
    if (viewerRef.current && !viewerRef.current.closeComposer()) return;
    setGlobalComposerAnchor(null);
    closeEditComposer();
    editDirtyRef.current = false;
    setEditComposer({ annotation, anchorEl });
  };

  // Opens the panel's global composer. Like handleOpenAnnotation, it replaces
  // an open composer only when that composer holds no draft.
  const handleAddGlobalComment = (anchorEl: HTMLElement) => {
    if (editComposer && editDirtyRef.current) return;
    if (viewerRef.current && !viewerRef.current.closeComposer()) return;
    closeEditComposer();
    globalDirtyRef.current = false;
    setGlobalComposerAnchor(anchorEl);
  };

  const agentName = 'Claude Code';

  // Header handlers ref — stores latest handler references so the stable
  // callbacks below always call the current version without needing useCallback
  // dep arrays for every handler. This lets React.memo on AppHeader work.
  const headerHandlersRef = useRef({
    handleAnnotateFeedback,
    handleAnnotateExit,
  });
  headerHandlersRef.current = {
    handleAnnotateFeedback,
    handleAnnotateExit,
  };

  // --- The unified annotate decision control ----------------
  // One primary, one callback: the header's left segment, the global
  // Mod+Enter handler (via submitPrimaryDecisionRef) all call this. All good
  // and Send Feedback both post /api/feedback.
  const submitPrimaryDecision = useCallback(() => {
    if (isSubmitting || isExiting) return; // double-submit guard while in flight
    if (composerOpen) return;
    void headerHandlersRef.current.handleAnnotateFeedback();
  }, [
    composerOpen,
    isExiting,
    isSubmitting,
  ]);
  submitPrimaryDecisionRef.current = submitPrimaryDecision;

  const closeSession = useCallback(() => {
    if (composerOpen || submitted || isSubmitting || isExiting) return;
    void headerHandlersRef.current.handleAnnotateExit();
  }, [composerOpen, isExiting, isSubmitting, submitted]);

  const annotateDecisionSpec = useMemo(() => buildDecisionSpec({
    count: feedbackAnnotationCount,
    hasFeedback: hasFeedbackToSend,
  }), [
    feedbackAnnotationCount,
    hasFeedbackToSend,
  ]);

  const annotateDecisionHandlers = useMemo<Record<DecisionActionId, DecisionHandler>>(() => ({
    'primary': submitPrimaryDecision,
    'close-session': closeSession,
  }), [closeSession, submitPrimaryDecision]);

  const annotateDecision = useMemo(() => ({
    spec: annotateDecisionSpec,
    handlers: annotateDecisionHandlers,
    disabledReason: composerOpen ? 'Save or close the open comment first' : undefined,
  }), [annotateDecisionHandlers, annotateDecisionSpec, composerOpen]);

  // Reading column. One width: the document is centred with a gutter on
  // each side.
  // 880px at the 14px body is 63em — the measure GitHub renders markdown in at
  // 16px/1012px, reproduced at our smaller type size.
  const documentMaxWidth = 880;

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
        : state?.doc.annotations ?? [];
      groups.push({
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        isCurrent,
        annotations: groupAnnotations,
      });
    }
    groups.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return 0;
    });
    return groups;
  }, [isMessageScopeEligible, getMessageStatesWithCurrent, selectedMessageId, recentMessages, allAnnotations]);

  const handleGlobalCommentSubmit = (text: string, images?: ImageAttachment[]) => {
    handleAddAnnotation({
      // randomUUID, not Date.now(): two comments minted in the same
      // millisecond (paste + submit, or a concurrent external write)
      // would collide on a timestamp id.
      id: generateId('global'),
      blockId: '',
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.GLOBAL_COMMENT,
      text: text.trim(),
      originalText: '',
      createdA: Date.now(),
      images,
    });
    setGlobalComposerAnchor(null);
  };

  const renderAnnotationPanel = (isOpen = true) => (
    <AnnotationPanel
      isOpen={isOpen}
      blocks={blocks}
      annotations={allAnnotations}
      selectedId={selectedAnnotationId}
      onSelectAnnotation={handleSelectCard}
      onDeleteAnnotation={handleDeleteAnnotation}
      onOpenAnnotation={handleOpenAnnotation}
      scope={isMessageScopeEligible ? annotationScope : undefined}
      onScopeChange={isMessageScopeEligible ? setAnnotationScope : undefined}
      messageGroups={isMessageScopeEligible ? messageGroups : undefined}
      onClose={() => setIsMobilePanelOpen(false)}
      onAddGlobalComment={handleAddGlobalComment}
      onCopyAll={() => copyTextToClipboard(getCurrentFeedbackPayload())}
    />
  );

  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="dark">
        <div className="pn-app-viewport bg-background" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <FluidRoot>
      <TooltipProvider delayDuration={900} skipDelayDuration={200}>
      {/* Mobile Safari paints the browser-controls backdrop from the app canvas,
          so keep it the same card color as the document. */}
      <div
        data-pn-browser-canvas="card"
        className="pn-app-viewport flex flex-col overflow-hidden bg-card"
      >
        <AppHeader
          sticky
          isApiMode={isApiMode}
          isSubmitting={isSubmitting}
          isExiting={isExiting}
          annotateDecision={annotateDecision}
        />

        {/* The provider is render-transparent (context only, no DOM), so it can
            open here without changing the shell's element structure or order.
            Viewer and BlockOutline read the scroll viewport
            from it. */}
        <ScrollViewportProvider viewport={scrollViewport}>



        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative z-0">
          {/* Document Area. The wrapper is the rail's anchor: its width is the
              scroller's BORDER box, which the scrollbar lives inside and so
              never changes. Anchoring the rail to the scroller's content box
              moved it sideways whenever a message was short enough not to
              scroll. */}
          <div className="relative flex min-w-0 flex-1 bg-card">
          {/* The background sits on the wrapper so the edge fade only fades the document. */}
          <OverlayScrollArea
            element="main"
            className="scroll-fade flex-1 min-w-0"
            overflowX="hidden"
            overflowY="auto"
            // Native scrollbars take layout width, so a document short enough
            // not to scroll is WIDER than one that does — which slid the
            // message rail sideways on every message switch. A stable gutter
            // reserves the space whether the scrollbar is there or not.
            style={{ scrollbarGutter: 'stable' }}
            onViewportReady={handleDocumentViewportReady}
          >
            <div ref={documentAreaRef} className="min-h-full flex flex-col items-center px-2 py-3 md:px-10 md:py-8 xl:px-16 relative z-10">
              <div className="w-full relative flex justify-center">
                <Viewer
                  key={viewerContentKey}
                  ref={viewerRef}
                  blocks={blocks}
                  frontmatter={frontmatter}
                  annotations={allAnnotations}
                  onAddAnnotation={handleAddAnnotation}
                  onSelectAnnotation={handleOpenAnnotation}
                  selectedAnnotationId={selectedAnnotationId}
                  onAskSideQuestion={handleAskSideQuestion}
                  onComposerOpen={closeEditComposer}
                  onComposerOpenChange={setSelectionComposerOpen}
                  repoInfo={repoInfo}
                  showDemoBadge={!isApiMode}
                  maxWidth={documentMaxWidth}
                  imageBaseDir={imageBaseDir}
                  onToggleCheckbox={checkbox.toggle}
                  checkboxOverrides={checkbox.overrides}
                />
              </div>
              {annotateSource === 'message'
                && selectedMessageId && compactionEnds.has(selectedMessageId) && (
                <CompactionSquiggle maxWidth={documentMaxWidth} />
              )}
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
          {/* The /sidechat card sits in the document's corner so it never covers the panel. */}
          {sideChat.thread && sideChat.openKey && (
            <SideChatCard
              key={sideChat.openKey}
              thread={sideChat.thread}
              onSend={(question) => sideChat.send(sideChat.openKey!, sideChat.thread!.quote, question)}
              onStop={() => sideChat.stop(sideChat.openKey!)}
              onClose={sideChat.close}
              clearRail={annotateSource === 'message' && recentMessages.length > 1}
            />
          )}
          </div>

          {/* Annotation Panel — permanent on desktop; on mobile it is a drawer
              opened by selecting a comment and closed by its own X. */}
          {renderAnnotationPanel(isMobile ? isMobilePanelOpen : true)}
        </div>
        </ScrollViewportProvider>


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

        {globalComposerAnchor && (
          <CommentPopover
            anchorEl={globalComposerAnchor}
            align="end"
            contextText=""
            isGlobal
            onDraftChange={(text, images) => {
              globalDirtyRef.current = text.trim() !== '' || (images?.length ?? 0) > 0;
            }}
            onSubmit={handleGlobalCommentSubmit}
            onClose={() => setGlobalComposerAnchor(null)}
          />
        )}

        {editComposer && (
          <CommentPopover
            key={editComposer.annotation.id}
            anchorEl={editComposer.anchorEl}
            contextText={editComposer.annotation.originalText.slice(0, 80)}
            copyText={editComposer.annotation.originalText}
            isGlobal={editComposer.annotation.type === AnnotationType.GLOBAL_COMMENT}
            initialText={editComposer.annotation.text ?? ''}
            initialImages={editComposer.annotation.images}
            onDraftChange={(text, images) => {
              const saved = editComposer.annotation;
              const cleared = text.trim() === '' && !images?.length;
              clearedEditRef.current = cleared ? saved.id : null;
              editDirtyRef.current = !cleared && (text.trim() !== (saved.text ?? '').trim()
                || (images?.length ?? 0) !== (saved.images?.length ?? 0));
            }}
            onSubmit={(text, images) => {
              editAnnotation(editComposer.annotation.id, {
                text: text.trim(),
                images: images?.length ? images : undefined,
              });
              setEditComposer(null);
            }}
            quickLabels={quickLabels}
            onQuickLabel={(label) => {
              editAnnotation(editComposer.annotation.id, { text: label.text, images: undefined });
              setEditComposer(null);
            }}
            // `/sidechat` replaced the comment in the box, so the side question
            // takes the annotation's place.
            onAsk={editComposer.annotation.type === AnnotationType.GLOBAL_COMMENT ? undefined : (question) => {
              handleAskSideQuestion(question, editComposer.annotation.originalText);
              clearedEditRef.current = editComposer.annotation.id;
              closeEditComposer();
            }}
            onClose={closeEditComposer}
          />
        )}

        {/* Completion overlay - shown once the session is decided */}
        <CompletionOverlay
          submitted={submitted}
          title={
            submitted === 'exited' ? 'Session Closed'
            : submitted === 'all-good'
              ? 'All good'
            : 'Feedback Sent'
          }
          subtitle={
            submitted === 'exited'
              ? 'Annotation session closed without feedback.'
              : submitted === 'all-good'
                ? `${agentName} was told you have no feedback.`
                : `${agentName} will address your feedback on the ${annotateSource === 'message' ? 'message' : 'file'}.`
          }
          agentLabel={agentName}
        />
      </div>
      </TooltipProvider>
      </FluidRoot>
    </ThemeProvider>
  );
};

const App: React.FC = () => <AppInner />;

export default App;
