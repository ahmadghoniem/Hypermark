import { useEffect, useRef } from 'react';
import type { ShortcutDefinition, ShortcutScopeDefinition } from './core';
import {
  matchesShortcutBinding,
  matchesShortcutBindingGroup,
} from './core';

type ShortcutActionId<TScope extends ShortcutScopeDefinition<any>> = keyof TScope['shortcuts'] & string;

export interface ShortcutHandlerConfig {
  when?: (event: KeyboardEvent) => boolean;
  handle: (event: KeyboardEvent) => void;
}

export type ShortcutHandler = ((event: KeyboardEvent) => void) | ShortcutHandlerConfig;

export type ShortcutHandlers<TScope extends ShortcutScopeDefinition<any>> = Partial<
  Record<ShortcutActionId<TScope>, ShortcutHandler>
>;

type ShortcutEventTarget = 'window' | 'document' | EventTarget | null;

export interface UseShortcutScopeOptions<TScope extends ShortcutScopeDefinition<any>> {
  scope: TScope;
  handlers: ShortcutHandlers<TScope>;
  target?: ShortcutEventTarget;
  stopOnMatch?: boolean;
}

interface ShortcutSequenceCandidate {
  readonly actionId: string;
  readonly groups: readonly string[];
  readonly nextIndex: number;
}

interface ShortcutSequenceState {
  readonly candidates: readonly ShortcutSequenceCandidate[];
  readonly expiresAt: number;
}

const SHORTCUT_SEQUENCE_WINDOW_MS = 500;

function normalizeShortcutHandler(handler: ShortcutHandler): ShortcutHandlerConfig {
  if (typeof handler === 'function') {
    return { handle: handler };
  }

  return handler;
}

function getShortcutEntries<TScope extends ShortcutScopeDefinition<any>>(
  scope: TScope,
): Array<[ShortcutActionId<TScope>, ShortcutDefinition]> {
  // SAFETY: ShortcutScopeDefinition constrains every own value in `shortcuts`
  // to ShortcutDefinition; Object.entries preserves those own keys and values.
  return Object.entries(scope.shortcuts) as Array<[
    ShortcutActionId<TScope>,
    ShortcutDefinition,
  ]>;
}

// TODO(migration): no cross-scope arbitration. When two scopes bind the
// same key (e.g. `Escape` in both an outer editor scope and an inner
// dialog scope), both `useShortcutScope` listeners fire on a single
// keypress. Add `if (event.defaultPrevented) return false;` at the top
// of this function once shortcut definitions consistently set
// `preventDefault: true` (or once we flip the default). Until then,
// callers must guard with `when` to prevent double-handling.
export function dispatchShortcutEvent<TScope extends ShortcutScopeDefinition<any>>(
  scope: TScope,
  handlers: ShortcutHandlers<TScope>,
  event: KeyboardEvent,
  options?: { stopOnMatch?: boolean },
): boolean {
  const stopOnMatch = options?.stopOnMatch ?? true;
  let handled = false;

  for (const [actionId, shortcut] of getShortcutEntries(scope)) {
    const handler = handlers[actionId];
    if (!handler) continue;
    if (!shortcut.bindings.some(binding => matchesShortcutBinding(event, binding))) continue;

    const { when, handle } = normalizeShortcutHandler(handler);
    if (when && !when(event)) continue;

    if (shortcut.preventDefault) {
      event.preventDefault();
    }

    handle(event);
    handled = true;

    if (stopOnMatch) {
      return true;
    }
  }

  return handled;
}

function getEventTarget(target: ShortcutEventTarget): EventTarget | null {
  if (target === 'window') {
    return typeof window === 'undefined' ? null : window;
  }
  if (target === 'document') {
    return typeof document === 'undefined' ? null : document;
  }
  return target;
}

/**
 * Attach a registry scope to a keyboard event target.
 *
 * Ordinary bindings dispatch immediately. Non-modifier sequential bindings
 * advance within a 500 ms window, suppress their prefix keystrokes, and reset
 * after a match, timeout, or unrelated key. Handlers are read through a ref so
 * listener lifetime follows only the scope, target, and dispatch options.
 */
