import { z } from 'zod';
import { MAX_ITEM_KEY_LENGTH } from '../limits.js';

/**
 * Identifies one scored item: a standalone question, or one part of an image-group. Same meaning
 * as the real app's progress key (`entryKeys()`): the part id, or the entry id. A client echoes it
 * in `answer` so a late answer for an earlier question can be told apart and rejected.
 */
export const ItemKeySchema = z.string().min(1).max(MAX_ITEM_KEY_LENGTH);
