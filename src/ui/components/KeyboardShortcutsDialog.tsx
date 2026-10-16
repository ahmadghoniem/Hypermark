import React, { useState } from 'react';
import { XClose } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/fluid/components/dialog';
import { ScrollArea } from '@/ui/fluid/components/scroll-area';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import type { ShortcutSurfaceMode } from '../shortcuts';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { ShortcutsIcon } from './icons/headerIcons';

export interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ShortcutSurfaceMode;
}

export const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  isOpen,
  onClose,
  mode,
}) => (
  <Dialog
    open={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <DialogContent
      size="lg"
      showCloseButton={false}
      aria-labelledby="hypermark-shortcuts-title"
      className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0"
      onKeyDown={(event) => {
        // Escape closes only this dialog, not whatever listens on the window.
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
        <DialogTitle id="hypermark-shortcuts-title" className="text-body">
          Keyboard Shortcuts
        </DialogTitle>
        <DialogClose
          render={
            <Button variant="ghost" size="icon-compact" aria-label="Close shortcuts">
              <XClose />
            </Button>
          }
        />
      </div>

      {/* The popup only has a max height, so the viewport takes the rest of
          it (85vh less the 61px header) instead of a percentage. */}
      <ScrollArea className="min-h-0" viewportClassName="h-auto! max-h-[calc(85vh-61px)] [&>div[style]]:block!">
        <div className="space-y-4 p-4">
          <KeyboardShortcuts mode={mode} />
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

export const KeyboardShortcutsButton: React.FC<{
  mode: ShortcutSurfaceMode;
}> = ({ mode }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Tooltip content="Keyboard shortcuts" side="bottom">
        <Button
          variant="ghost"
          size="icon-compact"
          onClick={() => setIsOpen(true)}
          aria-label="Keyboard shortcuts"
        >
          <ShortcutsIcon className="size-4" />
        </Button>
      </Tooltip>

      <KeyboardShortcutsDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode={mode}
      />
    </>
  );
};
