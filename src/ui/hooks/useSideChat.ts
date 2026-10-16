import { useCallback, useRef, useState } from 'react';
import { askSideQuestion, type SideChatMessage } from '../utils/sideChat';

export interface SideChatThread {
  quote: string;
  messages: SideChatMessage[];
  pending: boolean;
  error: string | null;
}

const EMPTY: SideChatThread = { quote: '', messages: [], pending: false, error: null };

/**
 * In-memory side threads for the session, keyed by the highlight they are
 * about. One thread is open at a time. Nothing here reaches the feedback sent
 * to the agent.
 */
export function useSideChat() {
  const [threads, setThreads] = useState<Record<string, SideChatThread>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const update = useCallback((key: string, fn: (t: SideChatThread) => SideChatThread) => {
    setThreads((prev) => {
      const next = { ...prev, [key]: fn(prev[key] ?? EMPTY) };
      threadsRef.current = next;
      return next;
    });
  }, []);

  const send = useCallback((key: string, quote: string, question: string) => {
    const current = threadsRef.current[key] ?? { ...EMPTY, quote };
    if (current.pending) return;
    const history = current.messages;
    update(key, (t) => ({
      ...t,
      quote,
      messages: [...t.messages, { role: 'user', text: question }],
      pending: true,
      error: null,
    }));
    askSideQuestion({ question, quote, thread: history }).then(
      (reply) => update(key, (t) => ({
        ...t,
        messages: [...t.messages, { role: 'assistant', text: reply }],
        pending: false,
      })),
      (err: unknown) => update(key, (t) => ({
        ...t,
        pending: false,
        error: err instanceof Error ? err.message : 'Something went wrong',
      })),
    );
  }, [update]);

  const ask = useCallback((key: string, quote: string, question: string) => {
    setOpenKey(key);
    send(key, quote, question);
  }, [send]);

  const close = useCallback(() => setOpenKey(null), []);

  const thread = openKey ? threads[openKey] ?? null : null;
  return { openKey, thread, ask, send, close };
}
