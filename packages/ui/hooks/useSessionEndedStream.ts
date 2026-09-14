import { useEffect } from "react";
import { SESSION_STREAM_PATH } from "@hypermark/shared/session-stream";

/**
 * Opens `/api/session/stream` while `active` is true and calls
 * `onSessionEnded` the first time the server announces `{ sessionEnded:
 * true }` — the parent watcher (packages/server/parent-watch.ts) detected
 * that the Claude Code process which owns this session has exited.
 *
 * Unlike the annotate client-lease stream (packages/editor/
 * annotateClientLease.ts), which is a pure presence signal read by the
 * server, this stream carries a real message payload the client reads: the
 * server pushes, the client reacts. Both streams can be open on the same tab
 * at once — they answer different questions ("is the tab still here?" vs.
 * "is Claude still here?").
 */
export function useSessionEndedStream(active: boolean, onSessionEnded: () => void): void {
  useEffect(() => {
    if (!active) return;
    if (typeof EventSource === "undefined") return;

    const source = new EventSource(SESSION_STREAM_PATH);
    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.sessionEnded) onSessionEnded();
      } catch {
        // Heartbeat/ready comments carry no `data:` line and never reach
        // onmessage; a malformed payload is simply ignored.
      }
    };

    return () => source.close();
    // onSessionEnded is expected to be referentially stable (useCallback) at
    // call sites, same convention as the client-lease effect it sits beside.
  }, [active, onSessionEnded]);
}
