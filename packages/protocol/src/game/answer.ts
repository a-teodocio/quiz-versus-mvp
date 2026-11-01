import { z } from 'zod';
import { OPTION_COUNT, TYPED_ANSWER_MAX_LENGTH } from '../limits.js';

/**
 * A player's answer. `pick` is the index of the option as the player was shown it (after the
 * shuffle); `type` is the raw typed text, which the server normalises and checks.
 */
export const AnswerSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pick'),
    index: z
      .int()
      .min(0)
      .max(OPTION_COUNT - 1),
  }),
  z.strictObject({ kind: z.literal('type'), text: z.string().min(1).max(TYPED_ANSWER_MAX_LENGTH) }),
]);
export type Answer = z.infer<typeof AnswerSchema>;
