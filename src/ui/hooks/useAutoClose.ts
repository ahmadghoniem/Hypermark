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

/** How long the sent screen stays up before the tab closes. */
const CLOSE_DELAY_MS = 3000;

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
 * Closes the tab three seconds after a submission lands.
 *
 * Every caller awaits its POST before flipping `active`, so the agent already
 * has the feedback; the delay only leaves the completion screen up long
 * enough to read that it was sent. A tab the browser refuses to close (one
 * the user opened by hand rather than one the agent opened) reports
 * `closeFailed`.
 *
 * @param active - pass `true` once the submission has been accepted
 */
export function useAutoClose(active: boolean): UseAutoCloseReturn {
  const [state, setState] = useState<AutoClosePhase>({ phase: 'idle' });

  useEffect(() => {
    if (!active) return;
    setState({ phase: 'closing' });
    const timer = setTimeout(() => tryClose(() => setState({ phase: 'closeFailed' })), CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return { state };
}
