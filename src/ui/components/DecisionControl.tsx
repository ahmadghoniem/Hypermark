import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loading02, Send01 } from '@untitledui/icons';
import { Button } from './ui/button';
import { ActionMenuDivider, ActionMenuItem } from './ActionMenu';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
import { AutoGrowBox } from './AutoGrowBox';
import { useDismissablePopover } from '../hooks/useDismissablePopover';
import { cn } from '../lib/utils';
import type {
  DecisionActionId,
  DecisionMenuItem,
  DecisionSpec,
  DecisionTone,
} from '../utils/decisionSpec';

/**
 * The unified header decision control: one joined split pill — the incumbent
 * primary on the left, a caret on the right whose popover carries the
 * alternate decisions. Rendered entirely from a
 * `DecisionSpec` (see `utils/decisionSpec.ts`); the host owns the handlers.
 *
 * NOT host-supported surface (like ActionMenu/ConfirmDialog): session/transport
 * chrome for Hypermark's own decision endpoints, deliberately absent from
 * the README supported-import list.
 *
 * Interaction contract (the load-bearing rules):
 * - The left segment never opens the popover and never changes meaning within
 *   a state; the caret owns the popover.
 * - Escape in the menu closes it and returns focus to the caret. The event is
 *   consumed (stopPropagation); with the menu closed the host app's own
 *   Escape ladder still runs.
 */
export type DecisionHandler = () => void;

export interface DecisionControlProps {
  spec: DecisionSpec;
  handlers: Record<DecisionActionId, DecisionHandler>;
  /** isSubmitting || isExiting || isApproving — disables both segments and
   *  closes an open popover. */
  busy: boolean;
  /** Spinner on the primary only. */
  isLoading: boolean;
  labelBreakpoint?: 'md' | 'lg';
  /** Confirm surface override; defaults to the ui ConfirmDialog. */
  confirmDialog?: React.ComponentType<ConfirmDialogProps>;
}

const NOTE_MAX_HEIGHT_PX = 144;

const ICONS: Record<'check' | 'send', React.ReactNode> = {
  check: <Check className="size-3.5" />,
  send: <Send01 className="size-3.5" />,
};

function toneButtonVariant(tone: Exclude<DecisionTone, 'destructive'>): 'success' | 'default' {
  return tone === 'success' ? 'success' : 'default';
}

function itemToneClass(tone: DecisionTone): string | undefined {
  if (tone === 'destructive') return 'text-destructive';
  if (tone === 'success') return 'text-success';
  return undefined;
}

export interface DecisionNoteFieldProps {
  text: string;
  onTextChange: (value: string) => void;
  /** Mod+Enter / the labelled action. The owner enforces the empty-note
   *  no-op-and-refocus rule, so this fires for any text. */
  onSubmit: () => void;
  /** Escape. Consumes the event; the owner decides what "back" means. */
  onCancel: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * The shared multi-line note field: two rows at rest, grows to 144px, then
 * scrolls. Controlled: the owner keeps the text. Used by the review sidebar's
 * "+ General comment".
 */
export const DecisionNoteField: React.FC<DecisionNoteFieldProps> = ({
  text,
  onTextChange,
  onSubmit,
  onCancel,
  placeholder = 'Add a note...',
  disabled = false,
  autoFocus = true,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        // A consuming rung of the Esc ladder: the host apps run their own
        // Escape ladders and must not also see this event.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onSubmit();
      }
      // Plain Enter falls through: the field is multi-line and Enter's job is
      // a newline.
    },
    [disabled, onCancel, onSubmit],
  );

  return (
    <AutoGrowBox value={text}>
      <textarea
        ref={ref}
        rows={2}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        data-decision-note-input="true"
        data-pn-mobile-editable
        disabled={disabled}
        className="block w-full resize-none overflow-y-auto rounded-md border border-border bg-background px-2.5 py-1.5 text-body/snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/40"
        style={{
          fieldSizing: 'content',
          // Two lines at rest: field-sizing ignores `rows`.
          minHeight: 'calc(2lh + 0.75rem + 2px)',
          maxHeight: NOTE_MAX_HEIGHT_PX,
        } as React.CSSProperties}
      />
    </AutoGrowBox>
  );
};

