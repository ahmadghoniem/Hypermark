import { afterEach, describe, expect, test } from 'bun:test';
import { SIDE_CHAT_NOT_CONNECTED, askSideQuestion } from './sideChat';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const QUESTION = { question: 'Why?', quote: 'q', thread: [] };

/** A plain-text response that sends `chunks` one at a time, then fails if `fail` is set. */
function streamed(chunks: string[], fail = false): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else if (fail) controller.error(new Error('cut'));
      else controller.close();
    },
  }));
}

function respondWith(make: (init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((_url: string, init?: RequestInit) => Promise.resolve(make(init))) as typeof fetch;
}

describe('askSideQuestion', () => {
  test('reports the answer so far after each chunk and resolves with the whole answer', async () => {
    respondWith(() => streamed(['Because ', 'of the ', 'peak.']));
    const seen: string[] = [];
    const answer = await askSideQuestion(QUESTION, (text) => seen.push(text));
    expect(seen).toEqual(['Because ', 'Because of the ', 'Because of the peak.']);
    expect(answer).toBe('Because of the peak.');
  });

  test('a 501 means the side chat is not connected', async () => {
    respondWith(() => new Response('{}', { status: 501 }));
    await expect(askSideQuestion(QUESTION)).rejects.toThrow(SIDE_CHAT_NOT_CONNECTED);
  });

  test('an empty answer is an error', async () => {
    respondWith(() => streamed([]));
    await expect(askSideQuestion(QUESTION)).rejects.toThrow('The agent could not answer that');
  });

  test('a stream that fails partway says the answer was cut off', async () => {
    respondWith(() => streamed(['Because '], true));
    await expect(askSideQuestion(QUESTION)).rejects.toThrow('The answer was cut off');
  });

  test('aborting resolves with the text so far', async () => {
    const abort = new AbortController();
    respondWith((init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Because '));
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
      },
    })));
    const answer = askSideQuestion(QUESTION, () => abort.abort(), abort.signal);
    expect(await answer).toBe('Because ');
  });

  test('aborting before the response resolves with no text', async () => {
    const abort = new AbortController();
    abort.abort();
    globalThis.fetch = (() => Promise.reject(new DOMException('Aborted', 'AbortError'))) as unknown as typeof fetch;
    expect(await askSideQuestion(QUESTION, undefined, abort.signal)).toBe('');
  });
});
