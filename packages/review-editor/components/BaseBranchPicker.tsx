import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefPicker,
  RefPickerEmpty,
  RefPickerGroupLabel,
  RefPickerList,
  RefPickerRow,
  RefPickerSearch,
  RefPickerTag,
  RefPickerTriggerLabel,
} from './RefPicker';
import type { AvailableBranches, CompareTargetPickerCopy, RecentCommit } from '@hypermark/shared/types';

interface BaseBranchPickerProps {
  availableBranches: AvailableBranches;
  selectedBase: string;
  detectedBase: string;
  onSelectBase: (branch: string) => void;
  disabled?: boolean;
  copy: CompareTargetPickerCopy;
  /** HEAD ancestry from GitContext.recentCommits — enables picking a commit as the baseline (#709). */
  recentCommits?: RecentCommit[];
}

type Tab = 'branches' | 'commits';

// SHA or `HEAD~N` / `HEAD^N` patterns — the picker treats any matching query as
// a usable commit-ish even if it isn't in `recentCommits`. We require ≥ 4 hex
// chars for SHAs to avoid offering "abc" (which is more likely a branch name).
const SHA_PATTERN = /^[0-9a-f]{4,40}$/i;
const HEAD_REL_PATTERN = /^HEAD(?:[~^]\d+)?$/i;

function isCommitishQuery(q: string): boolean {
  return SHA_PATTERN.test(q) || HEAD_REL_PATTERN.test(q);
}

function looksLikeSha(ref: string): boolean {
  return /^[0-9a-f]{7,}$/i.test(ref);
}

/** Short, human-friendly label for the trigger chip. */
function chipLabel(base: string): string {
  return looksLikeSha(base) ? base.slice(0, 7) : base;
}

