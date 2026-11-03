// Tests for scripts/web-dev-server.mjs: the port of the real app's quiz API (quiz.py v1.55.0).
// The expected values follow quiz.py's own rules (entry_keys, unit_group, unit_chapter, the
// refusals in do_GET); the content is the repo's fake content or a made-up folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHandler,
  entryKeys,
  groupRank,
  resolveImagePath,
  unitChapter,
  unitGroup,
} from './web-dev-server.mjs';

const { fetch } = globalThis;

describe('entryKeys', () => {
  it('uses the id of a plain entry, else its question text', () => {
    expect(entryKeys({ type: 'text', id: 'a1', question: 'Q?' })).toEqual(['a1']);
    expect(entryKeys({ type: 'text', question: 'Q?' })).toEqual(['Q?']);
  });

  it('gives each part of a group its own id, else groupId#index', () => {
    const group = { type: 'image-group', id: 'g1', parts: [{ id: 'p1' }, {}, { id: '' }] };
    expect(entryKeys(group)).toEqual(['p1', 'g1#1', 'g1#2']);
  });

  it('writes a missing id as the page does (the word undefined)', () => {
    expect(entryKeys({ type: 'image-group', parts: [{}] })).toEqual(['undefined#0']);
    expect(entryKeys({ type: 'text' })).toEqual(['undefined']);
  });

  it('gives nothing for a value that is not an object', () => {
    expect(entryKeys(null)).toEqual([]);
    expect(entryKeys('text')).toEqual([]);
  });
});

describe('unit groups and chapters', () => {
  it('takes the top-level group when it is a short, non-blank string', () => {
    expect(unitGroup('x-w1-y.json', '  Starter pack ')).toEqual({
      group: 'Starter pack',
      rank: 1000,
    });
    const tooLong = 'x'.repeat(31);
    expect(unitGroup('x-w1-y.json', tooLong).group).toBe('Week 1');
    expect(unitGroup('x-w1-y.json', '   ').group).toBe('Week 1');
  });

  it('reads the week from the file name, else Other', () => {
    expect(unitGroup('birds-w03-calls.json', null)).toEqual({ group: 'Week 3', rank: 3 });
    expect(unitGroup('W2_calls.json', undefined).group).toBe('Week 2');
    expect(unitGroup('birds-notes.json', null)).toEqual({ group: 'Other', rank: 2000 });
  });

  it('ranks by the trailing number, 1000 without one, Other last', () => {
    expect(groupRank('Chapter 12')).toBe(12);
    expect(groupRank('Starter pack')).toBe(1000);
    expect(groupRank('Other')).toBe(2000);
  });

  it('reads the chapter from the file name', () => {
    expect(unitChapter('birds-ch2-field-notes.json')).toBe('ch2');
    expect(unitChapter('birds-CH02-x.json')).toBe('ch2');
    expect(unitChapter('birds-w1-plumage.json')).toBeNull();
  });
});

describe('resolveImagePath', () => {
  const dir = join(tmpdir(), 'quiz-versus-no-such-content');

  it('refuses absolute paths, drive letters and a way out of the images folder', () => {
    expect(resolveImagePath(dir, '/etc/x.png')).toHaveProperty('problem');
    expect(resolveImagePath(dir, 'C:/x.png')).toHaveProperty('problem');
    expect(resolveImagePath(dir, 'images/../quizzes/courses.json')).toHaveProperty('problem');
    expect(resolveImagePath(dir, 'images\\..\\..\\x.png')).toHaveProperty('problem');
    expect(resolveImagePath(dir, 'images/a\0.png')).toHaveProperty('problem');
  });

  it('accepts a path inside images, in any letter case, and leaves other roots missing', () => {
    expect(resolveImagePath(dir, 'Images/demo/a.png')).toHaveProperty('path');
    expect(resolveImagePath(dir, 'review slide images/a.png')).toEqual({ missing: true });
  });
});

