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

/** Asks the agent a side question about a highlight. Rejects with a readable message on failure. */
export async function askSideQuestion({ question, quote, thread }: SideQuestion): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/side-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, quote, thread }),
    });
  } catch {
    throw new Error("Couldn't reach the agent");
  }
  if (res.status === 501 || res.status === 404) throw new Error(SIDE_CHAT_NOT_CONNECTED);
  if (!res.ok) throw new Error('The agent could not answer that');
  const data = (await res.json().catch(() => null)) as { reply?: unknown } | null;
  if (typeof data?.reply !== 'string') throw new Error('The agent could not answer that');
  return data.reply;
}
