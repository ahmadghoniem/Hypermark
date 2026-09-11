import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ToolbarState } from '../hooks/useAnnotationToolbar';
import { formatLineRange, formatTokenContext } from '../utils/formatLineRange';
import type { ImageAttachment } from '@hypermark/ui/types';
import { useDraggable } from '@hypermark/ui/hooks/useDraggable';
import {
  hasPrimaryCoarsePointer,
  useVisibleViewportBounds,
} from '@hypermark/ui/hooks/useViewportEnvironment';
import { AttachmentStrip, type PendingAttachment } from '@hypermark/ui/components/AttachmentStrip';
import { AttachmentsButton } from '@hypermark/ui/components/AttachmentsButton';
import { imageFilesFrom } from '@hypermark/ui/hooks/useAttachmentUploads';

interface AnnotationToolbarProps {
  toolbarState: ToolbarState;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  commentText: string;
  setCommentText: (text: string) => void;
  isEditing?: boolean;
  setShowCommentModal: (show: boolean) => void;
  onSubmit: () => void;
  onDismiss: () => void;
  onCancel: () => void;
  // Spec 05 §3.2: comment-owned image attachments, owned by ToolbarHost so
  // in-flight uploads survive the collapse/expand switch to ExpandedCommentDialog.
  images: ImageAttachment[];
  pendingAttachments: readonly PendingAttachment[];
  onAddImage: (image: ImageAttachment) => void;
  onRemoveImage: (path: string) => void;
  onRemovePendingAttachment: (id: string) => void;
  onRetryPendingAttachment: (id: string) => void;
  onAttachFiles: (files: Iterable<File> | FileList | null | undefined) => void;
}

// The 338px border box contains the 320px composer, padding, and border.
const TOOLBAR_MAX_WIDTH = 338;

/** Floating comment input form that appears after line selection */
export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  toolbarState,
  toolbarRef,
  commentText,
  setCommentText,
  isEditing = false,
  setShowCommentModal,
  onSubmit,
  onDismiss,
  onCancel,
  images,
  pendingAttachments,
  onAddImage,
  onRemoveImage,
  onRemovePendingAttachment,
  onRetryPendingAttachment,
  onAttachFiles,
}) => {
  const coarsePointer = hasPrimaryCoarsePointer();
  const visibleBounds = useVisibleViewportBounds(coarsePointer ? 16 : 0);
  const toolbarWidth = Math.min(TOOLBAR_MAX_WIDTH, visibleBounds.width);
  const horizontalInset = toolbarWidth / 2;
  const { dragPosition, dragHandleProps, wasDragged, reset: resetDrag } = useDraggable(toolbarRef);

  // Paste anywhere in this open composer attaches to this comment (spec 05 §3.2.5).
  // Capture phase + stopPropagation keeps any document-level paste handler from
  // also processing the same event.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null;
      if (!target || !toolbarRef.current?.contains(target)) return;
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      onAttachFiles(files);
    };
    document.addEventListener('paste', handlePaste, true);
    return () => document.removeEventListener('paste', handlePaste, true);
  }, [onAttachFiles, toolbarRef]);

  const handleComposerDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  }, []);
  const handleComposerDrop = useCallback((e: React.DragEvent) => {
    const files = imageFilesFrom(e.dataTransfer);
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    onAttachFiles(files);
  }, [onAttachFiles]);

  const focusAttachAction = useCallback(() => {
    toolbarRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Attachments"]')
      ?.focus();
  }, [toolbarRef]);

  // Reset drag when toolbar reopens for a new selection
  useEffect(() => {
    resetDrag();
  }, [toolbarState.range.start, toolbarState.range.end, toolbarState.range.side, resetDrag]);

  const content = (
    <div
      ref={toolbarRef}
      className="review-toolbar"
      style={dragPosition
        ? {
            position: 'fixed',
            top: dragPosition.top,
            left: dragPosition.left,
            width: toolbarWidth,
            boxSizing: 'border-box',
            zIndex: 1000,
            maxHeight: visibleBounds.height,
            overflowY: 'auto',
          }
        : {
            position: 'fixed',
            top: Math.max(
              visibleBounds.top,
              Math.min(toolbarState.position.top, visibleBounds.bottom - 200),
            ),
            left: Math.max(
              visibleBounds.left + horizontalInset,
              Math.min(
                toolbarState.position.left,
                visibleBounds.right - horizontalInset,
              ),
            ),
            transform: 'translateX(-50%)',
            width: toolbarWidth,
            boxSizing: 'border-box',
            zIndex: 1000,
            maxHeight: visibleBounds.height,
            overflowY: 'auto',
          }
      }
    >
      <div
          className="w-80 max-w-full flex flex-col"
          style={{ width: Math.min(320, visibleBounds.width) }}
        >
          <div className="flex items-center justify-between mb-2" {...dragHandleProps}>
            <span className="text-xs text-muted-foreground">
              {isEditing
                ? 'Edit annotation'
                : toolbarState.tokenSelection
                  ? formatTokenContext(toolbarState.tokenSelection)
                  : formatLineRange(toolbarState.range.start, toolbarState.range.end)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCommentModal(true)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Expand comment"
                aria-label="Expand comment"
              >
                <ExpandIcon />
              </button>
              <button
                onClick={onCancel}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Cancel"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div onDragOver={handleComposerDragOver} onDrop={handleComposerDrop}>
            <textarea
              data-pn-mobile-editable="true"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Leave feedback..."
              className="w-full min-h-[4.5rem] max-h-[calc(var(--pn-viewport-height,100vh)-16rem)] px-3 py-2 bg-muted rounded-lg text-xs leading-6 resize-y border-0 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
              rows={3}
              autoFocus={!coarsePointer}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  onDismiss();
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                  onSubmit();
                }
              }}
            />
            {/* Spec 05 §3.2.1: attachments live inside the composer, directly
                under the text and above the action row — never a floating card
                or footer-only preview. */}
            <AttachmentStrip
              images={images}
              pending={pendingAttachments}
              onRemove={onRemoveImage}
              onRemovePending={onRemovePendingAttachment}
              onRetryPending={onRetryPendingAttachment}
              onFocusAfterLastRemoved={focusAttachAction}
              className="mt-2"
            />
          </div>

          <div className="flex items-center gap-2 mt-3">
            <AttachmentsButton
              images={images}
              onAdd={onAddImage}
              onRemove={onRemoveImage}
              variant="inline"
            />
            {/* Add Comment button — right side */}
            <button
              onClick={onSubmit}
              disabled={!commentText.trim() && images.length === 0}
              className="review-toolbar-btn primary disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              {isEditing ? 'Update' : 'Add Comment'}
            </button>
          </div>
        </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
};

const ExpandIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
  </svg>
);
