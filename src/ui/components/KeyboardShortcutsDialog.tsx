import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ShortcutSurfaceMode } from '../shortcuts';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { OverlayScrollArea } from './OverlayScrollArea';
import { ShortcutsIcon } from './icons/headerIcons';

import { XClose } from '@untitledui/icons';
export interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ShortcutSurfaceMode;
}

export const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  isOpen,
  onClose,
  mode,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-popover flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hypermark-shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 id="hypermark-shortcuts-title" className="font-semibold text-body">Keyboard Shortcuts</h3>
          <button
            type="button"
            aria-label="Close shortcuts"
            onClick={onClose}
            className="p-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            <XClose className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        <OverlayScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            <KeyboardShortcuts mode={mode} />
          </div>
        </OverlayScrollArea>
      </div>
    </div>,
    document.body
  );
};

export const KeyboardShortcutsButton: React.FC<{
  mode: ShortcutSurfaceMode;
}> = ({ mode }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
      >
        <ShortcutsIcon className="size-4" />
      </button>

      <KeyboardShortcutsDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode={mode}
      />
    </>
  );
};
