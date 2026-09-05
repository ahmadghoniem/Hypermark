import React from 'react';
import { ContextMenu } from '@base-ui/react/context-menu';
import type { FileTreeNode as TreeNode } from '../utils/buildFileTree';
import { ViewedControl, ChangeTypeLetter, StagedDot, AnnotationBadge, DiffCounts, CommittedDot } from './FileRowBits';
import { copyTextToClipboard } from '@plannotator/ui/utils/clipboard';

interface FileTreeNodeProps {
  node: TreeNode;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  activeFileIndex: number;
  onSelectFile: (index: number) => void;
  onDoubleClickFile?: (index: number) => void;
  viewedFiles: Set<string>;
  onToggleViewed?: (filePath: string) => void;
  showViewedControls?: boolean;
  hideViewedFiles: boolean;
  getAnnotationCount: (filePath: string) => number;
  /** Read-side staged set from the server's status sidecar — display only. */
  stagedFiles: Set<string>;
  scrollHighlightIndex?: number;
  /** Absolute repo root used to build the "Copy full path" menu item. Null in PR-review mode (files aren't on local disk). */
  repoRoot?: string | null;
  /** Since-base mode extras: sidecar lookup for untracked (U) / staged (dot)
   * markers. Undefined outside since-base. */
  getSectionEntry?: (filePath: string) => { group: 'committed' | 'changes' | 'untracked'; staged: boolean } | undefined;
}

function hasVisibleChildren(
  node: TreeNode,
  viewedFiles: Set<string>,
  activeFileIndex: number,
  hideViewedFiles: boolean,
): boolean {
  if (!hideViewedFiles) return true;
  if (!node.children) return false;

  return node.children.some(child => {
    if (child.type === 'file') {
      return child.fileIndex === activeFileIndex || !viewedFiles.has(child.path);
    }
    return hasVisibleChildren(child, viewedFiles, activeFileIndex, hideViewedFiles);
  });
}

export const FileTreeNodeItem: React.FC<FileTreeNodeProps> = ({
  node,
  expandedFolders,
  onToggleFolder,
  activeFileIndex,
  onSelectFile,
  onDoubleClickFile,
  viewedFiles,
  onToggleViewed,
  showViewedControls = true,
  hideViewedFiles,
  getAnnotationCount,
  stagedFiles,
  scrollHighlightIndex,
  repoRoot,
  getSectionEntry,
}) => {
  const paddingLeft = 4 + node.depth * 8;

  if (node.type === 'folder') {
    if (!hasVisibleChildren(node, viewedFiles, activeFileIndex, hideViewedFiles)) {
      return null;
    }

    const isExpanded = expandedFolders.has(node.path);

    return (
      <>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-sm"
          style={{ paddingLeft }}
        >
          <svg
            className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="truncate">{node.name}</span>
          {(node.additions > 0 || node.deletions > 0) && (
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0 text-[10px]">
              {node.additions > 0 && (
                <span className="additions">+{node.additions}</span>
              )}
              {node.deletions > 0 && (
                <span className="deletions">-{node.deletions}</span>
              )}
            </div>
          )}
        </button>
        {isExpanded && node.children?.map(child => (
          <FileTreeNodeItem
            key={child.type === 'file' ? child.path : `folder:${child.path}`}
            node={child}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            activeFileIndex={activeFileIndex}
            onSelectFile={onSelectFile}
            onDoubleClickFile={onDoubleClickFile}
            viewedFiles={viewedFiles}
            onToggleViewed={onToggleViewed}
            showViewedControls={showViewedControls}
            hideViewedFiles={hideViewedFiles}
            getAnnotationCount={getAnnotationCount}
            stagedFiles={stagedFiles}
            scrollHighlightIndex={scrollHighlightIndex}
            repoRoot={repoRoot}
            getSectionEntry={getSectionEntry}
          />
        ))}
      </>
    );
  }

  // File node
  const isActive = node.fileIndex === activeFileIndex;
  const isScrollActive = !isActive && scrollHighlightIndex != null && node.fileIndex === scrollHighlightIndex;
  const isViewed = viewedFiles.has(node.path);
  const isStaged = stagedFiles.has(node.path);
  const annotationCount = getAnnotationCount(node.path);
  // Since-base mode: sidecar-driven markers (U for untracked, staged dot)
  // replace the legacy staged treatment for this row.
  const sectionEntry = getSectionEntry?.(node.path);
  const sinceBaseMode = getSectionEntry != null;
  const isUntracked = sectionEntry?.group === 'untracked';

  if (hideViewedFiles && isViewed && !isActive) {
    return null;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <button
            onClick={() => onSelectFile(node.fileIndex!)}
            onDoubleClick={() => onDoubleClickFile?.(node.fileIndex!)}
            className={`file-tree-item w-full text-left group ${isActive ? 'active' : isScrollActive ? 'scroll-active' : ''} ${annotationCount > 0 ? 'has-annotations' : ''} ${isStaged && !sinceBaseMode ? 'staged' : ''}`}
            style={{ paddingLeft }}
          />
        }
      >
          {/* Leading rail: [view][status][letter] then name — same anatomy as
              the sections view rows. View reveals on hover / when active; the
              status dot (since-base mode only) and letter are always shown.
              Name inherits the row font; letter/counts stay the small size. */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {showViewedControls && (
              <ViewedControl isViewed={isViewed} onToggle={onToggleViewed ? () => onToggleViewed(node.path) : undefined} forceVisible={isActive} />
            )}
            {sinceBaseMode && isStaged ? (
              <StagedDot />
            ) : sinceBaseMode && sectionEntry?.group === 'committed' ? (
              <CommittedDot />
            ) : sinceBaseMode ? (
              <span className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            ) : isStaged ? (
              <span className="text-[10px] text-primary font-medium flex items-center justify-center w-4 flex-shrink-0" title="Staged (git add)">+</span>
            ) : null}
            <ChangeTypeLetter status={node.file!.status} oldPath={node.file!.oldPath} untracked={isUntracked} />
            <span className="truncate">{node.name}</span>
            <AnnotationBadge count={annotationCount} />
          </div>
          <DiffCounts additions={node.file!.additions} deletions={node.file!.deletions} />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50">
          <ContextMenu.Popup className="min-w-[160px] bg-popover text-popover-foreground border border-border rounded shadow-lg overflow-hidden py-1 transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0">
          <ContextMenu.Item
            onClick={() => { void copyTextToClipboard(node.path); }}
            className="flex items-center gap-2 mx-1 px-2 py-1.5 text-xs rounded cursor-pointer outline-none text-foreground/80 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
          >
            Copy path
          </ContextMenu.Item>
          <ContextMenu.Item
            onClick={() => { void copyTextToClipboard(node.name); }}
            className="flex items-center gap-2 mx-1 px-2 py-1.5 text-xs rounded cursor-pointer outline-none text-foreground/80 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
          >
            Copy filename
          </ContextMenu.Item>
          {repoRoot && (
            <ContextMenu.Item
              onClick={() => { void copyTextToClipboard(`${repoRoot.replace(/\/$/, '')}/${node.path}`); }}
              className="flex items-center gap-2 mx-1 px-2 py-1.5 text-xs rounded cursor-pointer outline-none text-foreground/80 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
            >
              Copy full path
            </ContextMenu.Item>
          )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};
