import { z } from 'zod';
import {
  MAX_COURSE_CODE_LENGTH,
  MAX_QUIZ_LISTINGS,
  MAX_QUIZ_TITLE_LENGTH,
  MAX_SCORED_PARTS_PER_QUIZ,
} from '../limits.js';
import { QuizIdSchema, RoomIdSchema } from '../room/identifiers.js';

/**
 * What the server's plain HTTP routes send (docs/protocol.md, "HTTP routes"). They are not
 * WebSocket messages, so they have their own error codes and do not move `PROTOCOL_VERSION`.
 */

/**
 * The code of an HTTP refusal. A client words these for a player; it never shows the code.
 * `NOT_FOUND`, `METHOD_NOT_ALLOWED` and `INTERNAL_ERROR` are the usual ones; `ORIGIN_NOT_ALLOWED`,
 * `SERVER_FULL` and `TOO_MANY_ROOMS` are the refusals specific to this server.
 */
export const HTTP_ERROR_CODES = [
  'ORIGIN_NOT_ALLOWED',
  'SERVER_FULL',
  'TOO_MANY_ROOMS',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;

export const HttpErrorBodySchema = z.strictObject({ error: z.enum(HTTP_ERROR_CODES) });
/** The body of every HTTP refusal. */
export type HttpErrorBody = z.infer<typeof HttpErrorBodySchema>;
/** One of `HTTP_ERROR_CODES`. */
export type HttpErrorCode = HttpErrorBody['error'];

/** The body of `POST /rooms` when a room was made (`201`). */
export const CreateRoomResponseSchema = z.strictObject({ roomId: RoomIdSchema });
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

/**
 * Characters that can hide or reorder text: controls, surrogates, private use, unassigned, the
 * line and paragraph separators, and the bidirectional overrides and isolates. Joiners (so an
 * emoji sequence) and other format characters are allowed.
 */
const SPOOFING_CHARACTERS = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}؜‎‏‪-‮⁦-⁩]/u;

/**
 * Text a host reads in a list: 1 to `max` characters (code points), not padded with white space,
 * with something visible in it, and none of the characters above.
 */
const displayText = (max: number) =>
  z
    .string()
    .refine(
      (text) =>
        Array.from(text).length >= 1 &&
        Array.from(text).length <= max &&
        text === text.trim() &&
        !SPOOFING_CHARACTERS.test(text),
      { error: `1 to ${String(max)} characters, no hidden or reordering characters, not padded` },
    );

/** A course folder's name as the real app writes it. */
const CourseCodeSchema = displayText(MAX_COURSE_CODE_LENGTH);

/** A quiz's title, shown to the player picking it. Characters, not bytes. */
const QuizTitleSchema = displayText(MAX_QUIZ_TITLE_LENGTH);

/**
 * One quiz a host can pick. `scoredParts` counts what a game scores, as the real page does: a
 * picture group counts once per part, so it is not the number of entries in the file.
 */
export const QuizListingSchema = z.strictObject({
  id: QuizIdSchema,
  course: CourseCodeSchema,
  title: QuizTitleSchema,
  scoredParts: z.number().int().min(1).max(MAX_SCORED_PARTS_PER_QUIZ),
});
export type QuizListing = z.infer<typeof QuizListingSchema>;

/** The body of `GET /quizzes`: the quizzes that can be played, sorted by course and then id. */
export const QuizListResponseSchema = z.strictObject({
  quizzes: z.array(QuizListingSchema).max(MAX_QUIZ_LISTINGS),
});
export type QuizListResponse = z.infer<typeof QuizListResponseSchema>;

/** True when the value is a quiz listing the protocol allows, so a server can filter without zod. */
export const isQuizListing = (value: unknown): value is QuizListing =>
  QuizListingSchema.safeParse(value).success;