export const DecisionControl: React.FC<DecisionControlProps> = ({
  spec,
  handlers,
  busy,
  isLoading,
  labelBreakpoint = 'md',
  confirmDialog,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // L2: only the ID is state — the confirm's title/message/handler resolve
  // from the LIVE spec at render, so a spec update while the dialog is up
  // can never confirm stale copy (e.g. an outdated count).
  const [confirmItemId, setConfirmItemId] = useState<DecisionMenuItem['id'] | null>(null);
  const confirmItem =
    confirmItemId !== null
      ? spec.items.find((item) => item.id === confirmItemId && item.confirm) ?? null
      : null;

  const closePopover = useCallback((options?: { focusCaret?: boolean }) => {
    setMenuOpen(false);
    if (options?.focusCaret) caretRef.current?.focus();
  }, []);

  // Outside pointerdown, or an Escape whose focus has already left the
  // control, closes the menu.
  const dismiss = useCallback(() => closePopover(), [closePopover]);

  useDismissablePopover({
    enabled: menuOpen,
    ref: rootRef,
    onDismiss: dismiss,
  });

  // Busy = a decision is in flight: nothing in the popover can do anything
  // anymore, so it must not hang over a disabled pill.
  useEffect(() => {
    if (busy) {
      setMenuOpen(false);
      setConfirmItemId(null);
    }
  }, [busy]);

  // F6: the spec is live — an annotation delete (or an external write) can
  // remove the item an open confirm belongs to; it steps back to the menu.
  // buildDecisionSpec guarantees at least one item, so the menu is always a
  // valid fallback.
  useEffect(() => {
    if (confirmItemId === null) return;
    if (spec.items.some((item) => item.id === confirmItemId && item.confirm)) return;
    setConfirmItemId(null);
    setMenuOpen(true);
  }, [confirmItemId, spec]);

  // Roving focus entry point: whenever the menu (re)appears — caret click,
  // confirm cancel — focus its first row.
  useEffect(() => {
    if (!menuOpen) return;
    popoverRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [menuOpen]);

  const selectItem = useCallback((item: DecisionMenuItem) => {
    if (item.confirm) {
      // The confirm replaces the popover; cancel reopens the menu so one
      // decision stays one click away.
      setConfirmItemId(item.id);
      setMenuOpen(false);
      return;
    }
    closePopover();
    handlers[item.id]?.();
  }, [closePopover, handlers]);

  const handlePopoverKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePopover({ focusCaret: true });
        return;
      }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const items = Array.from(
        popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;
      if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
      else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
      else if (event.key === 'Home') next = 0;
      else next = items.length - 1;
      items[next]?.focus();
    },
    [closePopover],
  );

  const primaryVariant = toneButtonVariant(spec.primary.tone);
  const Confirm = confirmDialog ?? ConfirmDialog;

  // Left segment — the incumbent primary. It never opens the popover and,
  // deliberately, never fades or disables while the popover is open: the
  // popover holds only ALTERNATE decisions, so the primary keeps its
  // meaning and stays clickable (reverses the held branches' fade, which
  // existed because their panel duplicated the primary's own action).
  const primaryButton = (
      <Button
        variant={primaryVariant}
        size="xs"
        onClick={() => handlers.primary?.()}
        disabled={busy}
        title={spec.primary.title}
        data-decision-primary="true"
        iconLeft={
          isLoading
            ? <Loading02 className="size-3.5 animate-spin" />
            : spec.primary.icon ? ICONS[spec.primary.icon] : undefined
        }
        className="rounded-r-none border-r-0"
      >
        {spec.primary.shortLabel ? (
          <>
            {/* Responsive spans: the short label below xl keeps the toolbar
                narrow. */}
            <span className={labelBreakpoint === 'lg' ? 'hidden lg:inline xl:hidden' : 'hidden md:inline lg:hidden'}>
              {spec.primary.shortLabel}
            </span>
            <span className={labelBreakpoint === 'lg' ? 'hidden xl:inline' : 'hidden lg:inline'}>
              {spec.primary.label}
            </span>
          </>
        ) : (
          <span className={labelBreakpoint === 'lg' ? 'hidden lg:inline' : 'hidden md:inline'}>
            {spec.primary.label}
          </span>
        )}
        {typeof spec.primary.count === 'number' && (
          // The count is the state indicator, not decoration: present at every
          // breakpoint, unlike the labels.
          <span
            data-decision-count="true"
            className="rounded-full bg-current/25 px-1.5 text-micro/4 font-bold"
          >
            {spec.primary.count}
          </span>
        )}
      </Button>
  );

  return (
    <div ref={rootRef} className="relative inline-flex">
      {primaryButton}

      {/* Right segment — the caret. */}
      <Button
        ref={caretRef}
        variant={primaryVariant}
        size="xs"
        onClick={() => {
          if (menuOpen) closePopover();
          else setMenuOpen(true);
        }}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More decisions"
        data-decision-caret="true"
        className="rounded-l-none px-1.5"
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-150', menuOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>

      {menuOpen && (
        <div
          ref={popoverRef}
          role="menu"
          data-decision-popover="menu"
          data-pn-dismissable-popover="true"
          onKeyDown={handlePopoverKeyDown}
          className="absolute right-0 top-full z-menu mt-1.5 w-64 rounded-lg border border-border bg-popover py-1 shadow-xl"
        >
          {spec.items.map((item) => (
            <React.Fragment key={item.id}>
              {item.dividerBefore ? <ActionMenuDivider /> : null}
              <ActionMenuItem
                role="menuitem"
                icon={item.icon ? ICONS[item.icon] : undefined}
                label={item.label}
                subtitle={item.subtitle}
                className={itemToneClass(item.tone)}
                onClick={() => selectItem(item)}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {confirmItem?.confirm && (
        <Confirm
          isOpen
          onClose={() => {
            setConfirmItemId(null);
            setMenuOpen(true);
          }}
          onConfirm={() => {
            const id = confirmItem.id;
            setConfirmItemId(null);
            handlers[id]?.();
          }}
          title={confirmItem.confirm.title}
          message={confirmItem.confirm.message}
          confirmText={confirmItem.confirm.confirmText}
          cancelText="Cancel"
          variant="warning"
          showCancel
        />
      )}
    </div>
  );
};
