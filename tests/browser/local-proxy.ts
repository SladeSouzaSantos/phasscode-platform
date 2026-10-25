import {
  createServer,
  request as requestLoopback,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';

interface LocalDestination {
  port: number;
}

const loopbackOrigin = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/u;
// URL canonicalization omits :80 in redirects. The allowlist must still contain
// an explicitly configured :80 destination before an implicit port can be used.
const loopbackRequest = /^http:\/\/127\.0\.0\.1(?::[1-9]\d{0,4})?(?=\/|\?|$)/u;
const hasForbiddenUrlCharacters = (value: string): boolean =>
  Array.from(value).some(
    (character) =>
      character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\',
  );
const hopByHopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function endToEndHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const forwarded = { ...headers };
  for (const nominated of (headers.connection ?? '').split(','))
    delete forwarded[nominated.trim().toLowerCase()];
  for (const name of hopByHopHeaders) delete forwarded[name];
  return forwarded;
}

/** A browser-test proxy whose outbound addresses come only from fixture configuration. */
export function createLocalProxy(allowedOrigins: readonly string[]): Server {
  // Copy the complete fixture allowlist once. Request input never supplies an
  // outbound hostname, protocol or port, and no DNS resolution is necessary.
  const destinations = new Map<string, LocalDestination>();
  for (const origin of allowedOrigins) {
    const match = loopbackOrigin.exec(origin);
    const port = Number(match?.[1]);
    if (!match || port > 65535)
      throw new Error('O proxy de testes exige origens HTTP explícitas em 127.0.0.1.');
    // URL normalizes the explicit default port (:80) in incoming origins too.
    destinations.set(new URL(origin).origin, { port });
  }
  if (!destinations.size) throw new Error('O proxy de testes exige destinos locais autorizados.');

  const authorizedTarget = (value: string): { url: URL; destination: LocalDestination } | null => {
    if (!loopbackRequest.test(value) || hasForbiddenUrlCharacters(value) || value.includes('#'))
      return null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password)
      return null;
    const destination = destinations.get(url.origin);
    return destination ? { url, destination } : null;
  };

  const server = createServer((request, response) => {
    const target = authorizedTarget(request.url ?? '');
    if (!target) {
      response.writeHead(403).end();
      return;
    }
    const headers = endToEndHeaders(request.headers);
    headers.host = `127.0.0.1:${target.destination.port}`;
    const upstream = requestLoopback(
      {
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: target.destination.port,
        method: request.method ?? 'GET',
        path: target.url.pathname + target.url.search,
        headers,
        // The fixture uses HTTP only. A fresh connection also prevents an
        // externally modified global agent from changing its destination.
        agent: false,
      },
      (received) => {
        if (received.headers.location !== undefined) {
          const location = received.headers.location;
          let redirect: string;
          try {
            const destination = new URL(location, target.url);
            // A fragment is browser-side navigation data, never an HTTP
            // destination. Validate the same pinned origin/path without it.
            destination.hash = '';
            redirect = destination.href;
          } catch {
            received.resume();
            response.writeHead(403).end();
            return;
          }
          // Node's HTTP client never follows redirects. Only pass the local
          // redirects needed by OIDC; each subsequent browser hop is checked
          // again. Do not expose an arbitrary Location to the browser.
          const locationTarget = location.split('#')[0]!;
          if (
            hasForbiddenUrlCharacters(location) ||
            (/^[a-z][a-z\d+.-]*:/iu.test(locationTarget) &&
              !loopbackRequest.test(locationTarget)) ||
            (locationTarget.startsWith('//') && !loopbackRequest.test(`http:${locationTarget}`)) ||
            !authorizedTarget(redirect)
          ) {
            received.resume();
            response.writeHead(403).end();
            return;
          }
        }
        response.writeHead(received.statusCode ?? 502, endToEndHeaders(received.headers));
        received.pipe(response);
      },
    );
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.once('aborted', () => upstream.destroy());
    response.once('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.on('connect', (_request, socket) => {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  });
  return server;
}
