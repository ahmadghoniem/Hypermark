import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo } from 'react';
import type {
  CodeAnnotation,
  CodeAnnotationType,
  ConventionalDecoration,
  ConventionalLabel,
  ImageAttachment,
  SelectedLineRange,
  TokenAnnotationMeta,
} from '@hypermark/ui/types';
import type { DiffTokenEventBaseProps } from '@pierre/diffs';
import { useConfigValue } from '@hypermark/ui/config';
import { useAttachmentUploads } from '@hypermark/ui/hooks/useAttachmentUploads';
import { useAnnotationToolbar } from '../hooks/useAnnotationToolbar';
import { AnnotationToolbar } from './AnnotationToolbar';
import { SuggestionModal } from './SuggestionModal';
import { ExpandedCommentDialog } from './ExpandedCommentDialog';
import { getEnabledLabels } from './ConventionalLabelPicker';
import { formatLineRange, formatTokenContext } from '../utils/formatLineRange';

export interface ToolbarHostHandle {
  handleLineSelectionEnd: (range: SelectedLineRange | null) => void;
  openLineAnnotation: (range: SelectedLineRange) => void;
  handleTokenClick: (props: DiffTokenEventBaseProps, event: MouseEvent) => void;
  startEdit: (annotation: CodeAnnotation) => void;
}

interface ToolbarHostProps {
  patch: string;
  filePath: string;
  isFocused: boolean;
  onLineSelection: (range: SelectedLineRange | null) => void;
  onAddAnnotation: (
    type: CodeAnnotationType,
    text?: string,
    suggestedCode?: string,
    originalCode?: string,
    conventionalLabel?: ConventionalLabel,
    decorations?: ConventionalDecoration[],
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[],
  ) => void;
  onEditAnnotation: (
    id: string,
    text?: string,
    suggestedCode?: string,
    originalCode?: string,
    conventionalLabel?: ConventionalLabel | null,
    decorations?: ConventionalDecoration[],
    images?: ImageAttachment[],
  ) => void;
}

/**
 * Owns `useAnnotationToolbar` so per-keystroke state changes don't re-render
 * the parent diff list. Parents talk to it through the imperative handle.
 */
