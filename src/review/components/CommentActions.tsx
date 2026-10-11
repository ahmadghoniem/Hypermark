import React from 'react';
import { CopyButton } from './CopyButton';

import { Edit05, XClose } from '@untitledui/icons';
interface CommentActionsProps {
  /** When provided, shows the edit button (left-most). */
  onEdit?: () => void;
  /** When provided, shows the copy button (middle). */
  copyText?: string;
  /** When provided, shows the delete/close button (right-most). */
  onDelete?: () => void;
}

const ACTION_BTN = 'p-1 rounded-sm text-muted-foreground transition-colors';

/**
 * The single hover-revealed action row shared by every comment card (inline
 * diff, sidebar, file banner). Bottom-aligned, right-justified, order
 * left→right: edit · copy · delete (so the close/delete sits furthest right).
 * The parent card must carry the Tailwind `group` class for the hover reveal.
 */
export const CommentActions: React.FC<CommentActionsProps> = ({ onEdit, copyText, onDelete }) => {
  if (!onEdit && !copyText && !onDelete) return null;
  return (
  <div
    className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
    onClick={(e) => e.stopPropagation()}
  >
    {onEdit && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className={`${ACTION_BTN} hover:bg-muted hover:text-foreground`}
        title="Edit"
      >
        <Edit05 className="size-3" />
      </button>
    )}
    {copyText && <CopyButton text={copyText} variant="inline" />}
    {onDelete && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className={`${ACTION_BTN} hover:bg-destructive/10 hover:text-destructive`}
        title="Delete"
      >
        <XClose className="size-3" />
      </button>
    )}
  </div>
  );
};
