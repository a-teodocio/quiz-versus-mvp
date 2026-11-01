import { z } from 'zod';

/** Stable error codes. Clients branch on these; the human-readable message is only for display. */
export const ERROR_CODES = [
  'MALFORMED_MESSAGE',
  'MESSAGE_TOO_LARGE',
  'UNSUPPORTED_VERSION',
  'NOT_JOINED',
  'ALREADY_JOINED',
  'INVALID_RESUME_TOKEN',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'GAME_OVER',
  'NOT_IN_TIEBREAK',
  'NOT_HOST',
  'WRONG_PHASE',
  'INVALID_SETTINGS',
  'STALE_QUESTION',
  'ALREADY_ANSWERED',
  'INVALID_ANSWER',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
