import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from '../src/codec/utf8-length.js';
import {
  HTTP_ERROR_CODES,
  InvalidOutgoingMessageError,
  MAX_COURSE_CODE_LENGTH,
  MAX_HTTP_BODY_BYTES,
  MAX_QUIZ_ID_LENGTH,
  MAX_QUIZ_LISTINGS,
  MAX_QUIZ_TITLE_LENGTH,
  MAX_SCORED_PARTS_PER_QUIZ,
  OPAQUE_ID_MAX_LENGTH,
  OPAQUE_ID_MIN_LENGTH,
  decodeCreateRoomResponse,
  decodeHttpErrorBody,
  decodeQuizListResponse,
  encodeCreateRoomResponse,
  encodeHttpErrorBody,
  encodeQuizListResponse,
  isQuizListing,
  type QuizListing,
} from '../src/index.js';

const listing: QuizListing = {
  id: 'birds-w1-plumage',
  course: 'demo-1001',
  title: 'Imaginary Birds: Plumage',
  scoredParts: 8,
};

/** The largest listing the limits allow, written with the widest characters, to size the list. */
const WIDEST: QuizListing = {
  id: 'a'.repeat(MAX_QUIZ_ID_LENGTH),
  course: '\u{1F426}'.repeat(MAX_COURSE_CODE_LENGTH),
  title: '\u{1F426}'.repeat(MAX_QUIZ_TITLE_LENGTH),
  scoredParts: MAX_SCORED_PARTS_PER_QUIZ,
};

describe('the room made by POST /rooms', () => {
  const roomId = 'A'.repeat(OPAQUE_ID_MIN_LENGTH);

  it('round-trips an id the protocol accepts', () => {
    const text = encodeCreateRoomResponse({ roomId });
    expect(JSON.parse(text)).toEqual({ roomId });
    expect(decodeCreateRoomResponse(text)).toEqual({ ok: true, message: { roomId } });
  });

  it('refuses an id that is too short, too long or not URL-safe, and any extra field', () => {
    for (const bad of [
      'A'.repeat(OPAQUE_ID_MIN_LENGTH - 1),
      'A'.repeat(OPAQUE_ID_MAX_LENGTH + 1),
      `${'A'.repeat(OPAQUE_ID_MIN_LENGTH)}/`,
    ]) {
      expect(decodeCreateRoomResponse(JSON.stringify({ roomId: bad })).ok, bad).toBe(false);
      expect(() => encodeCreateRoomResponse({ roomId: bad })).toThrow(InvalidOutgoingMessageError);
    }
    expect(decodeCreateRoomResponse(JSON.stringify({ roomId, extra: 1 })).ok).toBe(false);
  });
});

describe('an HTTP refusal', () => {
  it.each(HTTP_ERROR_CODES)('round-trips %s', (error) => {
    const text = encodeHttpErrorBody({ error });
    expect(decodeHttpErrorBody(text)).toEqual({ ok: true, message: { error } });
  });

  it('refuses a code it does not know, a WebSocket error code, and any extra field', () => {
    expect(decodeHttpErrorBody('{"error":"SOMETHING_ELSE"}').ok).toBe(false);
    expect(decodeHttpErrorBody('{"error":"ROOM_NOT_FOUND"}').ok).toBe(false);
    expect(decodeHttpErrorBody('{"error":"NOT_FOUND","detail":"x"}').ok).toBe(false);
  });
});

