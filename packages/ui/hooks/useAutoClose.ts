import { useState, useEffect } from 'react';

/**
 * Phases of the close attempt that follows a form submission.
 *
 * - idle:        nothing submitted yet
 * - closing:     window.close() has been requested
 * - closeFailed: the browser refused to close the tab
 */
type AutoClosePhase =
  | { phase: 'idle' }
  | { phase: 'closing' }
  | { phase: 'closeFailed' };

interface UseAutoCloseReturn {
  state: AutoClosePhase;
}

type GlimpseWindow = Window & {
  glimpse?: {
    close?: () => void;
  };
};

function requestGlimpseClose(): boolean {
  const glimpseClose = (window as GlimpseWindow).glimpse?.close;
  if (typeof glimpseClose === 'function') {
    glimpseClose();
    return true;
  }

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ __hypermark_glimpse_close: true }, '*');
    return true;
  }

  return false;
}

function tryClose(onFail: () => void): void {
  const requestedNativeClose = requestGlimpseClose();
  if (requestedNativeClose) {
    return;
  }

  window.close();
  // window.close() is silently ignored when the tab wasn't opened by script.
  // Check after a short delay whether we're still alive.
  setTimeout(() => {
    if (!window.closed) onFail();
  }, 300);
}

/**
 * Closes the tab as soon as a submission lands.
 *
 * There is no delay and no setting. Every caller awaits its POST before
 * flipping `active`, so by the time this runs the agent already has the
 * feedback — the completion screen was a receipt for something the tab's own
 * disappearance reports better. What survives is the failure path: a tab the
 * browser refuses to close (one the user opened by hand rather than one the
 * agent opened) reports `closeFailed`, which is the only case where the
 * overlay has something to say.
 *
 * @param active - pass `true` once the submission has been accepted
 */
export function useAutoClose(active: boolean): UseAutoCloseReturn {
  const [state, setState] = useState<AutoClosePhase>({ phase: 'idle' });

  useEffect(() => {
    if (!active) return;
    setState({ phase: 'closing' });
    tryClose(() => setState({ phase: 'closeFailed' }));
  }, [active]);

  return { state };
}
