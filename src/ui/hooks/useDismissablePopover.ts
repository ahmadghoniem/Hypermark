import { useEffect } from 'react';
import { isDialKitTarget } from '../utils/dialkit';

/**
 * Outside-`pointerdown` + Escape dismissal for anchored popovers — the one
 * shared effect behind DecisionControl and ActionMenu.
 */
export function useDismissablePopover({
  enabled,
  ref,
  onDismiss,
}: {
  enabled: boolean;
  ref: React.RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current && ref.current.contains(target)) return;
      if (isDialKitTarget(event.target)) return;
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Fail closed: an Escape that dismisses the popover is consumed here
      // (document bubbles before window), so the host apps' window-level
      // Escape ladders never also act on it — one Escape, one rung.
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, ref, onDismiss]);
}
