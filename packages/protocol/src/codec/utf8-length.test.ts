import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './utf8-length.js';

describe('utf8ByteLength', () => {
  it.each<[string, string, number]>([
    ['empty text', '', 0],
    ['ASCII', 'quiz', 4],
    ['two-byte letters', 'éüñ', 6],
    ['three-byte symbols', '€李', 6],
    ['a four-byte emoji', '🙂', 4],
    ['mixed widths', 'a é € 🙂', 1 + 1 + 2 + 1 + 3 + 1 + 4],
    ['a lone surrogate, which UTF-8 encoders replace with a 3-byte character', '\ud800', 3],
  ])('counts %s', (_label, text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
  });
});
