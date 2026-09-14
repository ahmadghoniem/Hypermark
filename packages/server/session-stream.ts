/**
 * Session stream broadcaster — the server side of
 * @hypermark/shared/session-stream. One instance per server; every connected
 * `/api/session/stream` tab is a session in `sessions`, and
 * `announceSessionEnded` fans a single event out to all of them at once
 * (normally there is exactly one tab, but nothing here assumes that).
 *
 * Deliberately separate from the annotate client-lease tracker
 * (packages/shared/annotate-client-lease.ts): that one *detects* tab
 * abandonment by counting connections; this one only *announces* — the
 * parent watcher (./parent-watch.ts) decides when the session has ended.
 */

import {
  SESSION_ENDED_EVENT,
  SESSION_STREAM_HEARTBEAT_COMMENT,
  SESSION_STREAM_HEARTBEAT_MS,
  SESSION_STREAM_READY_COMMENT,
} from "@hypermark/shared/session-stream";

interface SessionStreamSession {
  write: (chunk: string) => void;
  close: () => void;
}

export interface SessionStreamBroadcaster {
  /** Build the `Response` for a `GET /api/session/stream` request. */
  handleRequest: () => Response;
  /** Fan out a `sessionEnded` event to every connected session. */
  announceSessionEnded: () => void;
  /** Close every open session — called from a server's own `stop()`. */
  closeSessions: () => void;
}

export function createSessionStreamBroadcaster(): SessionStreamBroadcaster {
  const sessions = new Set<SessionStreamSession>();

  function handleRequest(): Response {
    const encoder = new TextEncoder();
    let session: SessionStreamSession | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        session = {
          write,
          close: () => {
            if (!session) return;
            const self = session;
            session = null;
            if (heartbeat !== null) clearInterval(heartbeat);
            sessions.delete(self);
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
        };
        sessions.add(session);
        try {
          write(SESSION_STREAM_READY_COMMENT);
        } catch {
          session.close();
          return;
        }
        heartbeat = setInterval(() => {
          try {
            write(SESSION_STREAM_HEARTBEAT_COMMENT);
          } catch {
            session?.close();
          }
        }, SESSION_STREAM_HEARTBEAT_MS);
      },
      cancel() {
        session?.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  function announceSessionEnded(): void {
    for (const session of [...sessions]) {
      try {
        session.write(SESSION_ENDED_EVENT);
      } catch {
        session.close();
      }
    }
  }

  function closeSessions(): void {
    for (const session of [...sessions]) session.close();
  }

  return { handleRequest, announceSessionEnded, closeSessions };
}
