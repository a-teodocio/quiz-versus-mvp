import type { ErrorCode, ServerMessage } from '@quiz-versus/protocol';

/** Who gets a message. `caller` is the connection that caused the event. */
export type Recipient =
  | { readonly kind: 'caller' }
  | { readonly kind: 'player'; readonly playerId: string }
  | { readonly kind: 'everyone' };

/** What the adapter must do after an event. The state machine only describes it. */
export type Effect =
  | { readonly type: 'send'; readonly to: Recipient; readonly message: ServerMessage }
  /** Wake the room at this time (epoch ms). Replaces any earlier timer. */
  | { readonly type: 'setTimer'; readonly at: number }
  | { readonly type: 'clearTimer' }
  /** Nobody is left in the room; the adapter may discard it. */
  | { readonly type: 'closeRoom' };

export const toCaller: Recipient = { kind: 'caller' };
export const toEveryone: Recipient = { kind: 'everyone' };

export const send = (to: Recipient, message: ServerMessage): Effect => ({
  type: 'send',
  to,
  message,
});

/** The effect that refuses a request. */
export const refuse = (code: ErrorCode, message: string): Effect =>
  send(toCaller, { type: 'error', code, message });
