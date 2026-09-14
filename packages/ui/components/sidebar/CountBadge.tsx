import React from "react";

/** Compact annotation count badge for sidebar file trees and TOC */
export const CountBadge: React.FC<{ count: number; active?: boolean; className?: string }> = ({ count, active, className }) => (
  <span
    className={`shrink-0 min-w-4.5 h-4.5 px-1 rounded-sm flex items-center justify-center text-3xs font-mono leading-none ${
      active ? 'text-primary bg-primary/15' : 'text-muted-foreground bg-muted/70'
    } ${className ?? ''}`}
  >
    {count}
  </span>
);
