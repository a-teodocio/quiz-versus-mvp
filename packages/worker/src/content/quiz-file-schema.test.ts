import { describe, expect, it } from 'vitest';
import { ContentError } from './content-error.js';
import { readQuizFile } from './quiz-file-schema.js';

/** The quiz of a file, for the tests that look at nothing else. */
const parseQuizFile = (id: string, file: string, source: string) =>
  readQuizFile(id, file, source).quiz;

const question = (id: string) => ({
  id,
  question: `Question ${id}?`,
  options: ['a', 'b', 'c', 'd'],
  correct: 1,
  explanation: 'Because.',
});

const file = (questions: unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ title: 'T', course: 'C', unit: 'U', questions, ...extra });

describe('parseQuizFile', () => {
  it('reads text, image and image-group entries into core quiz entries', () => {
    const quiz = parseQuizFile(
      'fake-quiz',
      'fake-quiz.json',
      file([
        { type: 'text', ...question('q1') },
        { type: 'image', ...question('q2'), image_path: 'images/c/a.png' },
        {
          type: 'image-group',
          id: 'g1',
          image_path: 'images/c/b.png',
          parts: [question('g1_p1'), question('g1_p2')],
        },
      ]),
    );
    expect(quiz.id).toBe('fake-quiz');
    expect(quiz.entries.map((entry) => entry.type)).toEqual(['text', 'image', 'image-group']);
    expect(quiz.entries[1]).toMatchObject({ image_path: 'images/c/a.png', correct: 1 });
    expect(quiz.entries[2]).toMatchObject({ parts: [{ id: 'g1_p1' }, { id: 'g1_p2' }] });
  });

  it('drops fields it does not read, so they can never reach a client', () => {
    const quiz = parseQuizFile(
      'fake-quiz',
      'fake-quiz.json',
      file([{ type: 'text', ...question('q1'), private_note: 'do not send' }]),
    );
    expect(JSON.stringify(quiz)).not.toContain('private_note');
  });
});

describe('parseQuizFile refusals', () => {
  it.each([
    ['text that is not JSON', '{ not json'],
    ['a file with no questions list', JSON.stringify({ title: 'T' })],
    ['an unknown entry type', file([{ type: 'video', ...question('q1') }])],
    ['options that are not a list', file([{ type: 'text', ...question('q1'), options: 'abcd' }])],
    ['a negative correct index', file([{ type: 'text', ...question('q1'), correct: -1 }])],
    ['a fractional correct index', file([{ type: 'text', ...question('q1'), correct: 0.5 }])],
    ['an image entry with no picture', file([{ type: 'image', ...question('q1') }])],
    [
      'a group with too many parts',
      file([
        {
          type: 'image-group',
          id: 'g',
          image_path: 'images/c/b.png',
          parts: Array.from({ length: 101 }, (_, at) => question(`p${String(at)}`)),
        },
      ]),
    ],
  ])('refuses %s', (_name, source) => {
    expect(() => parseQuizFile('fake-quiz', 'fake-quiz.json', source)).toThrow(ContentError);
  });

  it('names the file in the error and never repeats what the file says', () => {
    const secret = 'SECRET-TEXT-IN-THE-FILE';
    const source = file([{ type: 'text', ...question(secret), correct: 'one' }]);
    try {
      parseQuizFile('fake-quiz', 'fake-quiz.json', source);
      expect.unreachable('the file should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      const failure = error as ContentError;
      expect(failure.file).toBe('fake-quiz.json');
      expect(failure.message).not.toContain(secret);
    }
  });
});
