import { useState, useCallback, useRef, useEffect } from 'react';
import { CodeAnnotation, SelectedLineRange, CodeAnnotationType, TokenAnnotationMeta, ImageAttachment } from '@hypermark/ui/types';
import { useDismissOnOutsideAndEscape } from '@hypermark/ui/hooks/useDismissOnOutsideAndEscape';
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
  position: { top: number; left: number };
  range: SelectedLineRange;
  tokenSelection?: TokenSelection;
}

interface UseAnnotationToolbarArgs {
  filePath: string;
  isFocused: boolean;
  onLineSelection: (range: SelectedLineRange | null) => void;
  onAddAnnotation: (type: CodeAnnotationType, text?: string, tokenMeta?: TokenAnnotationMeta, images?: ImageAttachment[]) => void;
  onEditAnnotation: (id: string, text?: string, images?: ImageAttachment[]) => void;
}

// Per-range draft storage (survives component remounts, e.g. file switches)
interface Draft {
  commentText: string;
  images: ImageAttachment[];
  range: SelectedLineRange;
  position: { top: number; left: number };
  tokenSelection?: TokenSelection;
}

const draftStore = new Map<string, Draft>();
const restoreDraftKeyByFilePath = new Map<string, string>();

function draftKey(filePath: string, range: SelectedLineRange): string {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  return `${filePath}:${range.side}:${start}-${end}`;
}

