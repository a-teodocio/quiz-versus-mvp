import { z } from 'zod';
import { MAX_ITEM_KEY_LENGTH } from '../limits.js';

/**
 * Identifies one scored item: a standalone question, or one part of an image-group. It is the
 * entry id or the part id, which is what the real app's progress key (`entryKeys()`) uses. The
 * real validator requires an id on every entry and part, so the key's fallbacks (`<group>#<n>`,
 * the question text) never occur for valid quizzes. A client echoes the key in `answer` so a late
 * answer for an earlier question can be told apart and rejected. Ids are unique within one quiz
 * file only, and a game can mix files, so the server must make keys unique across the game
 * (for example by prefixing the quiz id) before relying on them to detect a stale answer.
 */
export const ItemKeySchema = z.string().min(1).max(MAX_ITEM_KEY_LENGTH);
