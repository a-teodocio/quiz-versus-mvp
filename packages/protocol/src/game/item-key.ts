import { z } from 'zod';
import { MAX_ITEM_KEY_LENGTH } from '../limits.js';

/**
 * Identifies one scored item in one game: a standalone question, or one part of an image-group.
 * The server issues it (for example `i12`, or `i12p2` for a part) and keeps its own map from key
 * to the quiz entry or part id. It is not a content id: ids are unique within one quiz file only,
 * and a game can mix files. A client echoes the key in `answer` so a late answer for an earlier
 * question can be told apart and rejected. Plain URL-safe characters keep the client message
 * size predictable.
 */
export const ItemKeySchema = z
  .string()
  .min(1)
  .max(MAX_ITEM_KEY_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);
