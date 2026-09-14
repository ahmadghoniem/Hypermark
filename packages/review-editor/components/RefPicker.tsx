import React from 'react';
import { Popover } from '@base-ui/react/popover';

/*
 * Shared chrome for the sidebar's git ref pickers (BaseBranchPicker,
 * WorktreePicker): the trigger chip, the popup, its search box, group labels,
 * selectable rows with a check column, tags and the empty line. Each picker
 * keeps its own filtering and selection logic.
 */

interface RefPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Tooltip on the trigger chip. */
  title: string;
  /** Tints the trigger when the choice differs from the default. */
  isCustom: boolean;
  /** Trigger chip content; the chevron is appended. */
  trigger: React.ReactNode;
  /** Popup width utility, e.g. `w-80`. */
  widthClassName: string;
  initialFocus?: () => HTMLElement | null;
  children: React.ReactNode;
}

export function RefPicker({
  open,
  onOpenChange,
  disabled,
  title,
  isCustom,
  trigger,
  widthClassName,
  initialFocus,
  children,
}: RefPickerProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            disabled={disabled}
            title={title}
            className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-medium text-foreground border transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              isCustom ? 'bg-primary/10 border-primary/30' : 'bg-muted border-transparent'
            }`}
          />
        }
      >
        {trigger}
        <svg className="size-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup
            className={`${widthClassName} bg-popover text-popover-foreground border border-border rounded-sm shadow-lg overflow-hidden origin-(--transform-origin) transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0`}
            initialFocus={initialFocus}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Small uppercase label inside the trigger chip (`BASE`, `worktree`). */
export function RefPickerTriggerLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide opacity-60 shrink-0">{children}</span>;
}

export function RefPickerSearch({
  inputRef,
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  inputRef: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="p-2 border-b border-border/50">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 bg-muted rounded-sm text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    </div>
  );
}

export function RefPickerList({ children }: { children: React.ReactNode }) {
  return <div className="max-h-72 overflow-y-auto py-1">{children}</div>;
}

export function RefPickerGroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</div>;
}

export function RefPickerEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}

/** Trailing badge on a row (`detected`, `commit`). */
export function RefPickerTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 py-0.5 rounded-sm bg-muted">
      {children}
    </span>
  );
}

/** Selectable row with a leading check column. */
export function RefPickerRow({
  isSelected,
  onClick,
  title,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted focus:outline-none focus:bg-muted ${
        isSelected ? 'text-foreground font-medium' : 'text-foreground/80'
      }`}
    >
      <span className="w-3 shrink-0">
        {isSelected && (
          <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {children}
    </button>
  );
}
