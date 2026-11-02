import type { RawData, WebSocket } from 'ws';
import type { Clock } from '@quiz-versus/core';
import { MAX_MESSAGES_PER_WINDOW, MESSAGE_RATE_WINDOW_MS } from '@quiz-versus/protocol';
import type { ServerLogger } from '../ports/server-logger.js';
import { CLOSE_POLICY } from '../rooms/connection.js';
import type { Connection } from '../rooms/connection.js';
import { encodeOrLog, errorMessage } from '../rooms/outbound.js';
import type { RoomHost } from '../rooms/room-host.js';
import type { Heartbeat } from './heartbeat.js';
import { RateLimiter } from './rate-limiter.js';

export interface SocketDeps {
  readonly clock: Clock;
  readonly logger: ServerLogger;
  readonly heartbeat: Heartbeat;
}

/** The room's view of a `ws` socket: send text, close, and do nothing once it is not open. */
class SocketConnection implements Connection {
  constructor(private readonly socket: WebSocket) {}

  send(text: string): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(text);
  }

  close(code: number, reason: string): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.close(code, reason);
  }
}

function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data as Buffer).toString('utf8');
}

function sendError(
  connection: Connection,
  code: Parameters<typeof errorMessage>[0],
  text: string,
  logger: ServerLogger,
): void {
  const encoded = encodeOrLog(errorMessage(code, text), logger);
  if (encoded !== undefined) connection.send(encoded);
}

/**
 * Connects a socket to a room: counts its messages, turns away binary frames, and hands text
 * to the room. Frames over the size cap never get here: the library closes the connection first.
 */
export function bindSocket(socket: WebSocket, room: RoomHost, deps: SocketDeps): void {
  const connection = new SocketConnection(socket);
  const limiter = new RateLimiter(deps.clock, MESSAGE_RATE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);
  room.attach(connection);
  deps.heartbeat.watch(socket);
  socket.on('message', (data, isBinary) => {
    const verdict = limiter.hit();
    if (verdict === 'abusive') {
      connection.close(CLOSE_POLICY, 'too many messages');
    } else if (verdict === 'limited') {
      sendError(connection, 'RATE_LIMITED', 'You are sending messages too fast.', deps.logger);
    } else if (isBinary) {
      sendError(connection, 'MALFORMED_MESSAGE', 'Only text messages are accepted.', deps.logger);
    } else {
      room.receive(connection, textOf(data));
    }
  });
  socket.on('close', () => {
    room.detach(connection);
  });
  socket.on('error', (error: NodeJS.ErrnoException) => {
    // Includes a frame over the size cap; the library closes the socket after this.
    deps.logger.info('socket.error', { code: error.code ?? 'unknown' });
  });
}

/** A connection to a room that does not exist: say so in the protocol, then close. */
export function refuseUnknownRoom(socket: WebSocket, logger: ServerLogger): void {
  const connection = new SocketConnection(socket);
  sendError(connection, 'ROOM_NOT_FOUND', 'That room does not exist or has closed.', logger);
  connection.close(CLOSE_POLICY, 'no such room');
  socket.on('error', () => undefined);
}
