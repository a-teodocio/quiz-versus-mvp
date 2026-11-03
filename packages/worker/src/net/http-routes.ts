import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  encodeCreateRoomResponse,
  encodeHttpErrorBody,
  encodeQuizListResponse,
  type HttpErrorCode,
  type QuizListing,
} from '@quiz-versus/protocol';
import type { ImageIndex } from '../content/image-index.js';
import type { ImageStore } from '../content/image-store.js';
import type { ServerLogger } from '../ports/server-logger.js';
import type { RoomRegistry } from '../rooms/room-registry.js';
import { isOriginAllowed } from './origin.js';

export interface HttpDeps {
  readonly allowedOrigins: readonly string[];
  readonly registry: RoomRegistry;
  readonly images: ImageIndex;
  /** The quizzes a host can pick, read once at start (`GET /quizzes`). */
  readonly quizzes: readonly QuizListing[];
  readonly imageStore: ImageStore;
  readonly logger: ServerLogger;
}

/** A picture name as core issues it: plain characters only, so nothing in it can be a path. */
const IMAGE_ALIAS = /^\/images\/([A-Za-z0-9_~-]{1,64})$/;
const ROOMS_PATH = '/rooms';
const QUIZZES_PATH = '/quizzes';

/** How long a browser may keep a picture: a name belongs to one game and is never reused. */
const IMAGE_CACHE = 'private, max-age=300';

/** Sends a body the protocol has already encoded and checked. */
function sendJson(
  response: ServerResponse,
  status: number,
  text: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(text);
}

function sendError(
  response: ServerResponse,
  status: number,
  error: HttpErrorCode,
  headers: Record<string, string> = {},
): void {
  sendJson(response, status, encodeHttpErrorBody({ error }), headers);
}

const notFound = (response: ServerResponse): void => {
  sendError(response, 404, 'NOT_FOUND');
};

/** The path of the request, without any query. */
function pathOf(request: IncomingMessage): string {
  return (request.url ?? '/').split('?', 1)[0] ?? '/';
}

/**
 * Checks the `Origin` of a request. A refused one is answered here (`403`) and gives `undefined`;
 * an allowed one gives the headers that let a page on another allowed origin read the answer (the
 * server's own page needs none).
 */
function checkOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  deps: HttpDeps,
): Record<string, string> | undefined {
  const origin = request.headers.origin;
  if (!isOriginAllowed(origin, request.headers.host, deps.allowedOrigins)) {
    sendError(response, 403, 'ORIGIN_NOT_ALLOWED');
    return undefined;
  }
  return origin === undefined ? {} : { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function makeRoom(request: IncomingMessage, response: ServerResponse, deps: HttpDeps): void {
  const cors = checkOrigin(request, response, deps);
  if (cors === undefined) return;
  const created = deps.registry.create(request.socket.remoteAddress ?? 'unknown');
  if (!created.ok) {
    const error = created.reason === 'server-full' ? 'SERVER_FULL' : 'TOO_MANY_ROOMS';
    sendError(response, 503, error, cors);
    return;
  }
  sendJson(response, 201, encodeCreateRoomResponse({ roomId: created.room.roomId }), cors);
}

function sendQuizzes(request: IncomingMessage, response: ServerResponse, deps: HttpDeps): void {
  const cors = checkOrigin(request, response, deps);
  if (cors === undefined) return;
  sendJson(response, 200, encodeQuizListResponse({ quizzes: [...deps.quizzes] }), {
    ...cors,
    'Cache-Control': 'no-cache',
  });
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

/** The one method each route takes, or `undefined` for a path that is not a route. */
function allowedMethod(path: string, alias: string | undefined): 'GET' | 'POST' | undefined {
  if (path === ROOMS_PATH) return 'POST';
  if (path === QUIZZES_PATH || alias !== undefined) return 'GET';
  return undefined;
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: HttpDeps,
): Promise<void> {
  const path = pathOf(request);
  const alias = IMAGE_ALIAS.exec(path)?.[1];
  const allowed = allowedMethod(path, alias);
  if (allowed === undefined) {
    notFound(response);
  } else if (request.method !== allowed) {
    sendError(response, 405, 'METHOD_NOT_ALLOWED', { Allow: allowed });
  } else if (path === ROOMS_PATH) {
    makeRoom(request, response, deps);
  } else if (path === QUIZZES_PATH) {
    sendQuizzes(request, response, deps);
  } else if (alias !== undefined) {
    await sendImage(alias, response, deps);
  }
}

/** The handler for every plain HTTP request. A fault becomes a `500` and a log line, never a crash. */
export function createRequestHandler(
  deps: HttpDeps,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    route(request, response, deps).catch((error: unknown) => {
      deps.logger.error('http.fault', { error: error instanceof Error ? error.name : 'unknown' });
      if (!response.headersSent) sendError(response, 500, 'INTERNAL_ERROR');
      else response.destroy();
    });
  };
}
