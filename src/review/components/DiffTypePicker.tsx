import React, { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Tooltip } from '@/ui/components/Tooltip';
import type { DiffOption } from '@/shared/types';

import { Check, ChevronDown, InfoCircle, Loading02 } from '@untitledui/icons';
interface DiffTypePickerProps {
  options: DiffOption[];
  activeDiffType: string;
  onSelect: (diffType: string) => void;
  isLoading?: boolean;
  hasBasePicker: boolean;
}

/**
 * Plain-English explanations shown in a tooltip next to each option.
 * Keep these short — they're hover hints, not docs.
 */
const OPTION_HINTS: Record<string, string> = {
  'since-base': "Everything since your branch split from the base — committed, uncommitted, and untracked. What a PR would show if you committed it all and pushed.",
  'local-vs-remote': "Your local branch and working tree compared with its remote-tracking branch — committed, uncommitted, and untracked differences from the last fetch.",
  uncommitted: "All your local changes — anything you haven't committed yet.",
  staged: "Only what you've run `git add` on.",
  unstaged: "What `git diff` shows with no arguments.",
  'last-commit': "Just your most recent commit.",
  branch: "Straight compare against the base branch (picked below). Can show commits that aren't yours if the base has new commits.",
  'merge-base': "Only what you've added on top of the base branch (picked below). Same as GitHub's PR view.",
  all: "Every tracked file at HEAD, shown as additions. Unlike Committed, which shows what changed vs a base branch, this shows the entire codebase.",
};

export const DiffTypePicker: React.FC<DiffTypePickerProps> = ({
  options,
  activeDiffType,
  onSelect,
  isLoading,
  hasBasePicker,
}) => {
  const [open, setOpen] = useState(false);

  // When a base picker is wired up, strip branch names from the
  // base-dependent labels — the branch belongs in the picker.
  const displayLabel = (opt: DiffOption) => {
    if (!hasBasePicker) return opt.label;
    if (opt.id === 'merge-base') return 'Committed changes (PR view)';
    // since-base falls through to opt.label — the dynamic "All changes since <base>" from
    // getGitContext — so the dropdown matches the live header.
    return opt.label;
  };

  const active = options.find((o) => o.id === activeDiffType);
  const activeLabel = active ? displayLabel(active) : 'Select diff';

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        render={
          <button
            type="button"
            disabled={isLoading}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded-sm text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-wait"
          />
        }
      >
          <span className="truncate flex-1 text-left">{activeLabel}</span>
          {isLoading ? (
            <Loading02 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-chrome">
          <Menu.Popup className="min-w-(--anchor-width) bg-popover text-popover-foreground border border-border rounded-sm shadow-lg overflow-hidden py-1 origin-(--transform-origin) transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0">
          {options.map((opt) => {
            const hint = OPTION_HINTS[opt.id];
            const isActive = opt.id === activeDiffType;
            return (
              <Menu.Item
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                className={`flex items-center gap-2 mx-1 px-2 py-1.5 text-caption rounded-sm cursor-pointer outline-none data-highlighted:bg-muted ${
                  isActive ? 'text-foreground font-semibold' : 'text-foreground/80'
                }`}
              >
                <span className="w-3 shrink-0">
                  {isActive && (
                    <Check className="size-3" strokeWidth={3} />
                  )}
                </span>
                <span className="truncate flex-1">{displayLabel(opt)}</span>
                {hint && (
                  <Tooltip content={hint} side="right" delayDuration={200} wide>
                    <span
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Heroicons information-circle (outline) */}
                      <InfoCircle className="size-3.5" />
                    </span>
                  </Tooltip>
                )}
              </Menu.Item>
            );
          })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
