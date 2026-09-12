import React, { useEffect, useRef, useState } from 'react';
import { useReviewStateOptional } from '../dock/ReviewStateContext';
import type { DiffFileStatus } from '../types';

interface FileHeaderProps {
  /** Read-only host: no file-actions affordance. */
  readOnly?: boolean;
  filePath: string;
  patch: string;
  /** Change type — added/deleted/renamed get an icon; modified is undecorated. */
  status?: DiffFileStatus;
  /** Previous path for renames — rendered as "old → new" (diffshub treatment). */
  oldPath?: string;
  isViewed?: boolean;
  onToggleViewed?: () => void;
  /** Chrome preference: false hides the Viewed button (the `V` shortcut and
   *  viewed state are unaffected). */
  showViewedControl?: boolean;
  onFileComment?: (anchorEl: HTMLElement) => void;
  /**
   * Eager registration of the comment button element on mount/unmount (ref
   * callback semantics: element on attach, null on detach). Lets keyboard
   * shortcuts anchor the comment popover without the button ever being
   * clicked. onFileComment alone only surfaces the element on click.
   */
  fileCommentButtonRef?: (el: HTMLButtonElement | null) => void;
  collapseToggle?: React.ReactNode;
  onCollapseToggle?: () => void;
  /** Marked `linguist-generated` in `.gitattributes` (#1317) — renders a
   * "generated" tag next to the +/- counts. Collapse seeding is the owner's
   * concern; this prop is display-only. */
  isGenerated?: boolean;
}

function splitFilePath(filePath: string): { directory: string; name: string } {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) {
    return { directory: '', name: filePath };
  }

  return {
    directory: filePath.slice(0, lastSlash + 1),
    name: filePath.slice(lastSlash + 1),
  };
}

function frontEllipsize(text: string, visibleChars: number): string {
  if (text.length <= visibleChars) return text;
  return `...${text.slice(-visibleChars)}`;
}

/**
 * Change-type letter shown to the right of the +/- counts (matches the file
 * tree): A added · D deleted · R renamed, colored so the critical changes pop.
 * Modified is bare — the +/- counts already say it changed within the file.
 */
const STATUS_LETTER: Record<DiffFileStatus, { letter: string; className: string; title: string }> = {
  added: { letter: 'A', className: 'text-success', title: 'Added file' },
  modified: { letter: 'M', className: 'text-muted-foreground', title: 'Modified file' },
  deleted: { letter: 'D', className: 'text-destructive', title: 'Deleted file' },
  renamed: { letter: 'R', className: 'text-[#007aff]', title: 'Renamed file' },
};

const FileStatusLetter: React.FC<{ status: DiffFileStatus; oldPath?: string }> = ({ status, oldPath }) => {
  // Match the file tree: only added/deleted/renamed get a badge; modified is
  // bare (the +/- counts already convey that it changed within the file).
  if (status === 'modified') return null;
  const meta = STATUS_LETTER[status];
  const title = status === 'renamed' && oldPath ? `Renamed from ${oldPath}` : meta.title;
  return (
    <span
      className={`flex-none font-semibold leading-none ${meta.className}`}
      title={title}
      aria-label={title}
    >
      {meta.letter}
    </span>
  );
};

