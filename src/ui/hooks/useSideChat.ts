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
  // The answer being streamed per thread, so Stop can end it.
  const streams = useRef(new Map<string, AbortController>());

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
    // The answer shows as it streams: the first chunk adds the assistant
    // message and later ones replace its text. `pending` stays on until the end.
    const setAnswer = (text: string) => update(key, (t) => {
      const last = t.messages[t.messages.length - 1];
      const before = last?.role === 'assistant' ? t.messages.slice(0, -1) : t.messages;
      return { ...t, messages: [...before, { role: 'assistant', text }] };
    });
    const abort = new AbortController();
    streams.current.set(key, abort);
    askSideQuestion({ question, quote, thread: history }, setAnswer, abort.signal).then(
      (reply) => {
        // Stopped before any text: the question stays, with no answer.
        if (reply) setAnswer(reply);
        update(key, (t) => ({ ...t, pending: false }));
      },
      (err: unknown) => update(key, (t) => ({
        ...t,
        pending: false,
        error: err instanceof Error ? err.message : 'Something went wrong',
      })),
    ).finally(() => streams.current.delete(key));
  }, [update]);

  const stop = useCallback((key: string) => streams.current.get(key)?.abort(), []);

  const ask = useCallback((key: string, quote: string, question: string) => {
    setOpenKey(key);
    send(key, quote, question);
  }, [send]);

  const close = useCallback(() => setOpenKey(null), []);

  const thread = openKey ? threads[openKey] ?? null : null;
  return { openKey, thread, ask, send, stop, close };
}