describe('the server', () => {
  let base = '';
  let close = () => undefined;
  let tmp = '';
  let tmpBase = '';
  let closeTmp = () => undefined;

  const listen = (handler) =>
    new Promise((resolveListen) => {
      const server = createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolveListen({ url: `http://127.0.0.1:${port}`, stop: () => server.close() });
      });
    });

  beforeAll(async () => {
    const fake = await listen(createHandler());
    base = fake.url;
    close = fake.stop;

    tmp = mkdtempSync(join(tmpdir(), 'quiz-versus-api-'));
    const quiz = (n) =>
      JSON.stringify({
        title: `T${n}`,
        questions: [
          {
            type: 'text',
            id: `q${n}`,
            question: 'Q?',
            options: ['a', 'b', 'c', 'd'],
            correct: 0,
            explanation: 'e',
          },
        ],
      });
    for (const course of ['one', 'two', '_hidden', '.dot'])
      mkdirSync(join(tmp, 'quizzes', course), { recursive: true });
    writeFileSync(join(tmp, 'quizzes', 'one', 'same.json'), quiz(1));
    writeFileSync(join(tmp, 'quizzes', 'two', 'same.json'), quiz(2));
    writeFileSync(join(tmp, 'quizzes', 'one', '_skipped.json'), quiz(3));
    writeFileSync(join(tmp, 'quizzes', 'one', 'broken.json'), '{ not json');
    writeFileSync(join(tmp, 'quizzes', '_hidden', 'h.json'), quiz(4));
    writeFileSync(join(tmp, 'quizzes', '.dot', 'd.json'), quiz(5));
    writeFileSync(join(tmp, 'quizzes', 'courses.json'), '[ broken');
    const other = await listen(createHandler({ contentDir: tmp }));
    tmpBase = other.url;
    closeTmp = other.stop;
  });

  afterAll(() => {
    close();
    closeTmp();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('lists the fake quiz files by file name with the fields the page reads', async () => {
    const items = await (await fetch(`${base}/api/list`)).json();
    expect(items.map((i) => i.file)).toEqual([
      'birds-ch2-field-notes.json',
      'birds-w1-plumage.json',
      'birds-w2-calls.json',
      'rocks-w1-identification.json',
      'rocks-w2-lab-methods.json',
    ]);
    const [chapter, starter, week2] = items;
    expect(chapter).toMatchObject({
      course: 'demo-1001',
      chapter: 'ch2',
      group: 'Other',
      group_rank: 2000,
    });
    expect(starter).toMatchObject({ group: 'Starter pack', group_rank: 1000, chapter: null });
    expect(week2).toMatchObject({ group: 'Week 2', group_rank: 2 });
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'chapter',
          'count',
          'course',
          'file',
          'group',
          'group_rank',
          'keys',
          'parts_count',
          'title',
          'unit',
        ].sort(),
      );
      expect(item.parts_count).toBeGreaterThanOrEqual(item.count);
      expect(item.keys).toHaveLength(item.parts_count);
    }
  });

  it('lists the courses in switcher order with their totals', async () => {
    const courses = await (await fetch(`${base}/api/courses`)).json();
    expect(courses.map((c) => [c.code, c.order, c.answer_by, c.registered, c.files])).toEqual([
      ['demo-1001', 1, 'pick', true, 3],
      ['demo-2002', 2, 'type', true, 2],
    ]);
    expect(courses[0]).toMatchObject({ name: 'Imaginary Birds', short: 'birds', archived: false });
  });

  it('serves a quiz file as the file holds it', async () => {
    const response = await fetch(`${base}/api/quiz?file=birds-w1-plumage.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    const quiz = await response.json();
    expect(quiz.questions.length).toBeGreaterThan(0);
  });

  it('refuses a bad quiz request as quiz.py does', async () => {
    const status = async (query) => (await fetch(`${base}/api/quiz${query}`)).status;
    expect(await status('')).toBe(400);
    expect(await status('?file=notes.txt')).toBe(404);
    expect(await status('?file=missing.json')).toBe(404);
    expect(await status('?file=..%2F..%2Fpackage.json')).toBe(404);
    expect(await status('?file=birds-w1-plumage.json&course=demo-2002')).toBe(404);
  });

  it('lists only real quiz files and says so when two courses share a name', async () => {
    const items = await (await fetch(`${tmpBase}/api/list`)).json();
    expect(items.map((i) => `${i.course}/${i.file}`)).toEqual([
      'one/broken.json',
      'one/same.json',
      'two/same.json',
    ]);
    expect(items[0]).toMatchObject({ count: 0, parts_count: 0, keys: [], title: 'broken' });
    expect((await fetch(`${tmpBase}/api/quiz?file=same.json`)).status).toBe(409);
    const one = await (await fetch(`${tmpBase}/api/quiz?file=same.json&course=one`)).json();
    expect(one.title).toBe('T1');
  });

  it('survives a broken course registry: names fall back to the code, courses are unregistered', async () => {
    const courses = await (await fetch(`${tmpBase}/api/courses`)).json();
    expect(courses.map((c) => [c.code, c.name, c.registered, c.order])).toEqual([
      ['one', 'one', false, 9999],
      ['two', 'two', false, 9999],
    ]);
  });

  it('serves pictures from the images folder only', async () => {
    const ok = await fetch(
      `${base}/image?path=${encodeURIComponent('images/demo-1001/nest-eggs.png')}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('cache-control')).toBe('max-age=3600');
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(100);

    const status = async (path) =>
      (await fetch(`${base}/image?path=${encodeURIComponent(path)}`)).status;
    expect(await status('images/demo-1001/none.png')).toBe(404);
    expect(await status('images/demo-1001/nest-eggs.txt')).toBe(400);
    expect(await status('images/../quizzes/courses.json')).toBe(400);
    expect(await status('images/../../x.png')).toBe(400);
    const walk = await fetch(`${base}/image?path=images%252F..%252F..%252Fx.png`);
    expect(walk.status).toBe(400);
    expect(await walk.text()).toContain('Invalid image path');
    expect(await status('../package.json')).toBe(404);
    expect(await status('/etc/passwd')).toBe(400);
    expect((await fetch(`${base}/image`)).status).toBe(400);
  });

  it('serves the page, an empty favicon answer, and 404 for the rest', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await page.text()).toContain('<title>MLS Quiz</title>');
    expect((await fetch(`${base}/favicon.ico`)).status).toBe(204);
    expect((await fetch(`${base}/nothing`)).status).toBe(404);
    expect((await fetch(`${base}/api/list`, { method: 'POST' })).status).toBe(501);
  });
});
