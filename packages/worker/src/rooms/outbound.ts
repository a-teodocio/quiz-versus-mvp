import { encodeServerMessage, InvalidOutgoingMessageError } from '@quiz-versus/protocol';
import type { ErrorCode, ServerMessage } from '@quiz-versus/protocol';
import type { ServerLogger } from '../ports/server-logger.js';

/** An `error` message. The text is for display only; clients branch on the code. */
export const errorMessage = (code: ErrorCode, message: string): ServerMessage => ({
  type: 'error',
  code,
  message,
});

/**
 * The text of a message ready to send, or undefined if the protocol refuses it. That is a bug in
 * the server, not in the player, so it is logged (the type only, never the content) and skipped.
 */
export function encodeOrLog(message: ServerMessage, logger: ServerLogger): string | undefined {
  try {
    return encodeServerMessage(message);
  } catch (error) {
    if (!(error instanceof InvalidOutgoingMessageError)) throw error;
    logger.error('message.invalid_outgoing', { type: message.type });
    return undefined;
  }
}

/** Plain words for a message the decoder refused. */
export function decodeFailureText(code: ErrorCode): string {
  switch (code) {
    case 'MESSAGE_TOO_LARGE':
      return 'That message was too large.';
    case 'UNSUPPORTED_VERSION':
      return 'This game is a different version. Reload the page and try again.';
    default:
      return 'That message was not understood.';
  }
}
