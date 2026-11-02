import {
  encodeServerMessage,
  InvalidOutgoingMessageError,
  MAX_QUESTIONS_PER_GAME,
  MAX_SECONDS_PER_QUESTION,
  MIN_SECONDS_PER_QUESTION,
  PLAYER_NAME_MAX_LENGTH,
  TYPED_ANSWER_MAX_LENGTH,
} from '@quiz-versus/protocol';
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

const NOT_UNDERSTOOD = 'That message was not understood.';

/**
 * What to tell a player whose message was refused, in plain words. The decoder's `detail` starts
 * with the field that failed (`name: too_small`), so a bad name, answer or setting gets a message
 * that says what to change, not only that something was wrong.
 */
const FIELD_TEXT: Readonly<Record<string, string>> = {
  name: `Your name must be 1 to ${String(PLAYER_NAME_MAX_LENGTH)} characters, with no control or invisible characters.`,
  settings: `Those game settings are not allowed. Choose 1 to ${String(MAX_QUESTIONS_PER_GAME)} questions and ${String(MIN_SECONDS_PER_QUESTION)} to ${String(MAX_SECONDS_PER_QUESTION)} seconds for each.`,
  'answer.text': `Your answer must be 1 to ${String(TYPED_ANSWER_MAX_LENGTH)} characters.`,
  resumeToken: 'That reconnection code is not valid. Join again as a new player.',
};

/** The sentence for a message the decoder refused: a specific one when the field is known. */
export function decodeFailureText(code: ErrorCode, detail: string): string {
  switch (code) {
    case 'MESSAGE_TOO_LARGE':
      return 'That message was too large.';
    case 'UNSUPPORTED_VERSION':
      return 'This game is a different version. Reload the page and try again.';
    default: {
      const path = detail.split(':', 1)[0] ?? '';
      const known = Object.keys(FIELD_TEXT).find(
        (key) => path === key || path.startsWith(`${key}.`),
      );
      return (known === undefined ? undefined : FIELD_TEXT[known]) ?? NOT_UNDERSTOOD;
    }
  }
}
