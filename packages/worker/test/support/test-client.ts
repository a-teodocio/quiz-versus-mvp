import WebSocket from 'ws';
import type { ClientOptions } from 'ws';
import { decodeServerMessage, PROTOCOL_VERSION } from '@quiz-versus/protocol';
import type { ClientMessage, ServerMessage } from '@quiz-versus/protocol';

/** Why an upgrade did not happen: the HTTP status the server answered with. */
export class UpgradeRefused extends Error {
  constructor(readonly status: number) {
    super(`the server refused the upgrade with status ${String(status)}`);
  }
}

interface Waiter {
  readonly accepts: (message: ServerMessage) => boolean;
  readonly resolve: (message: ServerMessage) => void;
}

/** A real WebSocket client speaking the protocol, for tests that go through a real socket. */
export class TestClient {
  private readonly queue: ServerMessage[] = [];
  private readonly waiters: Waiter[] = [];
  /** Resolves with the close code when the socket closes. */
  readonly closed: Promise<number>;
  private readonly pingWaiters: (() => void)[] = [];
  playerId = '';
  resumeToken = '';

  private constructor(private readonly socket: WebSocket) {
    this.closed = new Promise((resolve) => {
      socket.on('close', (code) => {
        resolve(code);
      });
    });
    socket.on('ping', () => {
      for (const resolve of this.pingWaiters.splice(0)) resolve();
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const decoded = decodeServerMessage(Buffer.from(data as Buffer).toString('utf8'));
      if (!decoded.ok) throw new Error(`the server sent something invalid: ${decoded.detail}`);
      this.deliver(decoded.message);
    });
  }

  /** Opens a socket. Rejects with `UpgradeRefused` when the server answers with an HTTP error. */
  static connect(url: string, options: ClientOptions = {}): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, options);
      socket.once('unexpected-response', (_request, response) => {
        reject(new UpgradeRefused(response.statusCode ?? 0));
        response.resume();
      });
      socket.once('error', () => undefined);
      socket.once('open', () => {
        resolve(new TestClient(socket));
      });
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  sendText(text: string): void {
    this.socket.send(text);
  }

  sendBinary(bytes: Uint8Array): void {
    this.socket.send(bytes, { binary: true });
  }

  /** Joins the room and waits for the welcome. */
  async join(name: string, resumeToken?: string): Promise<void> {
    this.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name,
      ...(resumeToken === undefined ? {} : { resumeToken }),
    });
    const welcome = await this.next('welcome');
    this.playerId = welcome.playerId;
    this.resumeToken = welcome.resumeToken;
  }

  /** The next message of this type, whether it already arrived or not. Others stay queued. */
  next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    return this.take((message) => message.type === type) as Promise<
      Extract<ServerMessage, { type: T }>
    >;
  }

  /** The next message of any of these types, whichever comes first. */
  nextAny(types: readonly ServerMessage['type'][]): Promise<ServerMessage> {
    return this.take((message) => types.includes(message.type));
  }

  private take(accepts: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const queued = this.queue.findIndex(accepts);
    const found = queued >= 0 ? this.queue.splice(queued, 1)[0] : undefined;
    if (found !== undefined) return Promise.resolve(found);
    return new Promise((resolve) => {
      this.waiters.push({ accepts, resolve });
    });
  }

  /** The next `room` message in which the predicate holds (earlier ones are dropped). */
  async nextRoom(
    holds: (room: Extract<ServerMessage, { type: 'room' }>['room']) => boolean,
  ): Promise<Extract<ServerMessage, { type: 'room' }>['room']> {
    for (;;) {
      const { room } = await this.next('room');
      if (holds(room)) return room;
    }
  }

  /** Resolves at the next ping from the server (the pong has been sent by then). */
  nextPing(): Promise<void> {
    return new Promise((resolve) => {
      this.pingWaiters.push(resolve);
    });
  }

  /** Sends a message the server answers with an error, and waits for that answer. */
  async roundTrip(): Promise<void> {
    this.sendText('{}');
    await this.next('error');
  }

  /** Drops the connection without a goodbye, as a phone losing signal would. */
  drop(): void {
    this.socket.terminate();
  }

  close(): void {
    this.socket.close();
  }

  private deliver(message: ServerMessage): void {
    const waiting = this.waiters.findIndex((waiter) => waiter.accepts(message));
    if (waiting >= 0) this.waiters.splice(waiting, 1)[0]?.resolve(message);
    else this.queue.push(message);
  }
}
