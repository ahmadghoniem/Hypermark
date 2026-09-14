import React, { useMemo, useRef, useState } from 'react';
import {
  RefPicker,
  RefPickerEmpty,
  RefPickerGroupLabel,
  RefPickerList,
  RefPickerRow,
  RefPickerSearch,
  RefPickerTriggerLabel,
} from './RefPicker';
import type { WorktreeInfo } from '@hypermark/shared/types';

interface WorktreePickerProps {
  worktrees: WorktreeInfo[];
  activeWorktreePath: string | null;
  currentBranch?: string;
  onSelect: (path: string | null) => void;
  disabled?: boolean;
}

const MAIN_REPO = null;

export const WorktreePicker: React.FC<WorktreePickerProps> = ({
  worktrees,
  activeWorktreePath,
  currentBranch,
  onSelect,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const mainLabel = currentBranch || 'Main repo';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return worktrees;
    return worktrees.filter((wt) => {
      const branch = (wt.branch || '').toLowerCase();
      const path = wt.path.toLowerCase();
      return branch.includes(q) || path.includes(q);
    });
  }, [worktrees, query]);

  const mainMatchesQuery = !query.trim() || mainLabel.toLowerCase().includes(query.trim().toLowerCase());

  const handleSelect = (path: string | null) => {
    onSelect(path);
    setOpen(false);
    setQuery('');
  };

  const active = activeWorktreePath
    ? worktrees.find((wt) => wt.path === activeWorktreePath)
    : null;
  const activeLabel = active
    ? (active.branch || active.path.split('/').pop() || 'worktree')
    : mainLabel;
  const isCustom = activeWorktreePath !== null;

  return (
    <RefPicker
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
      disabled={disabled}
      title={active ? `${activeLabel} — ${active.path}` : mainLabel}
      isCustom={isCustom}
      widthClassName="w-72"
      initialFocus={() => {
        // Only override the default focus when the search input is
        // actually rendered — otherwise arrow keys would bubble out to
        // the file-tree nav. For short worktree lists, returning null
        // falls back to Base UI's default focus (the popup's first
        // tabbable); undefined would mean "do nothing" and leave focus
        // on the trigger.
        return searchRef.current;
      }}
      trigger={
        <>
          <span className="truncate flex-1 text-left">{activeLabel}</span>
          {isCustom && <RefPickerTriggerLabel>worktree</RefPickerTriggerLabel>}
        </>
      }
    >
      {worktrees.length > 3 && (
        <RefPickerSearch inputRef={searchRef} value={query} onChange={setQuery} placeholder="Search worktrees…" />
      )}
      <RefPickerList>
        {mainMatchesQuery && (
          <WorktreeRow
            label={mainLabel}
            sublabel={null}
            isSelected={activeWorktreePath === MAIN_REPO}
            onClick={() => handleSelect(MAIN_REPO)}
          />
        )}

        {filtered.length > 0 && (
          <>
            {mainMatchesQuery && (
              <div className="h-px bg-border/50 mx-2 my-1" />
            )}
            <RefPickerGroupLabel>Worktrees</RefPickerGroupLabel>
            {filtered.map((wt) => (
              <WorktreeRow
                key={wt.path}
                label={wt.branch || wt.path.split('/').pop() || 'worktree'}
                sublabel={wt.path}
                isSelected={wt.path === activeWorktreePath}
                onClick={() => handleSelect(wt.path)}
              />
            ))}
          </>
        )}

        {!mainMatchesQuery && filtered.length === 0 && (
          <RefPickerEmpty>No worktrees match.</RefPickerEmpty>
        )}
      </RefPickerList>
    </RefPicker>
  );
};

interface WorktreeRowProps {
  label: string;
  sublabel: string | null;
  isSelected: boolean;
  onClick: () => void;
}

const WorktreeRow: React.FC<WorktreeRowProps> = ({ label, sublabel, isSelected, onClick }) => (
  <RefPickerRow isSelected={isSelected} onClick={onClick}>
    <div className="min-w-0 flex-1">
      <div className="truncate" title={label}>{label}</div>
      {sublabel && (
        <div className="truncate text-3xs text-muted-foreground" title={sublabel}>{sublabel}</div>
      )}
    </div>
  </RefPickerRow>
);
