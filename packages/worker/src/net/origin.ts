/**
 * Whether a request from a browser page may open a connection or make a room (ADR 11).
 *
 * A browser always sends `Origin` on a WebSocket upgrade and on a cross-site `POST`, so a request
 * with the header is checked and one without it (a script, a test client) is let through: the
 * check exists to stop other websites using a visitor's browser. The server's own origin always
 * passes, which is the case when the page came from this server; any other origin must be listed.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (origin === undefined) return true;
  if (allowedOrigins.includes(origin)) return true;
  return host !== undefined && hostOf(origin) === host;
}

/** The `host:port` part of an origin such as `http://localhost:8787`, or undefined if it is not one. */
function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    // An Origin header that is not a URL (it can be the text "null") is never the server's own.
    return undefined;
  }
}
