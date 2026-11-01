/**
 * Every bound the schemas enforce, in one place (review-checklist D4 and G4). The worker and the
 * web client read these constants instead of repeating the numbers.
 *
 * Units: message sizes are UTF-8 bytes, the player name is counted in characters (code points, so
 * an emoji is 1), and every other text limit is counted in UTF-16 units (an emoji is 2).
 */

/** Answer options per multiple-choice question; the real app's validator requires exactly 4. */
export const OPTION_COUNT = 4;

/** Largest accepted client message, in UTF-8 bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 2_048;
/** Largest server message, in UTF-8 bytes. Sized for a full reveal with every text at its maximum. */
export const MAX_SERVER_MESSAGE_BYTES = 65_536;

/**
 * Players in one room. Provisional (docs/roadmap.md, decisions): the mock's rooms are small, and
 * a single constant makes the number cheap to change.
 */
export const MAX_PLAYERS_PER_ROOM = 8;

export const PLAYER_NAME_MAX_LENGTH = 24;
export const TYPED_ANSWER_MAX_LENGTH = 200;

export const MAX_QUIZZES_PER_GAME = 10;
export const MAX_QUESTIONS_PER_GAME = 100;
export const MIN_SECONDS_PER_QUESTION = 5;
export const MAX_SECONDS_PER_QUESTION = 120;

export const MAX_QUIZ_ID_LENGTH = 64;
export const MAX_ITEM_KEY_LENGTH = 128;
export const MAX_PROMPT_LENGTH = 2_000;
export const MAX_OPTION_LENGTH = 500;
export const MAX_EXPLANATION_LENGTH = 2_000;
export const MAX_IMAGE_URL_LENGTH = 512;
export const MAX_ERROR_MESSAGE_LENGTH = 200;
export const MAX_ACCEPTED_FORMS = 4;

/** Room IDs, player IDs and resume tokens: URL-safe characters only, long enough to be unguessable. */
export const OPAQUE_ID_MIN_LENGTH = 16;
export const OPAQUE_ID_MAX_LENGTH = 64;
