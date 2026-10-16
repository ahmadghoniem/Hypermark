/**
 * Reusable confirmation dialog component
 */

import React, { useEffect, useId } from 'react';
import { AlertTriangle, MessageTextSquare01 } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { Dialog, DialogContent, DialogTitle } from '@/ui/fluid/components/dialog';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: React.ReactNode;
  subMessage?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'info' | 'warning';
  showCancel?: boolean;
  wide?: boolean;
}

const ICON_COLORS = {
  info: 'bg-accent/20 text-accent',
  warning: 'bg-warning/20 text-warning',
};

const ICONS = {
  info: <MessageTextSquare01 className="size-5" />,
  warning: <AlertTriangle className="size-5" />,
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  subMessage,
  confirmText = 'Got it',
  cancelText = 'Cancel',
  variant = 'info',
  showCancel = false,
  wide = false,
}) => {
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        if (onConfirm) onConfirm();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onConfirm, onClose]);

  return (
    <Dialog
      open={isOpen}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Focus starts on the first button in the DOM: Cancel when it is
          shown, otherwise the confirm button. */}
      <DialogContent
        showCloseButton={false}
        aria-describedby={descriptionId}
        className={wide ? 'max-w-md' : undefined}
        data-hypermark-confirm-dialog="true"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`size-10 shrink-0 rounded-full flex items-center justify-center ${ICON_COLORS[variant]}`}>
            {ICONS[variant]}
          </div>
          <DialogTitle>{title}</DialogTitle>
        </div>
        <div id={descriptionId}>
          <div className="text-body text-muted-foreground mb-2">
            {message}
          </div>
          {subMessage && (
            <div className="text-caption text-muted-foreground mb-6">
              {subMessage}
            </div>
          )}
          {!subMessage && <div className="mb-4" />}
        </div>
        <div className="flex justify-end gap-2">
          {showCancel && (
            <Button variant="secondary" onClick={onClose}>
              {cancelText}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => {
              if (onConfirm) {
                onConfirm();
              } else {
                onClose();
              }
            }}
          >
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
