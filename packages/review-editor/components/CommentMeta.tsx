import React from 'react';
import { formatRelativeTime } from '../utils/formatRelativeTime';

interface CommentMetaProps {
  /** Surface-specific leading element(s): severity dot, scope/file/line badge,
   *  collapse toggle, etc. Rendered first in the left cluster. */
  leading?: React.ReactNode;
  createdAt?: number;
}

/**
 * The single meta row shared by every comment surface — the inline diff
 * card, the sidebar list, and the file-comment banner. Left cluster: leading
 * badge(s). Right: relative time, then any surface-specific actions.
 * Centralizing it keeps timestamp styling identical everywhere (it used to be
 * hand-rolled three different ways).
 */
export const CommentMeta: React.FC<CommentMetaProps> = ({
  leading,
  createdAt,
}) => (
  <div className="review-comment-header">
    <div className="flex min-w-0 items-center gap-1.5">
      {leading}
    </div>
    {createdAt != null && (
      <span className="ml-auto flex-none text-3xs text-muted-foreground/50">
        {formatRelativeTime(createdAt)}
      </span>
    )}
  </div>
);