describe('the quiz list made by GET /quizzes', () => {
  it('round-trips a list, and an empty one', () => {
    for (const quizzes of [[listing], []]) {
      const text = encodeQuizListResponse({ quizzes });
      expect(decodeQuizListResponse(text)).toEqual({ ok: true, message: { quizzes } });
    }
  });

  it.each<[string, Partial<Record<keyof QuizListing, unknown>>]>([
    ['an id that is not a quiz id', { id: 'Birds_W1' }],
    ['an empty course', { course: '' }],
    ['a course with a control character', { course: 'demo\n1001' }],
    ['a course over the maximum length', { course: 'c'.repeat(MAX_COURSE_CODE_LENGTH + 1) }],
    ['an empty title', { title: '' }],
    ['a title with a control character', { title: 'Birds\u0007' }],
    ['a title with a right-to-left override', { title: 'Birds ‮slanoitaler' }],
    ['a title with a line separator', { title: 'Birds Plumage' }],
    ['a title of white space only', { title: '   ' }],
    ['a title with white space around it', { title: ' Birds ' }],
    ['a course with white space around it', { course: 'demo-1001 ' }],
    ['a title over the maximum length', { title: 't'.repeat(MAX_QUIZ_TITLE_LENGTH + 1) }],
    ['no scored parts', { scoredParts: 0 }],
    ['a fractional count', { scoredParts: 1.5 }],
    ['more parts than the maximum', { scoredParts: MAX_SCORED_PARTS_PER_QUIZ + 1 }],
    ['a count that is a string', { scoredParts: '8' }],
  ])('refuses %s', (_name, change) => {
    const bad = { ...listing, ...change };
    expect(isQuizListing(bad)).toBe(false);
    expect(decodeQuizListResponse(JSON.stringify({ quizzes: [bad] })).ok).toBe(false);
    expect(() => encodeQuizListResponse({ quizzes: [bad as QuizListing] })).toThrow(
      InvalidOutgoingMessageError,
    );
  });

  it('refuses a listing with a field it does not define, so nothing else can leak into it', () => {
    const extra = { ...listing, correct: 2 };
    expect(isQuizListing(extra)).toBe(false);
    expect(decodeQuizListResponse(JSON.stringify({ quizzes: [extra] })).ok).toBe(false);
    expect(decodeQuizListResponse(JSON.stringify({ quizzes: [], note: 'x' })).ok).toBe(false);
  });

  it('allows a joined emoji sequence and spaces inside a title', () => {
    const joined = '\u{1F469}‍\u{1F52C} Field notes';
    expect(isQuizListing({ ...listing, title: joined })).toBe(true);
  });

  it('counts a title in characters, so a title of the maximum length in wide characters passes', () => {
    expect(isQuizListing(WIDEST)).toBe(true);
  });

  it('accepts the most quizzes the limit allows, refuses one more', () => {
    const quizzes = Array.from({ length: MAX_QUIZ_LISTINGS }, () => listing);
    expect(decodeQuizListResponse(encodeQuizListResponse({ quizzes })).ok).toBe(true);
    expect(() => encodeQuizListResponse({ quizzes: [...quizzes, listing] })).toThrow(
      InvalidOutgoingMessageError,
    );
  });

  it('keeps the largest list the limits allow under the size limit for an HTTP body', () => {
    const quizzes = Array.from({ length: MAX_QUIZ_LISTINGS }, () => WIDEST);
    const text = encodeQuizListResponse({ quizzes });
    expect(utf8ByteLength(text)).toBeLessThanOrEqual(MAX_HTTP_BODY_BYTES);
    expect(decodeQuizListResponse(text).ok).toBe(true);
  });
});

describe('decoding an HTTP body', () => {
  it('says MALFORMED_MESSAGE for text that is not JSON, and MESSAGE_TOO_LARGE past the limit', () => {
    expect(decodeQuizListResponse('{ nope')).toMatchObject({
      ok: false,
      code: 'MALFORMED_MESSAGE',
    });
    expect(decodeQuizListResponse(' '.repeat(MAX_HTTP_BODY_BYTES + 1))).toMatchObject({
      ok: false,
      code: 'MESSAGE_TOO_LARGE',
    });
  });

  it('does not repeat what the sender wrote in its detail', () => {
    const result = decodeQuizListResponse(
      JSON.stringify({ quizzes: [{ ...listing, title: 'SECRET-TITLE\u0007' }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).not.toContain('SECRET-TITLE');
  });
});
