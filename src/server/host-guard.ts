/**
 * Host-header guard against DNS rebinding.
 *
 * Every session binds loopback, but a page on another site can point its own
 * hostname at 127.0.0.1 and then read the session's API as same-origin. The
 * browser still sends that hostname in the Host header, so a request is only
 * served when Host names a loopback address (any port).
 */

/** Return whether a Host header value (with or without a port) is loopback. */
export function isLoopbackHost(host: string): boolean {
  let name = host.trim().toLowerCase();
  if (name.startsWith("[")) {
    const end = name.indexOf("]");
    if (end === -1) return false;
    return name.slice(1, end) === "::1";
  }
  const colon = name.indexOf(":");
  if (colon !== -1) name = name.slice(0, colon);
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  // 127.0.0.0/8, written as a dotted quad.
  const parts = name.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/** A 403 for a request whose Host is not loopback, otherwise null. */
export function rejectNonLoopbackHost(req: Request): Response | null {
  const host = req.headers.get("host") ?? new URL(req.url).host;
  if (isLoopbackHost(host)) return null;
  return new Response("Forbidden: unexpected Host header", { status: 403 });
}
