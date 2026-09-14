import React from 'react';
import { formatRelativeTime } from '../utils/formatRelativeTime';

interface CommentMetaProps {
  /** Surface-specific leading element(s): severity dot, scope/file/line badge,
   *  collapse toggle, etc. Rendered first in the left cluster. */
  leading?: React.ReactNode;
  author?: string;
  createdAt?: number;
}

/**
 * The single identity row shared by every comment surface — the inline diff
 * card, the sidebar list, and the file-comment banner. Left cluster: leading
 * badge(s) → author. Right: relative time, then any surface-specific actions.
 * Centralizing it keeps author + timestamp styling identical everywhere (they
 * used to be hand-rolled three different ways).
 *
 * Every author renders the same. The row used to dim the current user's name
 * and append "(me)" — a distinction that only meant something when several
 * people annotated one document, which this fork no longer does.
 */
export const CommentMeta: React.FC<CommentMetaProps> = ({
  leading,
  author,
  createdAt,
}) => (
  <div className="review-comment-header">
    <div className="flex min-w-0 items-center gap-1.5">
      {leading}
      {author && (
        <span className="text-[10px] truncate max-w-30 text-muted-foreground/70">
          {author}
        </span>
      )}
    </div>
    {createdAt != null && (
      <span className="ml-auto flex-none text-[10px] text-muted-foreground/50">
        {formatRelativeTime(createdAt)}
      </span>
    )}
  </div>
);