export const ToolbarHost = forwardRef<ToolbarHostHandle, ToolbarHostProps>(function ToolbarHost(
  {
    patch,
    filePath,
    isFocused,
    onLineSelection,
    onAddAnnotation,
    onEditAnnotation,
  },
  ref,
) {
  const toolbar = useAnnotationToolbar({
    patch,
    filePath,
    isFocused,
    onLineSelection,
    onAddAnnotation,
    onEditAnnotation,
  });

  // Spec 05 §3.2: the composer owns its attachments. Owned here (not inside
  // AnnotationToolbar/ExpandedCommentDialog) so in-flight uploads survive the
  // expand/collapse switch between those two composer surfaces for the same draft.
  const addImage = useCallback((image: ImageAttachment) => {
    toolbar.setImages((prev) => [...prev, image]);
  }, [toolbar.setImages]);
  const removeImage = useCallback((path: string) => {
    toolbar.setImages((prev) => prev.filter((i) => i.path !== path));
  }, [toolbar.setImages]);
  const uploads = useAttachmentUploads({ images: toolbar.images, onAdd: addImage });

  const conventionalCommentsEnabled = useConfigValue('conventionalComments');
  const conventionalLabelsJson = useConfigValue('conventionalLabels');
  const enabledLabels = useMemo(() => getEnabledLabels(conventionalLabelsJson), [conventionalLabelsJson]);

  // Replaces the parent's `onMouseMove={toolbar.handleMouseMove}` on its scroll
  // container — the hook only stashes clientX/Y for toolbar placement, so a
  // window-level listener is functionally equivalent for that purpose.
  const handleMouseMove = toolbar.handleMouseMove;
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  useImperativeHandle(
    ref,
    () => ({
      handleLineSelectionEnd: toolbar.handleLineSelectionEnd,
      openLineAnnotation: toolbar.openLineAnnotation,
      handleTokenClick: toolbar.handleTokenClick,
      startEdit: toolbar.startEdit,
    }),
    [toolbar.handleLineSelectionEnd, toolbar.openLineAnnotation, toolbar.handleTokenClick, toolbar.startEdit],
  );

  const handleCloseCodeModal = useCallback(() => toolbar.setShowCodeModal(false), [toolbar.setShowCodeModal]);
  const handleCollapseCommentModal = useCallback(() => {
    if (toolbar.expandedComposerRequired) {
      toolbar.handleDismiss();
      return;
    }
    toolbar.setShowCommentModal(false);
  }, [toolbar.expandedComposerRequired, toolbar.handleDismiss, toolbar.setShowCommentModal]);
  const handleCancelCommentModal = useCallback(() => {
    toolbar.setShowCommentModal(false);
    toolbar.handleCancel();
  }, [toolbar.handleCancel, toolbar.setShowCommentModal]);
  const handleEditSuggestion = useCallback(() => {
    if (!toolbar.suggestedCode && toolbar.selectedOriginalCode) {
      toolbar.setSuggestedCode(toolbar.selectedOriginalCode);
    }
    toolbar.setShowCommentModal(false);
    toolbar.setShowCodeModal(true);
  }, [
    toolbar.selectedOriginalCode,
    toolbar.setShowCodeModal,
    toolbar.setShowCommentModal,
    toolbar.setSuggestedCode,
    toolbar.suggestedCode,
  ]);
  const expandedCommentTitle = useMemo(() => {
    const toolbarState = toolbar.toolbarState;
    if (!toolbarState) return 'Comment';
    if (toolbar.editingAnnotationId) return 'Edit annotation';
    if (toolbarState.tokenSelection) return formatTokenContext(toolbarState.tokenSelection);
    return formatLineRange(toolbarState.range.start, toolbarState.range.end);
  }, [toolbar.editingAnnotationId, toolbar.toolbarState]);

  const canSubmitAnnotation = toolbar.commentText.trim().length > 0 || toolbar.suggestedCode.trim().length > 0 || toolbar.images.length > 0;

  return (
    <>
      {toolbar.toolbarState && !toolbar.showCodeModal && !toolbar.showCommentModal && (
        <AnnotationToolbar
          toolbarState={toolbar.toolbarState}
          toolbarRef={toolbar.toolbarRef}
          commentText={toolbar.commentText}
          setCommentText={toolbar.setCommentText}
          suggestedCode={toolbar.suggestedCode}
          setSuggestedCode={toolbar.setSuggestedCode}
          showSuggestedCode={toolbar.showSuggestedCode}
          setShowSuggestedCode={toolbar.setShowSuggestedCode}
          selectedOriginalCode={toolbar.selectedOriginalCode}
          setShowCodeModal={toolbar.setShowCodeModal}
          setShowCommentModal={toolbar.setShowCommentModal}
          isEditing={!!toolbar.editingAnnotationId}
          onSubmit={toolbar.handleSubmitAnnotation}
          onDismiss={toolbar.handleDismiss}
          onCancel={toolbar.handleCancel}
          conventionalCommentsEnabled={conventionalCommentsEnabled}
          conventionalLabel={toolbar.conventionalLabel}
          onConventionalLabelChange={toolbar.setConventionalLabel}
          decorations={toolbar.decorations}
          onDecorationsChange={toolbar.setDecorations}
          enabledLabels={enabledLabels}
          images={toolbar.images}
          pendingAttachments={uploads.pending}
          onAddImage={addImage}
          onRemoveImage={removeImage}
          onRemovePendingAttachment={uploads.removePending}
          onRetryPendingAttachment={uploads.retry}
          onAttachFiles={uploads.attachFiles}
        />
      )}

      {toolbar.toolbarState && toolbar.showCommentModal && (
        <ExpandedCommentDialog
          title={expandedCommentTitle}
          commentText={toolbar.commentText}
          setCommentText={toolbar.setCommentText}
          isEditing={!!toolbar.editingAnnotationId}
          canSubmit={canSubmitAnnotation}
          onSubmit={toolbar.handleSubmitAnnotation}
          onCollapse={handleCollapseCommentModal}
          onCancel={handleCancelCommentModal}
          autoFocus={!toolbar.expandedComposerRequired}
          collapsible={!toolbar.expandedComposerRequired}
          onEditSuggestion={toolbar.expandedComposerRequired ? handleEditSuggestion : undefined}
          hasSuggestedCode={toolbar.suggestedCode.trim().length > 0}
          images={toolbar.images}
          pendingAttachments={uploads.pending}
          onAddImage={addImage}
          onRemoveImage={removeImage}
          onRemovePendingAttachment={uploads.removePending}
          onRetryPendingAttachment={uploads.retry}
          onAttachFiles={uploads.attachFiles}
        />
      )}

      {toolbar.showCodeModal && (
        <SuggestionModal
          filePath={filePath}
          toolbarState={toolbar.toolbarState}
          selectedOriginalCode={toolbar.selectedOriginalCode}
          suggestedCode={toolbar.suggestedCode}
          setSuggestedCode={toolbar.setSuggestedCode}
          modalLayout={toolbar.modalLayout}
          setModalLayout={toolbar.setModalLayout}
          onClose={handleCloseCodeModal}
        />
      )}
    </>
  );
});
