import React, { forwardRef, useImperativeHandle } from 'react';
import type {
  CodeAnnotation,
  CodeAnnotationType,
  ImageAttachment,
  SelectedLineRange,
  TokenAnnotationMeta,
} from '@hypermark/ui/types';
import type { DiffTokenEventBaseProps } from '@pierre/diffs';
import { CommentPopover } from '@hypermark/ui/components/CommentPopover';
import { useAnnotationToolbar } from '../hooks/useAnnotationToolbar';
import { formatLineRange, formatTokenContext } from '../utils/formatLineRange';

export interface ToolbarHostHandle {
  handleLineSelectionEnd: (range: SelectedLineRange | null, anchorRect?: DOMRect) => void;
  openLineAnnotation: (range: SelectedLineRange, anchorRect?: DOMRect) => void;
  handleTokenClick: (props: DiffTokenEventBaseProps, event: MouseEvent) => void;
  startEdit: (annotation: CodeAnnotation, anchorRect?: DOMRect) => void;
}

interface ToolbarHostProps {
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

/**
 * Owns `useAnnotationToolbar` so per-keystroke state changes don't re-render
 * the parent diff list. Parents talk to it through the imperative handle.
 */
export const ToolbarHost = forwardRef<ToolbarHostHandle, ToolbarHostProps>(function ToolbarHost(
  {
    filePath,
    isFocused,
    onLineSelection,
    onAddAnnotation,
    onEditAnnotation,
  },
  ref,
) {
  const toolbar = useAnnotationToolbar({
    filePath,
    isFocused,
    onLineSelection,
    onAddAnnotation,
    onEditAnnotation,
  });

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

  return (
    <>
      {toolbar.toolbarState && (
        <CommentPopover
          anchorRect={toolbar.toolbarState.anchorRect}
          contextText={
            toolbar.editingAnnotationId
              ? 'Edit annotation'
              : toolbar.toolbarState.tokenSelection
                ? formatTokenContext(toolbar.toolbarState.tokenSelection)
                : formatLineRange(toolbar.toolbarState.range.start, toolbar.toolbarState.range.end)
          }
          isGlobal={false}
          initialText={toolbar.commentText}
          initialImages={toolbar.editingImages}
          onSubmit={(text, images) => toolbar.submit(text, images)}
          onClose={toolbar.handleCancel}
          draftKey={
            toolbar.editingAnnotationId
              ? `edit:${toolbar.editingAnnotationId}`
              : `line:${filePath}:${toolbar.toolbarState.range.start}-${toolbar.toolbarState.range.end}`
          }
          allowImages
        />
      )}
    </>
  );
});
