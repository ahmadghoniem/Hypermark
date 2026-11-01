import React, { useEffect, useState } from 'react';
import { Loading02, Send01, XClose } from '@untitledui/icons';
import { Button } from './ui/button';
import { Tooltip } from '../fluid/components/tooltip';
import { ConfirmDialog } from './ConfirmDialog';
import type { DecisionActionId, DecisionSpec } from '../utils/decisionSpec';

/**
 * The header decision control: an X that closes the session and sends
 * nothing, then the primary decision (All good, or Send Feedback with the
 * count). Rendered entirely from a `DecisionSpec` (see
 * `utils/decisionSpec.ts`); the host owns the handlers.
 *
 * The X is a secondary icon button while there is nothing to lose. With
 * annotations pending it turns red and asks to confirm before closing. Only
 * the X has a tooltip (its label); the primary's label says what it does.
 *
 * NOT host-supported surface (like ActionMenu/ConfirmDialog): session/transport
 * chrome for Hypermark's own decision endpoints, deliberately absent from
 * the README supported-import list.
 */
export type DecisionHandler = () => void;

export interface DecisionControlProps {
  spec: DecisionSpec;
  handlers: Record<DecisionActionId, DecisionHandler>;
  /** isSubmitting || isExiting — disables both buttons and closes an open confirm. */
  busy: boolean;
  /** Spinner on the primary only. */
  isLoading: boolean;
  /** Disables both buttons like `busy`, and shows this on hover. */
  disabledReason?: string;
}

const ICONS: Record<'send', React.ReactNode> = {
  send: <Send01 className="size-3.5" />,
};

export const DecisionControl: React.FC<DecisionControlProps> = ({
  spec,
  handlers,
  busy: inFlight,
  isLoading,
  disabledReason,
}) => {
  const busy = inFlight || disabledReason !== undefined;
  const [confirming, setConfirming] = useState(false);

  // The close item, with the live spec's label and confirm copy, so a count
  // change while the confirm is up never confirms stale text.
  const close = spec.items.find((item) => item.id === 'close-session');
  const confirm = close?.confirm;

  // A decision in flight, or the last annotation deleted, closes the confirm.
  useEffect(() => {
    if (busy || !confirm) setConfirming(false);
  }, [busy, confirm]);

  const onClose = () => {
    if (confirm) setConfirming(true);
    else handlers['close-session']?.();
  };

  // The label without the trailing ellipsis the menu used for "opens a confirm".
  const closeLabel = close?.label.replace(/…$/, '') ?? 'Close session';

  return (
    // A disabled button gets no hover events, so the wrapper carries the reason.
    <div className="inline-flex items-center gap-1.5" title={disabledReason}>
      {close && (
        <Tooltip content={closeLabel} side="bottom">
          <Button
            size="xs"
            variant={confirm ? 'destructive' : 'secondary'}
            className="px-1.5"
            aria-label={closeLabel}
            data-decision-close="true"
            disabled={busy}
            onClick={onClose}
          >
            <XClose className="size-3.5" />
          </Button>
        </Tooltip>
      )}

      <Button
        size="xs"
        onClick={() => handlers.primary?.()}
        disabled={busy}
        title={disabledReason}
        data-decision-primary="true"
        iconLeft={
          isLoading
            ? <Loading02 className="size-3.5 animate-spin" />
            : spec.primary.icon ? ICONS[spec.primary.icon] : undefined
        }
      >
        {spec.primary.shortLabel ? (
          <>
            {/* Responsive spans: the short label below xl keeps the toolbar
                narrow. */}
            <span className="hidden md:inline lg:hidden">
              {spec.primary.shortLabel}
            </span>
            <span className="hidden lg:inline">
              {spec.primary.label}
            </span>
          </>
        ) : (
          <span className="hidden md:inline">
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

      {confirming && confirm && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            handlers['close-session']?.();
          }}
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText="Cancel"
          variant="warning"
          showCancel
        />
      )}
    </div>
  );
};
