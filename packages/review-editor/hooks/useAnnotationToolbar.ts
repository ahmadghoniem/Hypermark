import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  CodeAnnotation,
  SelectedLineRange,
  CodeAnnotationType,
  TokenAnnotationMeta,
  ImageAttachment,
} from '@hypermark/ui/types';
import { useVisibleViewportBounds } from '@hypermark/ui/hooks/useViewportEnvironment';
import type { DiffTokenEventBaseProps } from '@pierre/diffs';

export interface TokenMeta {
  lineNumber: number;
  charStart: number;
  charEnd: number;
  tokenText: string;
  side: 'deletions' | 'additions';
}

export interface TokenSelection {
  anchor: TokenMeta;
  fullText: string;
}

export interface ToolbarState {
  anchorRect?: DOMRect;
  range: SelectedLineRange;
  tokenSelection?: TokenSelection;
}

interface UseAnnotationToolbarArgs {
  filePath: string;
  isFocused: boolean;
  onLineSelection: (range: SelectedLineRange | null) => void;
  onAddAnnotation: (
    type: CodeAnnotationType,
    text?: string,
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[],
  ) => void;
  onEditAnnotation: (id: string, text?: string, images?: ImageAttachment[]) => void;
}

// Per-range draft storage (survives component remounts, e.g. file switches)
interface Draft {
  commentText: string;
  range: SelectedLineRange;
  anchorRect?: DOMRect;
  tokenSelection?: TokenSelection;
}

const draftStore = new Map<string, Draft>();
const restoreDraftKeyByFilePath = new Map<string, string>();

function draftKey(filePath: string, range: SelectedLineRange): string {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  return `${filePath}:${range.side}:${start}-${end}`;
}

