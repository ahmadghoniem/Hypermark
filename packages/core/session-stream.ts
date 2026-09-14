/**
 * Session-ended SSE stream — server→client only announcement that the
 * Claude Code process which owns this tab's session has exited.
 *
 * Generalizes `ANNOTATE_CLIENT_LEASE_STREAM_PATH` (packages/shared/
 * annotate-client-lease.ts) for the plan and review servers, which have no
 * client-lease of their own: that stream detects the *tab* going away, this
 * one detects the *parent Claude Code process* going away (see
 * packages/server/parent-watch.ts). The annotate server opens both — the
 * lease dismisses its gate on tab abandonment, this stream tells any open
 * tab that the session it belongs to is over.
 *
 * The client reads a real message payload here (`{ sessionEnded: true }`),
 * unlike the client-lease stream where mere connection presence is the
 * signal — so this module intentionally does not mirror that one's
 * ready/heartbeat comment-only design beyond keeping the connection alive.
 */

/** SSE route path shared by all three Bun servers and their browser clients. */
export const SESSION_STREAM_PATH = "/api/session/stream";

/** First byte written once a session stream is open. */
export const SESSION_STREAM_READY_COMMENT = ": ready\n\n";

/** Keep-alive comment written every heartbeat interval. */
export const SESSION_STREAM_HEARTBEAT_COMMENT = ": heartbeat\n\n";

/** Heartbeat interval for the session stream. */
export const SESSION_STREAM_HEARTBEAT_MS = 5_000;

/** SSE payload announcing that the owning Claude Code session has ended. */
export const SESSION_ENDED_MESSAGE = { sessionEnded: true } as const;

/** Pre-formatted SSE event for `SESSION_ENDED_MESSAGE`. */
export const SESSION_ENDED_EVENT = `data: ${JSON.stringify(SESSION_ENDED_MESSAGE)}\n\n`;
