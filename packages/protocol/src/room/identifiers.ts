import { z } from 'zod';
import {
  MAX_QUIZ_ID_LENGTH,
  OPAQUE_ID_MAX_LENGTH,
  OPAQUE_ID_MIN_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
} from '../limits.js';

/** URL-safe opaque string: letters, digits, hyphen and underscore (base64url alphabet). */
const opaqueId = z
  .string()
  .min(OPAQUE_ID_MIN_LENGTH)
  .max(OPAQUE_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Names a room. Unguessable; the server generates it (see docs/protocol.md). */
export const RoomIdSchema = opaqueId;
/** Names a player within a room. Public: other players see it. */
export const PlayerIdSchema = opaqueId;
/** Proves a returning player is the same player. Secret: sent only to its owner. */
export const ResumeTokenSchema = opaqueId;

/** A quiz file's id as the real app's registry writes it: lowercase words joined by hyphens. */
export const QuizIdSchema = z
  .string()
  .max(MAX_QUIZ_ID_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Control, format and unassigned characters are rejected so names cannot spoof or hide text. */
const NO_CONTROL_CHARACTERS = /^[^\p{C}]+$/u;

/** A display name: trimmed, 1 to PLAYER_NAME_MAX_LENGTH characters, no control characters. */
export const PlayerNameSchema = z
  .string()
  .trim()
  .regex(NO_CONTROL_CHARACTERS)
  .refine((name) => Array.from(name).length <= PLAYER_NAME_MAX_LENGTH, {
    error: `at most ${String(PLAYER_NAME_MAX_LENGTH)} characters`,
  });