export function useAnnotationToolbar({
  filePath,
  isFocused,
  onLineSelection,
  onAddAnnotation,
  onEditAnnotation,
}: UseAnnotationToolbarArgs) {
  const visibleBounds = useVisibleViewportBounds(16);
  const tokenAnchorRef = useRef<TokenMeta | null>(null);

  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  // Refs to avoid stale closures in saveDraft
  const commentTextRef = useRef(commentText);
  commentTextRef.current = commentText;
  const toolbarStateRef = useRef(toolbarState);
  toolbarStateRef.current = toolbarState;
  const editingRef = useRef(editingAnnotationId);
  editingRef.current = editingAnnotationId;
  const currentDraftKeyRef = useRef<string | null>(null);
  const wasFocusedRef = useRef(isFocused);

  const saveDraft = useCallback(() => {
    const range = toolbarStateRef.current?.range;
    if (!range || editingRef.current) return;
    const text = commentTextRef.current;
    const key = draftKey(filePath, range);
    if (text.trim()) {
      draftStore.set(key, {
        commentText: text,
        range,
        anchorRect: toolbarStateRef.current?.anchorRect,
        tokenSelection: toolbarStateRef.current?.tokenSelection,
      });
      currentDraftKeyRef.current = key;
    } else {
      draftStore.delete(key);
      if (currentDraftKeyRef.current === key) {
        currentDraftKeyRef.current = null;
      }
    }
  }, [filePath]);

  const clearDraft = useCallback(() => {
    const range = toolbarStateRef.current?.range;
    if (!range) return;
    const key = draftKey(filePath, range);
    draftStore.delete(key);
    restoreDraftKeyByFilePath.delete(filePath);
    if (currentDraftKeyRef.current === key) {
      currentDraftKeyRef.current = null;
    }
  }, [filePath]);

  // Save draft on unmount (e.g. file switch)
  useEffect(() => {
    return () => saveDraft();
  }, [saveDraft]);

  // Clear token anchor on file switch
  useEffect(() => {
    tokenAnchorRef.current = null;
  }, [filePath]);

  const resetForm = useCallback(() => {
    setToolbarState(null);
    setCommentText('');
    setEditingAnnotationId(null);
  }, []);

  // Shared: save current draft, restore form for new range, set toolbar state, notify parent
  const openToolbar = useCallback(
    (
      range: SelectedLineRange,
      anchorRect?: DOMRect,
      tokenSelection?: TokenSelection,
    ) => {
      saveDraft();
      setEditingAnnotationId(null);

      const draft = draftStore.get(draftKey(filePath, range));
      if (draft) {
        setCommentText(draft.commentText);
      } else {
        setCommentText('');
      }

      const effectiveAnchorRect =
        anchorRect ??
        new DOMRect(
          visibleBounds.left + visibleBounds.width / 2,
          visibleBounds.top + 64,
          1,
          1,
        );

      setToolbarState({ anchorRect: effectiveAnchorRect, range, tokenSelection });
      currentDraftKeyRef.current = draftKey(filePath, range);
      restoreDraftKeyByFilePath.delete(filePath);

      onLineSelection(range);
    },
    [filePath, onLineSelection, saveDraft, visibleBounds],
  );

  // Handle line selection end (gutter clicks)
  const handleLineSelectionEnd = useCallback(
    (range: SelectedLineRange | null, anchorRect?: DOMRect) => {
      tokenAnchorRef.current = null;

      if (!range) {
        setToolbarState(null);
        onLineSelection(null);
        return;
      }

      openToolbar(range, anchorRect);
    },
    [onLineSelection, openToolbar],
  );

  /** Open the ordinary code-review composer for a selection requested elsewhere. */
  const openLineAnnotation = useCallback(
    (range: SelectedLineRange, anchorRect?: DOMRect) => {
      tokenAnchorRef.current = null;
      openToolbar(range, anchorRect);
    },
    [openToolbar],
  );

  // Handle annotation submission (create or update)
  const submit = useCallback(
    (text: string, images?: ImageAttachment[]) => {
      const hasComment = text.trim().length > 0;
      const hasImages = (images?.length ?? 0) > 0;
      if (!toolbarState || (!hasComment && !hasImages)) return;

      const trimmedText = hasComment ? text.trim() : undefined;

      if (editingAnnotationId) {
        onEditAnnotation(editingAnnotationId, trimmedText, images);
      } else {
        const tokenSel = toolbarState.tokenSelection;
        const tokenMeta = tokenSel
          ? {
              charStart: tokenSel.anchor.charStart,
              charEnd: tokenSel.anchor.charEnd,
              tokenText: tokenSel.fullText,
            }
          : undefined;
        onAddAnnotation('comment', trimmedText, tokenMeta, images);
      }

      clearDraft();
      resetForm();
    },
    [
      toolbarState,
      editingAnnotationId,
      onAddAnnotation,
      onEditAnnotation,
      clearDraft,
      resetForm,
    ],
  );

  // Start editing an existing annotation
  const startEdit = useCallback(
    (annotation: CodeAnnotation, anchorRect?: DOMRect) => {
      setEditingAnnotationId(annotation.id);
      setCommentText(annotation.text || '');

      const effectiveAnchorRect =
        anchorRect ??
        new DOMRect(
          visibleBounds.left + visibleBounds.width / 2,
          visibleBounds.top + 64,
          1,
          1,
        );

      setToolbarState({
        anchorRect: effectiveAnchorRect,
        range: {
          start: annotation.lineStart,
          end: annotation.lineEnd,
          side: annotation.side === 'new' ? 'additions' : 'deletions',
        },
      });
    },
    [visibleBounds],
  );

  // Dismiss: save draft and hide toolbar
  const handleDismiss = useCallback(() => {
    saveDraft();
    setToolbarState(null);
    onLineSelection(null);
  }, [onLineSelection, saveDraft]);

  // Cancel: explicit discard via X button -- clears draft and form
  const handleCancel = useCallback(() => {
    clearDraft();
    resetForm();
    onLineSelection(null);
  }, [onLineSelection, clearDraft, resetForm]);

  useEffect(() => {
    const wasFocused = wasFocusedRef.current;
    wasFocusedRef.current = isFocused;

    if (wasFocused && !isFocused) {
      const key = currentDraftKeyRef.current;
      if (key && draftStore.has(key)) {
        restoreDraftKeyByFilePath.set(filePath, key);
      }
      return;
    }

    if (!wasFocused && isFocused && !toolbarStateRef.current) {
      const key = restoreDraftKeyByFilePath.get(filePath);
      const draft = key ? draftStore.get(key) : undefined;
      if (!draft) return;

      setCommentText(draft.commentText);
      setEditingAnnotationId(null);
      setToolbarState({
        anchorRect: draft.anchorRect,
        range: draft.range,
        tokenSelection: draft.tokenSelection,
      });
      currentDraftKeyRef.current = key;
      restoreDraftKeyByFilePath.delete(filePath);

      onLineSelection(draft.range);
    }
  }, [filePath, isFocused, onLineSelection]);

  // Handle single token click — opens toolbar for one token
  const handleTokenClick = useCallback(
    (props: DiffTokenEventBaseProps, event: MouseEvent) => {
      const clickedToken: TokenMeta = {
        lineNumber: props.lineNumber,
        charStart: props.lineCharStart,
        charEnd: props.lineCharEnd,
        tokenText: props.tokenText,
        side: props.side,
      };

      // Same token clicked twice → deselect
      const anchor = tokenAnchorRef.current;
      if (
        anchor &&
        anchor.lineNumber === clickedToken.lineNumber &&
        anchor.charStart === clickedToken.charStart &&
        anchor.side === clickedToken.side
      ) {
        tokenAnchorRef.current = null;
        setToolbarState(null);
        onLineSelection(null);
        return;
      }

      tokenAnchorRef.current = clickedToken;
      const anchorRect =
        event.target instanceof HTMLElement
          ? event.target.getBoundingClientRect()
          : undefined;
      openToolbar(
        {
          start: clickedToken.lineNumber,
          end: clickedToken.lineNumber,
          side: clickedToken.side,
        },
        anchorRect,
        { anchor: clickedToken, fullText: clickedToken.tokenText },
      );
    },
    [onLineSelection, openToolbar],
  );

  return {
    // State
    toolbarState,
    commentText,
    setCommentText,
    editingAnnotationId,
    // Handlers
    handleLineSelectionEnd,
    openLineAnnotation,
    handleTokenClick,
    submit,
    handleDismiss,
    handleCancel,
    startEdit,
  };
}
