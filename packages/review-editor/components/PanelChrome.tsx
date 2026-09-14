import React from "react";
import {
  ArrowsInLineVertical,
  ArrowsOutLineVertical,
  Check,
  Copy,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { Tooltip } from "@hypermark/ui/components/Tooltip";

/**
 * Shared chrome for the left review panels (FileTree, SectionsPanel).
 *
 * The header's top row belongs to the PanelViewToggle alone (full width), so
 * the controls that used to share it — staged count, search, collapse-all —
 * render as their own row directly above the file list, below the "All files"
 * entry. One source so both views keep the same cluster in the same order.
 */
export function PanelControlsRow({
  isSearchVisible = false,
  onOpenSearch,
  onToggleAllFolders,
  areAllFoldersExpanded = false,
  collapseDisabled = false,
  onCopyRawDiff,
  canCopyRawDiff = false,
  copyRawDiffStatus = "idle",
}: {
  isSearchVisible?: boolean;
  onOpenSearch?: () => void;
  /** Tree view only — the sections view has no folders to collapse. */
  onToggleAllFolders?: () => void;
  areAllFoldersExpanded?: boolean;
  collapseDisabled?: boolean;
  onCopyRawDiff?: () => void;
  canCopyRawDiff?: boolean;
  copyRawDiffStatus?: "idle" | "success" | "error";
}) {
  const copyLabel =
    copyRawDiffStatus === "success"
      ? "Copied all diffs"
      : copyRawDiffStatus === "error"
        ? "Could not copy all diffs"
        : "Copy all diffs";

  return (
    <div
      className="flex items-center justify-end gap-2 pl-1 pr-2 py-1"
      data-panel-controls-row
    >
      <div className="flex items-center gap-1.5">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className={`panel-utility-button p-1 rounded transition-colors ${isSearchVisible ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"}`}
            aria-label="Search diff"
            title="Search diff (Cmd/Ctrl+F)"
          >
            <MagnifyingGlass className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {onToggleAllFolders && (
          <button
            type="button"
            onClick={onToggleAllFolders}
            disabled={collapseDisabled}
            className="panel-utility-button p-1 rounded transition-colors hover:bg-muted text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={
              areAllFoldersExpanded
                ? "Collapse all folders"
                : "Expand all folders"
            }
            title={
              areAllFoldersExpanded
                ? "Collapse all folders"
                : "Expand all folders"
            }
          >
            {areAllFoldersExpanded ? (
              <ArrowsInLineVertical className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowsOutLineVertical className="size-3.5" aria-hidden="true" />
            )}
          </button>
        )}
        {onCopyRawDiff && (
          <Tooltip content={copyLabel} side="bottom" delayDuration={300}>
            <button
              type="button"
              onClick={onCopyRawDiff}
              disabled={!canCopyRawDiff}
              aria-label={copyLabel}
              className={`panel-utility-button p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                copyRawDiffStatus === "success"
                  ? "text-success"
                  : copyRawDiffStatus === "error"
                    ? "text-destructive"
                    : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {copyRawDiffStatus === "success" ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : copyRawDiffStatus === "error" ? (
                <X className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        )}
      </div>

      <span className="sr-only" aria-live="polite">
        {copyRawDiffStatus === "success"
          ? "All diffs copied"
          : copyRawDiffStatus === "error"
            ? "Copy failed"
            : ""}
      </span>
    </div>
  );
}

export function PanelSearchField({
  inputRef,
  query,
  resultCount,
  isPending,
  onChange,
  onKeyDown,
  onClear,
  onClose,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  query: string;
  resultCount: number;
  isPending: boolean;
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onClear?: () => void;
  onClose?: () => void;
}) {
  const hasQuery = !!query.trim();
  const actionLabel = hasQuery ? "Clear search" : "Close search";

  return (
    <div
      className="flex items-center border-b border-border/50 px-2"
      style={{ height: "var(--panel-header-h)" }}
      data-panel-search-field
    >
      <div className="relative flex-1">
        <MagnifyingGlass
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search diff..."
          aria-label="Search diff"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded bg-muted py-1.5 px-7 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {hasQuery && !isPending && (
            <span className="text-[10px] tabular-nums text-muted-foreground/40">
              {resultCount}
            </span>
          )}
          <button
            type="button"
            onClick={hasQuery ? onClear : onClose}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
            aria-label={actionLabel}
            title={actionLabel}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
