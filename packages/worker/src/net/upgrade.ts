import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import { isOriginAllowed } from './origin.js';
import { bindSocket, refuseUnknownRoom } from './socket-binding.js';
import type { SocketDeps } from './socket-binding.js';
import type { RoomRegistry } from '../rooms/room-registry.js';

export interface UpgradeDeps extends SocketDeps {
  readonly allowedOrigins: readonly string[];
  readonly registry: RoomRegistry;
  readonly sockets: WebSocketServer;
}

/** `/rooms/<id>` with an id of the shape the server makes: URL-safe characters, never a path. */
const ROOM_PATH = /^\/rooms\/([A-Za-z0-9_-]{16,64})$/;

/** Answers a refused upgrade as plain HTTP, then drops the connection. */
function refuse(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Handles `GET /rooms/<id>` with an upgrade request. A bad origin or a path that is not a room
 * path is refused before the upgrade. A room id that matches nothing still completes the upgrade,
 * so the client can read `ROOM_NOT_FOUND` as a protocol message instead of a bare HTTP error.
 */
export function handleUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  deps: UpgradeDeps,
): void {
  const path = (request.url ?? '').split('?', 1)[0] ?? '';
  const roomId = ROOM_PATH.exec(path)?.[1];
  if (roomId === undefined) {
    refuse(socket, '404 Not Found');
  } else if (!isOriginAllowed(request.headers.origin, request.headers.host, deps.allowedOrigins)) {
    refuse(socket, '403 Forbidden');
  } else {
    deps.sockets.handleUpgrade(request, socket, head, (webSocket) => {
      const room = deps.registry.find(roomId);
      if (room === undefined) refuseUnknownRoom(webSocket, deps.logger);
      else bindSocket(webSocket, room, deps);
    });
  }
}
