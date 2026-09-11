import React, { useState } from 'react';
import { Copy, DotsThree } from '@phosphor-icons/react';
import { copyTextToClipboard } from '../utils/clipboard';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

/**
 * FileActionsButton — the `⋯` overflow holding a file's copy actions.
 *
 * This is what is left of the old OpenInAppButton after open-in-app was
 * removed. That control was a split button: launch the file in a detected
 * editor / terminal / file manager, with the copy actions tucked into the same
 * dropdown. The launching half is gone — along with the app catalog, the two
 * server endpoints that detected and spawned them, and 115 KB of base64 brand
 * icons that shipped into all three single-file bundles — but Copy path and
 * Copy file diff were never part of that feature and still earn their place.
 *
 * Renders nothing when there is nothing to copy.
 */

interface FileActionsButtonProps {
  filePath: string | null | undefined;
  /** Diff/patch text for "Copy file diff" (review only). */
  diffText?: string | null;
  disabled?: boolean;
}

export const FileActionsButton: React.FC<FileActionsButtonProps> = ({
  filePath,
  diffText,
  disabled = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!filePath && !diffText) return null;

  const copyText = async (text: string) => {
    await copyTextToClipboard(text);
    setMenuOpen(false);
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className="text-xs flex items-center px-1.5 py-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            title="File actions"
            aria-label="File actions"
          />
        }
      >
        <DotsThree className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[12rem]"
        // Don't snap focus (and its focus ring) back onto the trigger when the
        // menu closes — that left-edge bar reads as a stray artifact.
        finalFocus={false}
      >
        {filePath && (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => void copyText(filePath)}
            className="text-xs"
          >
            <Copy className="w-4 h-4" />
            <span className="flex-1">Copy path</span>
          </DropdownMenuItem>
        )}
        {diffText && (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => void copyText(diffText)}
            className="text-xs"
          >
            <Copy className="w-4 h-4" />
            <span className="flex-1">Copy file diff</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