/** Count +/- lines in a unified patch (ignores the +++/--- file headers). */
function countChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line[0] === '+' && !line.startsWith('+++')) additions++;
    else if (line[0] === '-' && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

/** Sticky file header with file path, Viewed toggle, and Copy Diff button */
export const FileHeader: React.FC<FileHeaderProps> = ({
  filePath,
  patch,
  status,
  oldPath,
  isViewed = false,
  onToggleViewed,
  showViewedControl = true,
  onFileComment,
  fileCommentButtonRef,
  collapseToggle,
  onCollapseToggle,
  readOnly = false,
  isGenerated = false,
}) => {
  const [headerWidth, setHeaderWidth] = useState<number>(0);
  const state = useReviewStateOptional();
  const headerRef = useRef<HTMLDivElement>(null);
  const fileCommentRef = useRef<HTMLButtonElement>(null);
  const { directory, name } = splitFilePath(filePath);
  const isCompact = headerWidth > 0 && headerWidth < 760;
  const isVeryTight = headerWidth > 0 && headerWidth < 480;
  const showFilenameOnly = headerWidth > 0 && headerWidth < 560;
  const truncatedName = showFilenameOnly
    ? frontEllipsize(
        name,
        headerWidth < 360 ? 14 : headerWidth < 420 ? 18 : headerWidth < 500 ? 24 : 32,
      )
    : name;

  useEffect(() => {
    if (!headerRef.current || typeof ResizeObserver === 'undefined') return;

    const node = headerRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setHeaderWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const commentLabel = isVeryTight ? '' : 'Comment';
  const viewedLabel = isVeryTight ? '' : 'Viewed';
  const { additions, deletions } = React.useMemo(() => countChanges(patch), [patch]);

  return (
    <div
      ref={headerRef}
      className={`flex-shrink-0 border-b border-border/50 flex items-center justify-between gap-2 transition-colors duration-150 hover:bg-muted/30 ${'px-3'}`}
      style={{ height: 'var(--panel-header-h)'}}
    >
      <div className="min-w-0 flex flex-1 items-center" onClick={onCollapseToggle} style={onCollapseToggle ? { cursor: 'pointer' } : undefined}>
        {collapseToggle}
        <span
          className={`min-w-0 flex items-center text-xs font-semibold leading-normal whitespace-nowrap ${''}`}
          title={status === 'renamed' && oldPath ? `${oldPath} → ${filePath}` : filePath}
        >
          {/* Rename: dimmed old path → new path (diffshub treatment). Dropped
              under tight widths — the icon + tooltip still carry it. */}
          {status === 'renamed' && oldPath && !showFilenameOnly && (
            <>
              <span className="min-w-0 overflow-hidden text-ellipsis text-muted-foreground/60">
                {oldPath}
              </span>
              <svg
                className="w-3 h-3 mx-1 flex-none text-muted-foreground/60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </>
          )}
          {(
            <>
              {!showFilenameOnly && directory && (
                <span className="min-w-0 overflow-hidden text-ellipsis text-muted-foreground/70">
                  {directory}
                </span>
              )}
              <span
                className={showFilenameOnly ? 'block min-w-0 overflow-hidden whitespace-nowrap text-foreground' : 'flex-none whitespace-nowrap text-foreground'}
              >
                {truncatedName}
              </span>
            </>
          )}
        </span>
      </div>
      <div className={`flex flex-shrink-0 items-center pl-2 ${isCompact ? 'gap-1' : 'gap-2'}`}>
        {showViewedControl && onToggleViewed && (
          <button
            onClick={onToggleViewed}
            className={`text-xs rounded transition-colors flex items-center ${viewedLabel ? 'gap-1 px-2 py-1' : 'px-1.5 py-1'} ${
              isViewed
                ? 'bg-success/15 text-success'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={isViewed ? "Mark as not viewed (V)" : "Mark as viewed (V)"}
          >
            {isViewed ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            {viewedLabel && <span>{viewedLabel}</span>}
          </button>
        )}
        {onFileComment && (
          <button
            ref={(el) => {
              fileCommentRef.current = el;
              fileCommentButtonRef?.(el);
            }}
            onClick={() => fileCommentRef.current && onFileComment(fileCommentRef.current)}
            className={`text-xs rounded transition-colors flex items-center text-muted-foreground hover:text-foreground hover:bg-muted ${commentLabel ? 'gap-1 px-2 py-1' : 'px-1.5 py-1'}`}
            title="Add file-scoped comment"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
            </svg>
            {commentLabel && <span>{commentLabel}</span>}
          </button>
        )}
        {(additions > 0 || deletions > 0 || (status && status !== 'modified') || isGenerated) && (
          <span className="flex-none flex items-center gap-1.5 text-xs leading-none">
            {additions > 0 && <span className="font-mono text-success">+{additions}</span>}
            {deletions > 0 && <span className="font-mono text-destructive">-{deletions}</span>}
            {status && <FileStatusLetter status={status} oldPath={oldPath} />}
            {isGenerated && (
              <span
                data-pn-generated-badge
                className="flex-none rounded-sm border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"
                title="Marked linguist-generated in .gitattributes"
              >
                generated
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};
