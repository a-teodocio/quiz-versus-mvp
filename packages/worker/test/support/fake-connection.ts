import { decodeServerMessage } from '@quiz-versus/protocol';
import type { ClientMessage, ServerMessage } from '@quiz-versus/protocol';
import type { Connection } from '../../src/rooms/connection.js';
import type { RoomHost } from '../../src/rooms/room-host.js';

/** A socket stand-in that records what the room sends and how it was closed. */
export class FakeConnection implements Connection {
  readonly received: ServerMessage[] = [];
  closedWith: { code: number; reason: string } | undefined;

  send(text: string): void {
    if (this.closedWith !== undefined) return;
    const decoded = decodeServerMessage(text);
    if (!decoded.ok)
      throw new Error(`the room sent something the protocol refuses: ${decoded.detail}`);
    this.received.push(decoded.message);
  }

  close(code: number, reason: string): void {
    this.closedWith ??= { code, reason };
  }

  /** Messages of one type, in the order they arrived. */
  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter(
      (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
    );
  }

  /** The error codes received so far. */
  get errors(): string[] {
    return this.ofType('error').map((message) => message.code);
  }

  /** The last message of a type; fails the test if there is none. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    const found = this.ofType(type).at(-1);
    if (found === undefined) throw new Error(`no "${type}" message was received`);
    return found;
  }

  clear(): void {
    this.received.length = 0;
  }
}

export const say = (room: RoomHost, from: Connection, message: ClientMessage): void => {
  room.receive(from, JSON.stringify(message));
};
