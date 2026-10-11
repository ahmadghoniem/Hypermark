import React from 'react';

import { LayersTwo01 } from '@untitledui/icons';
/**
 * Nav rows shared by the left panel's two views (FileTree, SectionsPanel).
 * One source so the rows render identically — same order, same icons, same
 * counts — in both views.
 */

/** Shell for the panel action rows. */
function SidebarActionRow({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-caption transition-colors mb-0.5 ${
        active
          ? 'bg-primary/15 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}


export function AllFilesRow({
  active,
  onClick,
  additions,
  deletions,
  afterLabel,
}: {
  active: boolean;
  onClick: () => void;
  additions: number;
  deletions: number;
  /** Optional control rendered right after the label (e.g. the tree view's
   * expand/collapse-all-folders toggle). */
  afterLabel?: React.ReactNode;
}) {
  return (
    <SidebarActionRow active={active} onClick={onClick}>
      <LayersTwo01 className="size-3.5 shrink-0" />
      <span>All files</span>
      {afterLabel}
      <span className="ml-auto text-micro tabular-nums opacity-60">
        <span className="text-success">+{additions}</span>{' '}
        <span className="text-destructive">-{deletions}</span>
      </span>
    </SidebarActionRow>
  );
}
