import React, { useCallback, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useReviewAnnotationToolbarShortcuts } from '@plannotator/ui/shortcuts';
import type { ImageAttachment } from '@plannotator/ui/types';
import { AttachmentStrip, type PendingAttachment } from '@plannotator/ui/components/AttachmentStrip';
import { AttachmentsButton } from '@plannotator/ui/components/AttachmentsButton';
import { imageFilesFrom } from '@plannotator/ui/hooks/useAttachmentUploads';

interface ExpandedCommentDialogProps {
  title: string;
  commentText: string;
  setCommentText: (text: string) => void;
  isEditing: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCollapse: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
  collapsible?: boolean;
  onEditSuggestion?: () => void;
  hasSuggestedCode?: boolean;
  // Spec 05 §3.2: comment-owned image attachments, owned by ToolbarHost so
  // in-flight uploads survive the collapse/expand switch to AnnotationToolbar.
  images: ImageAttachment[];
  pendingAttachments: readonly PendingAttachment[];
  onAddImage: (image: ImageAttachment) => void;
  onRemoveImage: (path: string) => void;
  onRemovePendingAttachment: (id: string) => void;
  onRetryPendingAttachment: (id: string) => void;
  onAttachFiles: (files: Iterable<File> | FileList | null | undefined) => void;
}

export const ExpandedCommentDialog: React.FC<ExpandedCommentDialogProps> = ({
  title,
  commentText,
  setCommentText,
  isEditing,
  canSubmit,
  onSubmit,
  onCollapse,
  onCancel,
  autoFocus = true,
  collapsible = true,
  onEditSuggestion,
  hasSuggestedCode = false,
  images,
  pendingAttachments,
  onAddImage,
  onRemoveImage,
  onRemovePendingAttachment,
  onRetryPendingAttachment,
  onAttachFiles,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submitLabel = isEditing ? 'Update' : 'Add Comment';

  // Paste anywhere in this open composer attaches to this comment (spec 05 §3.2.5).
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null;
      if (!target || !dialogRef.current?.contains(target)) return;
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      onAttachFiles(files);
    };
    document.addEventListener('paste', handlePaste, true);
    return () => document.removeEventListener('paste', handlePaste, true);
  }, [onAttachFiles]);

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
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Attachments"]')
      ?.focus();
  }, []);

  useReviewAnnotationToolbarShortcuts({
    target: 'document',
    handlers: {
      submitComment: {
        when: (event) => canSubmit && !event.isComposing && event.target instanceof Node && !!dialogRef.current?.contains(event.target),
        handle: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        },
      },
      cancel: {
        when: (event) => event.target instanceof Node && !!dialogRef.current?.contains(event.target),
        handle: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onCollapse();
        },
      },
    },
  });

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCollapse();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1999] bg-background/80 backdrop-blur-sm" />
        <div className="pn-visible-viewport-overlay z-[2000] pointer-events-none flex items-center justify-center">
          <Dialog.Popup
            ref={dialogRef}
            aria-modal="true"
            initialFocus={autoFocus
              ? () => {
                  const textarea = textareaRef.current;
                  if (textarea) {
                    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                  }
                  return textarea;
                }
              : false
            }
            finalFocus={false}
            className="pn-responsive-composer-dialog pn-review-composer-dialog relative pointer-events-auto overflow-hidden bg-popover border border-border rounded-xl shadow-2xl flex flex-col"
          >
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/50">
            <Dialog.Title className="text-xs font-normal text-muted-foreground truncate">{title}</Dialog.Title>
            <div className="flex items-center gap-1">
              {collapsible && (
                <button
                  type="button"
                  onClick={onCollapse}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Collapse"
                  aria-label="Collapse expanded comment"
                >
                  <CollapseIcon />
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
                aria-label="Close expanded comment"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div
            className="px-4 py-3 min-h-0 flex-1 flex flex-col"
            onDragOver={handleComposerDragOver}
            onDrop={handleComposerDrop}
          >
            <textarea
              data-pn-mobile-editable="true"
              ref={textareaRef}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Leave feedback..."
              className="w-full h-full min-h-0 max-h-full bg-muted text-sm leading-relaxed placeholder:text-muted-foreground resize-y focus:outline-none rounded-lg border-0 px-3 py-2"
            />
          </div>

          {/* Spec 05 §3.2.1: strip lives inside the composer, between the
              textarea and the action row — never a floating card or footer-only preview. */}
          <AttachmentStrip
            images={images}
            pending={pendingAttachments}
            onRemove={onRemoveImage}
            onRemovePending={onRemovePendingAttachment}
            onRetryPending={onRetryPendingAttachment}
            onFocusAfterLastRemoved={focusAttachAction}
            className="px-4 pb-3"
          />

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-3">
              <AttachmentsButton
                images={images}
                onAdd={onAddImage}
                onRemove={onRemoveImage}
                variant="inline"
              />
              {onEditSuggestion && (
                <button
                  type="button"
                  onClick={onEditSuggestion}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {hasSuggestedCode ? 'Edit suggestion' : 'Suggest code'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {collapsible && (
                <button
                  type="button"
                  onClick={onCollapse}
                  className="review-toolbar-btn"
                >
                  Collapse
                </button>
              )}
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="review-toolbar-btn primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitLabel}
              </button>
            </div>
          </div>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const CollapseIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
