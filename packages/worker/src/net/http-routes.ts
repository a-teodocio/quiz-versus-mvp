import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ImageIndex } from '../content/image-index.js';
import type { ImageStore } from '../content/image-store.js';
import type { ServerLogger } from '../ports/server-logger.js';
import type { RoomRegistry } from '../rooms/room-registry.js';
import { isOriginAllowed } from './origin.js';

export interface HttpDeps {
  readonly allowedOrigins: readonly string[];
  readonly registry: RoomRegistry;
  readonly images: ImageIndex;
  readonly imageStore: ImageStore;
  readonly logger: ServerLogger;
}

/** A picture name as core issues it: plain characters only, so nothing in it can be a path. */
const IMAGE_ALIAS = /^\/images\/([A-Za-z0-9_~-]{1,64})$/;
const ROOMS_PATH = '/rooms';

/** How long a browser may keep a picture: a name belongs to one game and is never reused. */
const IMAGE_CACHE = 'private, max-age=300';

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(text);
}

const notFound = (response: ServerResponse): void => {
  sendJson(response, 404, { error: 'NOT_FOUND' });
};

/** The path of the request, without any query. */
function pathOf(request: IncomingMessage): string {
  return (request.url ?? '/').split('?', 1)[0] ?? '/';
}

function makeRoom(request: IncomingMessage, response: ServerResponse, deps: HttpDeps): void {
  const origin = request.headers.origin;
  if (!isOriginAllowed(origin, request.headers.host, deps.allowedOrigins)) {
    sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    return;
  }
  const created = deps.registry.create(request.socket.remoteAddress ?? 'unknown');
  if (!created.ok) {
    sendJson(response, 503, {
      error: created.reason === 'server-full' ? 'SERVER_FULL' : 'TOO_MANY_ROOMS',
    });
    return;
  }
  // A page on another allowed origin may read the answer; the server's own page needs no header.
  const cors =
    origin === undefined ? {} : { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  sendJson(response, 201, { roomId: created.room.roomId }, cors);
}

async function sendImage(alias: string, response: ServerResponse, deps: HttpDeps): Promise<void> {
  const imagePath = deps.images.pathFor(alias);
  const image = imagePath === undefined ? undefined : await deps.imageStore.read(imagePath);
  if (image === undefined) {
    notFound(response);
    return;
  }
  response.writeHead(200, {
    'Content-Type': image.contentType,
    'Content-Length': image.bytes.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': IMAGE_CACHE,
  });
  response.end(image.bytes);
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: HttpDeps,
): Promise<void> {
  const path = pathOf(request);
  const alias = IMAGE_ALIAS.exec(path)?.[1];
  if (path === ROOMS_PATH && request.method === 'POST') {
    makeRoom(request, response, deps);
  } else if (alias !== undefined && request.method === 'GET') {
    await sendImage(alias, response, deps);
  } else if (path === ROOMS_PATH || alias !== undefined) {
    sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: alias ? 'GET' : 'POST' });
  } else {
    notFound(response);
  }
}

/** The handler for every plain HTTP request. A fault becomes a `500` and a log line, never a crash. */
export function createRequestHandler(
  deps: HttpDeps,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    route(request, response, deps).catch((error: unknown) => {
      deps.logger.error('http.fault', { error: error instanceof Error ? error.name : 'unknown' });
      if (!response.headersSent) sendJson(response, 500, { error: 'INTERNAL_ERROR' });
      else response.destroy();
    });
  };
}
