import { randomBytes } from 'node:crypto';
import type { IdSource } from '../ports/id-source.js';

/** 16 random bytes are 128 bits, written as 22 base64url characters (the protocol's minimum is 16). */
const ID_BYTES = 16;

export const cryptoIds: IdSource = {
  next: () => randomBytes(ID_BYTES).toString('base64url'),
};
