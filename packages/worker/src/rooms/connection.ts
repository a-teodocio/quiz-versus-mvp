/**
 * The room's view of one player's socket: it can send a line of text and close. Rooms know
 * nothing of `ws`, so they are tested with plain fakes and the socket layer is tested on its own.
 */
export interface Connection {
  /** Sends one text frame. Does nothing if the socket has already closed. */
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** WebSocket close codes the server uses. 4000 to 4999 are free for applications. */
export const CLOSE_NORMAL = 1000;
export const CLOSE_POLICY = 1008;
/** The seat was taken over by a newer connection (a resume from another tab or after a drop). */
export const CLOSE_REPLACED = 4001;
