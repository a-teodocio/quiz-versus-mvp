// Public API of @quiz-versus/protocol. Everything else in this package is internal.

export { PROTOCOL_VERSION } from './version.js';
export * from './limits.js';
export { ERROR_CODES } from './errors/error-code.js';
export type { ErrorCode } from './errors/error-code.js';

export type { GameSettings } from './room/settings.js';
export type { PlayerSummary, RoomPhase, RoomSnapshot } from './room/snapshot.js';
export type { Answer } from './game/answer.js';
export type { QuestionMessage } from './game/question.js';
export type { RevealMessage } from './game/reveal.js';
export type { ResultsMessage } from './game/results.js';
export type { ClientMessage } from './client/client-message.js';
export type { ServerMessage } from './server/server-message.js';

export { decodeClientMessage, decodeServerMessage } from './codec/decode.js';
export type { DecodeResult } from './codec/decode.js';
export {
  encodeClientMessage,
  encodeServerMessage,
  InvalidOutgoingMessageError,
} from './codec/encode.js';