export function useShortcutScope<TScope extends ShortcutScopeDefinition<any>>({
  scope,
  handlers,
  target = 'window',
  stopOnMatch = true,
}: UseShortcutScopeOptions<TScope>) {
  const handlersRef = useRef(handlers);
  const sequenceRef = useRef<ShortcutSequenceState | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const eventTarget = getEventTarget(target);
    if (!eventTarget || !('addEventListener' in eventTarget)) return;

    const handleKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const keyboardEvent = event;
      if (dispatchShortcutEvent(scope, handlersRef.current, keyboardEvent, { stopOnMatch })) {
        sequenceRef.current = null;
        return;
      }

      const now = Date.now();
      const active = sequenceRef.current && sequenceRef.current.expiresAt >= now
        ? sequenceRef.current.candidates
        : [];
      const advanced: ShortcutSequenceCandidate[] = [];

      for (const candidate of active) {
        const group = candidate.groups[candidate.nextIndex];
        if (!group || !matchesShortcutBindingGroup(keyboardEvent, group)) continue;
        if (candidate.nextIndex === candidate.groups.length - 1) {
          const shortcut = scope.shortcuts[candidate.actionId];
          const handler = handlersRef.current[candidate.actionId];
          if (!shortcut || !handler) continue;
          const { when, handle } = normalizeShortcutHandler(handler);
          if (when && !when(keyboardEvent)) continue;
          if (shortcut.preventDefault) keyboardEvent.preventDefault();
          handle(keyboardEvent);
          sequenceRef.current = null;
          return;
        }
        advanced.push({ ...candidate, nextIndex: candidate.nextIndex + 1 });
      }

      if (advanced.length > 0) {
        sequenceRef.current = {
          candidates: advanced,
          expiresAt: now + SHORTCUT_SEQUENCE_WINDOW_MS,
        };
        keyboardEvent.preventDefault();
        return;
      }

      const started: ShortcutSequenceCandidate[] = [];
      for (const [actionId, shortcut] of getShortcutEntries(scope)) {
        const handler = handlersRef.current[actionId];
        if (!handler) continue;
        const { when } = normalizeShortcutHandler(handler);
        if (when && !when(keyboardEvent)) continue;

        for (const binding of shortcut.bindings) {
          const groups = binding.trim().split(/\s+/).filter(Boolean);
          if (
            groups.length < 2
            || groups.includes('hold')
            || !matchesShortcutBindingGroup(keyboardEvent, groups[0] ?? '')
          ) {
            continue;
          }
          started.push({ actionId, groups, nextIndex: 1 });
        }
      }

      sequenceRef.current = started.length > 0
        ? {
            candidates: started,
            expiresAt: now + SHORTCUT_SEQUENCE_WINDOW_MS,
          }
        : null;
      if (started.length > 0) keyboardEvent.preventDefault();
    };

    eventTarget.addEventListener('keydown', handleKeyDown);
    return () => {
      eventTarget.removeEventListener('keydown', handleKeyDown);
    };
  }, [scope, stopOnMatch, target]);
}

export function createShortcutScopeHook<TScope extends ShortcutScopeDefinition<any>>(scope: TScope) {
  return function useScopedShortcutScope(options: Omit<UseShortcutScopeOptions<TScope>, 'scope'>) {
    useShortcutScope({ scope, ...options });
  };
}

// --- Multi-press shortcut support ---
//
// `useShortcutScope` only dispatches single-press bindings — anything with
// the `hold` token (e.g. `"Alt hold"`) short-circuits in
// `matchesShortcutBinding`. Hold bindings have no shared hook yet; wire by
// hand in the consuming component until one is built.
//
// TODO: when the App.tsx migration starts touching hold semantics, add a
// `useHoldShortcuts` here paired with a `parseHoldBinding` in core.ts so the
// registry-driven path actually fires.