export function useAnnotationToolbar({ filePath, isFocused, onLineSelection, onAddAnnotation, onEditAnnotation }: UseAnnotationToolbarArgs) {
  const visibleBounds = useVisibleViewportBounds(16);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastMousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tokenAnchorRef = useRef<TokenMeta | null>(null);

  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [modalLayout, setModalLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  // Spec 05 §3.2/§4.1.5: images live on the same per-range draft as commentText,
  // survive save/restore across remounts, and are forwarded to onAddAnnotation /
  // onEditAnnotation exactly like the other composer fields.
  const [images, setImages] = useState<ImageAttachment[]>([]);

  // Refs to avoid stale closures in saveDraft
  const formRef = useRef({ commentText, images });
  formRef.current = { commentText, images };
  const toolbarStateRef = useRef(toolbarState);
  toolbarStateRef.current = toolbarState;
  const editingRef = useRef(editingAnnotationId);
  editingRef.current = editingAnnotationId;
  const currentDraftKeyRef = useRef<string | null>(null);
  const wasFocusedRef = useRef(isFocused);

  const saveDraft = useCallback(() => {
    const range = toolbarStateRef.current?.range;
    if (!range || editingRef.current) return;
    const form = formRef.current;
    const key = draftKey(filePath, range);
    if (form.commentText.trim() || form.images.length > 0) {
      draftStore.set(key, {
        ...form,
        range,
        position: toolbarStateRef.current?.position ?? { top: 0, left: 0 },
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
    setShowCommentModal(false);
    setEditingAnnotationId(null);
    setImages([]);
  }, []);

  // Track mouse position continuously for toolbar placement.
  // Structural type so the same handler accepts both React synthetic events
  // (parent JSX onMouseMove) and native MouseEvents (ToolbarHost window listener).
  const handleMouseMove = useCallback((e: { clientX: number; clientY: number }) => {
    lastMousePosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Shared: save current draft, restore form for new range, set toolbar state, notify parent
  const openToolbar = useCallback((
    range: SelectedLineRange,
    position: { top: number; left: number },
    tokenSelection?: TokenSelection,
  ) => {
    saveDraft();
    setEditingAnnotationId(null);
    setShowCommentModal(false);

    const draft = draftStore.get(draftKey(filePath, range));
    if (draft) {
      setCommentText(draft.commentText);
      setImages(draft.images);
    } else {
      setCommentText('');
      setImages([]);
    }

    setToolbarState({ position, range, tokenSelection });
    currentDraftKeyRef.current = draftKey(filePath, range);
    restoreDraftKeyByFilePath.delete(filePath);

    onLineSelection(range);
  }, [filePath, onLineSelection, saveDraft]);

  // Handle line selection end (gutter clicks)
  const handleLineSelectionEnd = useCallback((range: SelectedLineRange | null) => {
    tokenAnchorRef.current = null;

    if (!range) {
      setToolbarState(null);
      onLineSelection(null);
      return;
    }

    const mousePos = lastMousePosition.current;
    const hasPointerPosition = mousePos.x > 0 || mousePos.y > 0;
    openToolbar(range, hasPointerPosition
      ? { top: mousePos.y + 10, left: mousePos.x }
      : {
          top: visibleBounds.top + visibleBounds.height / 2,
          left: visibleBounds.left + visibleBounds.width / 2,
        }
    );
  }, [onLineSelection, openToolbar, visibleBounds]);

  /** Open the ordinary code-review composer for a selection requested elsewhere. */
  const openLineAnnotation = useCallback((range: SelectedLineRange) => {
    tokenAnchorRef.current = null;
    openToolbar(range, {
      top: Math.max(visibleBounds.top + 64, visibleBounds.top + visibleBounds.height / 2 - 80),
      left: visibleBounds.left + visibleBounds.width / 2,
    });
  }, [openToolbar, visibleBounds]);

  // Handle annotation submission (create or update)
  const handleSubmitAnnotation = useCallback(() => {
    const hasComment = commentText.trim().length > 0;
    const hasImages = images.length > 0;
    // Spec 05 §3.2.1: an image-only comment must be submittable — text is no
    // longer the only qualifying content.
    if (!toolbarState || (!hasComment && !hasImages)) return;

    const text = hasComment ? commentText.trim() : undefined;

    if (editingAnnotationId) {
      // Edit path: the composer always tracks a concrete image list, so it is
      // sent unconditionally (unlike the has-content checks above) — an edit
      // that removed every image must clear the annotation's saved list too,
      // not leave it untouched the way "not provided" would.
      onEditAnnotation(editingAnnotationId, text, images);
    } else {
      const submittedImages = hasImages ? images : undefined;
      const tokenSel = toolbarState.tokenSelection;
      const tokenMeta = tokenSel ? {
        charStart: tokenSel.anchor.charStart,
        charEnd: tokenSel.anchor.charEnd,
        tokenText: tokenSel.fullText,
      } : undefined;
      onAddAnnotation('comment', text, tokenMeta, submittedImages);
    }

    clearDraft();
    resetForm();
  }, [toolbarState, commentText, images, editingAnnotationId, onAddAnnotation, onEditAnnotation, clearDraft, resetForm]);

  // Start editing an existing annotation
  const startEdit = useCallback((annotation: CodeAnnotation) => {
    setEditingAnnotationId(annotation.id);
    setCommentText(annotation.text || '');
    setShowCommentModal(false);
    setImages(annotation.images || []);

    // Position toolbar near the annotation using last known mouse position
    const mousePos = lastMousePosition.current;
    const hasPointerPosition = mousePos.x > 0 || mousePos.y > 0;
    setToolbarState({
      position: hasPointerPosition
        ? { top: mousePos.y + 10, left: mousePos.x }
        : {
            top: visibleBounds.top + visibleBounds.height / 2,
            left: visibleBounds.left + visibleBounds.width / 2,
          },
      range: {
        start: annotation.lineStart,
        end: annotation.lineEnd,
        side: annotation.side === 'new' ? 'additions' : 'deletions',
      },
    });
  }, [visibleBounds]);

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

  useDismissOnOutsideAndEscape({
    enabled: !!toolbarState && !showCommentModal,
    ref: toolbarRef,
    onDismiss: handleDismiss,
  });

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
      setImages(draft.images);
      setEditingAnnotationId(null);
      setShowCommentModal(false);
      setToolbarState({
        position: draft.position,
        range: draft.range,
        tokenSelection: draft.tokenSelection,
      });
      currentDraftKeyRef.current = key;
      restoreDraftKeyByFilePath.delete(filePath);

      onLineSelection(draft.range);
    }
  }, [filePath, isFocused, onLineSelection]);

  // Handle single token click — opens toolbar for one token
  const handleTokenClick = useCallback((props: DiffTokenEventBaseProps, event: MouseEvent) => {
    const clickedToken: TokenMeta = {
      lineNumber: props.lineNumber,
      charStart: props.lineCharStart,
      charEnd: props.lineCharEnd,
      tokenText: props.tokenText,
      side: props.side,
    };

    // Same token clicked twice → deselect
    const anchor = tokenAnchorRef.current;
    if (anchor && anchor.lineNumber === clickedToken.lineNumber
      && anchor.charStart === clickedToken.charStart
      && anchor.side === clickedToken.side) {
      tokenAnchorRef.current = null;
      setToolbarState(null);
      onLineSelection(null);
      return;
    }

    tokenAnchorRef.current = clickedToken;
    openToolbar(
      { start: clickedToken.lineNumber, end: clickedToken.lineNumber, side: clickedToken.side },
      { top: event.clientY + 10, left: event.clientX },
      { anchor: clickedToken, fullText: clickedToken.tokenText },
    );
  }, [onLineSelection, openToolbar]);

  return {
    // State
    toolbarState,
    commentText,
    setCommentText,
    showCommentModal,
    setShowCommentModal,
    modalLayout,
    setModalLayout,
    editingAnnotationId,
    images,
    setImages,
    // Refs
    toolbarRef,
    // Handlers
    handleMouseMove,
    handleLineSelectionEnd,
    openLineAnnotation,
    handleTokenClick,
    handleSubmitAnnotation,
    handleDismiss,
    handleCancel,
    startEdit,
  };
}
