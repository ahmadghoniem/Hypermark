export interface SideChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface SideQuestion {
  question: string;
  /** The highlighted text the side conversation is about. */
  quote: string;
  /** Earlier messages of this thread, not including `question`. */
  thread: readonly SideChatMessage[];
}

export const SIDE_CHAT_NOT_CONNECTED = "Side chat isn't connected yet";

/**
 * Asks the agent a side question about a highlight. The answer streams in as
 * plain text: `onText` gets the answer so far after each chunk. Resolves with
 * the whole answer; rejects with a readable message on failure. Aborting
 * `signal` stops the agent and resolves with the answer so far.
 */
export async function askSideQuestion(
  { question, quote, thread }: SideQuestion,
  onText: (answerSoFar: string) => void = () => {},
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/side-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, quote, thread }),
      signal,
    });
  } catch {
    if (signal?.aborted) return '';
    throw new Error("Couldn't reach the agent");
  }
  if (res.status === 501 || res.status === 404) throw new Error(SIDE_CHAT_NOT_CONNECTED);
  if (!res.ok || !res.body) throw new Error('The agent could not answer that');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let answer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += value;
      onText(answer);
    }
  } catch {
    if (signal?.aborted) return answer;
    throw new Error(answer ? 'The answer was cut off' : 'The agent could not answer that');
  }
  if (!answer.trim() && !signal?.aborted) throw new Error('The agent could not answer that');
  return answer;
}