export const BaseBranchPicker: React.FC<BaseBranchPickerProps> = ({
  availableBranches,
  selectedBase,
  detectedBase,
  onSelectBase,
  disabled,
  copy,
  recentCommits,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('branches');
  const searchRef = useRef<HTMLInputElement>(null);

  const { local, remote } = availableBranches;
  const commits = recentCommits ?? [];
  const hasCommits = commits.length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { local, remote, commits };
    return {
      local: local.filter((b) => b.toLowerCase().includes(q)),
      remote: remote.filter((b) => b.toLowerCase().includes(q)),
      commits: commits.filter(
        (c) =>
          c.shortSha.toLowerCase().includes(q) ||
          c.sha.toLowerCase().startsWith(q) ||
          c.subject.toLowerCase().includes(q),
      ),
    };
  }, [local, remote, commits, query]);

  // Smart-search: if the typed query looks like a SHA or HEAD~N and isn't
  // already an exact match in any group, offer to use it verbatim. Powers the
  // "manual commit hash entry" leg of #709 without adding a separate input.
  const trimmedQuery = query.trim();
  const showUseAsBase =
    trimmedQuery.length > 0 &&
    isCommitishQuery(trimmedQuery) &&
    !filtered.local.includes(trimmedQuery) &&
    !filtered.remote.includes(trimmedQuery) &&
    !filtered.commits.some((c) => c.sha === trimmedQuery || c.shortSha === trimmedQuery);

  // Auto-focus the Commits tab when the user types a SHA-like query — otherwise
  // they'd land on Branches (empty for hex queries) and miss the commit list.
  useEffect(() => {
    if (hasCommits && trimmedQuery && isCommitishQuery(trimmedQuery)) {
      setTab('commits');
    }
  }, [trimmedQuery, hasCommits]);

  const handleSelect = (ref: string) => {
    onSelectBase(ref);
    setOpen(false);
    setQuery('');
    setTab('branches');
  };

  const handleReset = () => {
    onSelectBase(detectedBase);
    setOpen(false);
    setQuery('');
    setTab('branches');
  };

  const isCustom = selectedBase !== detectedBase;

  const branchesContent = (
    <>
      {filtered.local.length === 0 && filtered.remote.length === 0 ? (
        <RefPickerEmpty>{copy.emptyText}</RefPickerEmpty>
      ) : (
        <>
          {filtered.local.length > 0 && (
            <BranchGroup
              title={copy.localGroupLabel}
              branches={filtered.local}
              selectedBase={selectedBase}
              detectedBase={detectedBase}
              onSelect={handleSelect}
            />
          )}
          {filtered.remote.length > 0 && (
            <BranchGroup
              title={copy.remoteGroupLabel}
              branches={filtered.remote}
              selectedBase={selectedBase}
              detectedBase={detectedBase}
              onSelect={handleSelect}
            />
          )}
        </>
      )}
    </>
  );

  const commitsContent = (
    <>
      {filtered.commits.length === 0 ? (
        <RefPickerEmpty>No matching commits.</RefPickerEmpty>
      ) : (
        <CommitList commits={filtered.commits} selectedBase={selectedBase} onSelect={handleSelect} />
      )}
    </>
  );

  return (
    <RefPicker
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery('');
          setTab('branches');
        }
      }}
      disabled={disabled}
      title={`${copy.triggerTitlePrefix}: ${selectedBase}`}
      isCustom={isCustom}
      widthClassName="w-80"
      initialFocus={() => searchRef.current}
      trigger={
        <>
          <RefPickerTriggerLabel>{copy.triggerLabel}</RefPickerTriggerLabel>
          <span className="truncate flex-1 text-left">{chipLabel(selectedBase)}</span>
        </>
      }
    >
      <RefPickerSearch
        inputRef={searchRef}
        value={query}
        onChange={setQuery}
        placeholder={hasCommits ? `${copy.searchPlaceholder} or SHA / HEAD~N` : copy.searchPlaceholder}
        onKeyDown={(e) => {
          // Enter on a SHA-like query commits the manual entry —
          // matches the "Use … as base" affordance below.
          if (e.key === 'Enter' && showUseAsBase) {
            e.preventDefault();
            handleSelect(trimmedQuery);
          }
        }}
      />
      {showUseAsBase && (
        <div className="border-b border-border/50">
          <button
            type="button"
            onClick={() => handleSelect(trimmedQuery)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted focus:outline-none focus:bg-muted text-foreground"
          >
            <span className="flex-1 truncate">
              Use <span className="font-mono">{trimmedQuery}</span> as base
            </span>
            <RefPickerTag>commit</RefPickerTag>
          </button>
        </div>
      )}
      {hasCommits && (
        <div className="flex border-b border-border/50 bg-muted/30">
          <TabButton active={tab === 'branches'} onClick={() => setTab('branches')}>
            Branches
          </TabButton>
          <TabButton active={tab === 'commits'} onClick={() => setTab('commits')}>
            Commits
          </TabButton>
        </div>
      )}
      <RefPickerList>
        {hasCommits && tab === 'commits' ? commitsContent : branchesContent}
      </RefPickerList>
      {isCustom && (
        <div className="border-t border-border/50 p-1">
          <button
            type="button"
            onClick={handleReset}
            className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm"
          >
            Reset to detected ({detectedBase})
          </button>
        </div>
      )}
    </RefPicker>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 px-3 py-1.5 text-xs transition-colors focus:outline-none ${
      active
        ? 'bg-popover text-foreground font-medium border-b-2 border-primary -mb-px'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
    }`}
  >
    {children}
  </button>
);

interface BranchGroupProps {
  title: string;
  branches: string[];
  selectedBase: string;
  detectedBase: string;
  onSelect: (branch: string) => void;
}

const BranchGroup: React.FC<BranchGroupProps> = ({
  title,
  branches,
  selectedBase,
  detectedBase,
  onSelect,
}) => (
  <div className="py-1">
    <RefPickerGroupLabel>{title}</RefPickerGroupLabel>
    {branches.map((branch) => (
      <RefPickerRow key={branch} isSelected={branch === selectedBase} onClick={() => onSelect(branch)}>
        <span className="truncate flex-1">{branch}</span>
        {branch === detectedBase && <RefPickerTag>detected</RefPickerTag>}
      </RefPickerRow>
    ))}
  </div>
);

interface CommitListProps {
  commits: RecentCommit[];
  selectedBase: string;
  onSelect: (sha: string) => void;
}

const CommitList: React.FC<CommitListProps> = ({ commits, selectedBase, onSelect }) => (
  <div className="py-1">
    {commits.map((c) => (
      <RefPickerRow
        key={c.sha}
        isSelected={c.sha === selectedBase || c.shortSha === selectedBase}
        onClick={() => onSelect(c.sha)}
        title={`${c.sha}\n${c.subject}\n${c.relativeDate} · ${c.author}`}
      >
        <span className="font-mono text-muted-foreground shrink-0">{c.shortSha}</span>
        <span className="truncate flex-1">{c.subject}</span>
        <span className="text-3xs text-muted-foreground shrink-0">{c.relativeDate}</span>
      </RefPickerRow>
    ))}
  </div>
);
