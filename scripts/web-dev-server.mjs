// `npm run web:dev`: serves the forked quiz page and the real app's read-only quiz API over the
// fake content in `content/`, so the page runs with nothing else installed.
//
// This is a port of the HTTP side of the real app's `quiz.py` (v1.55.0): the same five routes,
// the same JSON shapes, the same listing and grouping rules, the same refusals. The differences
// are recorded in docs/fidelity.md ("Quiz API for the forked page"). It replaces nothing in the
// game server: the page is served by the game server itself once the client is built (roadmap
// step 7).
//
//   node scripts/web-dev-server.mjs          (PORT=3101 by default, 127.0.0.1 only)
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { argv, env, stderr, stdout } from 'node:process';
import { URL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const DEFAULT_PORT = 3101;
const UNREGISTERED_ORDER = 9999;
const GROUP_MAX_LEN = 30;
const ANSWER_MODES = ['pick', 'type'];
const IMAGE_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.tif', 'image/tiff'],
  ['.tiff', 'image/tiff'],
]);

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What JavaScript makes of a value in a string concatenation: `undefined` for a missing id. */
const jsText = (value) => (value === undefined || value === null ? 'undefined' : String(value));

/** Progress keys of one quiz entry. Must match `entryKeys()` in the page and `entry_keys()` in quiz.py. */
export function entryKeys(q) {
  if (!isPlainObject(q)) return [];
  if (q.type === 'image-group') {
    const parts = Array.isArray(q.parts) ? q.parts : [];
    return parts.map((p, i) =>
      jsText((isPlainObject(p) ? p.id : undefined) || `${jsText(q.id)}#${i}`),
    );
  }
  return [jsText(q.id || q.question)];
}

/** Sort rank of a unit group: the number at the end of "Week 3", else 1000; "Other" last. */
export function groupRank(label) {
  if (label === 'Other') return 2000;
  const match = /^\D.*?\s(\d+)$/s.exec(label);
  return match ? Number(match[1]) : 1000;
}

/** `{ group, rank }` for the unit tabs: a valid top-level "group", else "Week N" from `-wN-` in the name, else "Other". */
export function unitGroup(fileName, override) {
  let label;
  if (
    typeof override === 'string' &&
    override.trim() !== '' &&
    override.trim().length <= GROUP_MAX_LEN
  ) {
    label = override.trim();
  } else {
    const week = /(?:^|[-_])w(\d+)[-_]/i.exec(fileName);
    label = week ? `Week ${Number(week[1])}` : 'Other';
  }
  return { group: label, rank: groupRank(label) };
}

/** `chNN` from `-chNN-` in the file name, else null. */
export function unitChapter(fileName) {
  const match = /(?:^|[-_])ch(\d+)[-_]/i.exec(fileName);
  return match ? `ch${Number(match[1])}` : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every quiz file as `{ course, path, name }`: quizzes/<course>/*.json, one level down, "_" and "." skipped. */
export function listQuizFiles(contentDir) {
  const quizzes = join(contentDir, 'quizzes');
  const found = [];
  let courses;
  try {
    courses = readdirSync(quizzes, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
  } catch {
    return found;
  }
  for (const entry of courses) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const names = readdirSync(join(quizzes, entry.name))
      .filter((n) => n.endsWith('.json') && !n.startsWith('_'))
      .sort();
    for (const name of names)
      found.push({ course: entry.name, path: join(quizzes, entry.name, name), name });
  }
  return found.sort((a, b) =>
    a.name === b.name ? (a.course < b.course ? -1 : 1) : a.name < b.name ? -1 : 1,
  );
}

function parseSummary(path, name) {
  const summary = {
    title: name.replace(/\.json$/, ''),
    unit: '',
    count: 0,
    parts_count: 0,
    keys: [],
    group: null,
  };
  try {
    const data = readJson(path);
    const questions = data.questions ?? [];
    summary.title = data.title ?? summary.title;
    summary.unit = data.unit ?? '';
    summary.count = questions.length;
    summary.parts_count = questions.reduce(
      (sum, q) => sum + (q.type === 'image-group' ? (q.parts ?? []).length : 1),
      0,
    );
    summary.keys = questions.flatMap(entryKeys);
    summary.group = data.group ?? null;
  } catch {
    return { title: summary.title, unit: '', count: 0, parts_count: 0, keys: [], group: null };
  }
  return summary;
}

/** The `/api/list` items. */
export function quizIndex(contentDir) {
  return listQuizFiles(contentDir).map(({ course, path, name }) => {
    const summary = parseSummary(path, name);
    const { group, rank } = unitGroup(name, summary.group);
    return {
      file: name,
      course,
      title: summary.title,
      unit: summary.unit,
      group,
      group_rank: rank,
      chapter: unitChapter(name),
      count: summary.count,
      parts_count: summary.parts_count,
      keys: summary.keys,
    };
  });
}

function registryEntry(raw) {
  if (!isPlainObject(raw) || typeof raw.code !== 'string' || raw.code.trim() === '') return null;
  const code = raw.code.trim();
  return {
    code,
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : code,
    short: typeof raw.short === 'string' ? raw.short.trim() : '',
    term: typeof raw.term === 'string' ? raw.term : '',
    archived: raw.archived === true,
    order: Number.isInteger(raw.order) ? raw.order : UNREGISTERED_ORDER,
    answer_by: ANSWER_MODES.includes(raw.answer_by) ? raw.answer_by : 'pick',
  };
}

/** `{ code: entry }` from quizzes/courses.json; a missing or broken file gives `{}`, never an error. */
function loadRegistry(contentDir) {
  const registry = new Map();
  try {
    const data = readJson(join(contentDir, 'quizzes', 'courses.json'));
    if (!Array.isArray(data)) return registry;
    for (const raw of data) {
      const entry = registryEntry(raw);
      if (entry && !registry.has(entry.code)) registry.set(entry.code, entry);
    }
  } catch {
    return registry;
  }
  return registry;
}

/** The `/api/courses` list: every course folder that holds at least one quiz, in switcher order. */
export function courseSummaries(contentDir) {
  const registry = loadRegistry(contentDir);
  const totals = new Map();
  for (const item of quizIndex(contentDir)) {
    const counts = totals.get(item.course) ?? [0, 0];
    counts[0] += 1;
    counts[1] += item.parts_count;
    totals.set(item.course, counts);
  }
  const courses = [];
  for (const [code, [files, questions]] of totals) {
    const entry = registry.get(code) ?? registryEntry({ code });
    courses.push({
      code,
      name: entry.name,
      short: entry.short,
      term: entry.term,
      archived: entry.archived,
      order: entry.order,
      registered: registry.has(code),
      answer_by: entry.answer_by,
      files,
      questions,
    });
  }
  return courses.sort(
    (a, b) => a.order - b.order || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}

/** Python's `urllib.parse.unquote`: percent escapes are decoded, a malformed one stays as it is. */
function unquote(text) {
  return text.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/** `{ path }` inside the images folder, or `{ problem }`: absolute paths and ".." cannot get out. The check is on the written path, not on links followed (the fake content has none). */
export function resolveImagePath(contentDir, imagePath) {
  const norm = imagePath.replaceAll('\\', '/');
  if (norm.includes('\0') || norm.startsWith('/') || (norm.length > 1 && norm[1] === ':')) {
    return { problem: 'absolute paths are not allowed' };
  }
  if (norm.split('/', 1)[0]?.toLowerCase() !== 'images') {
    // The real app reads any other first segment from a sibling "course content" folder, which the mock does not have.
    return { missing: true };
  }
  const root = resolve(contentDir, 'images');
  const path = resolve(root, ...norm.split('/').slice(1));
  if (!path.startsWith(root + sep)) return { problem: 'path escapes the images folder' };
  return { path };
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

function sendError(res, status, message) {
  send(res, status, { 'Content-Type': 'text/html; charset=utf-8' }, `${status} ${message}`);
}

function sendJson(res, data) {
  send(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(data));
}

/**
 * The request handler: `GET /` (the page) and its `/css/*.css` and `/js/*.js` files, `/api/list`, `/api/courses`, `/api/quiz?file=&course=`,
 * `/image?path=` and `/favicon.ico`. Anything else is 404.
 */
export function createHandler({
  contentDir = join(ROOT, 'content'),
  pagePath = join(ROOT, 'packages', 'web', 'public', 'index.html'),
} = {}) {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET') {
      sendError(res, 501, 'Unsupported method');
      return;
    }
    switch (url.pathname) {
      case '/': {
        try {
          send(
            res,
            200,
            { 'Content-Type': 'text/html; charset=utf-8' },
            readFileSync(pagePath, 'utf8'),
          );
        } catch (error) {
          send(
            res,
            500,
            { 'Content-Type': 'text/plain; charset=utf-8' },
            `index.html could not be read: ${String(error)}`,
          );
        }
        return;
      }
      case '/api/list':
        sendJson(res, quizIndex(contentDir));
        return;
      case '/api/courses':
        sendJson(res, courseSummaries(contentDir));
        return;
      case '/api/quiz':
        serveQuiz(res, contentDir, url.searchParams.get('file'), url.searchParams.get('course'));
        return;
      case '/image':
        serveImage(res, contentDir, url.searchParams.get('path'));
        return;
      case '/favicon.ico':
        res.writeHead(204);
        res.end();
        return;
      default:
        if (!servePageFile(res, pagePath, url.pathname)) sendError(res, 404, 'Not Found');
    }
  };
}

const PAGE_FILE = /^\/(css|js)\/([a-z0-9-]+)\.(css|js)$/;
const PAGE_FILE_TYPES = new Map([
  ['css', 'text/css; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
]);

/**
 * The stylesheets and scripts the page loads, next to `index.html` in `css/` and `js/`. The name
 * pattern allows no dot or slash, so a request cannot leave those two folders. The real app has
 * one file and no such route (docs/fidelity.md, "The forked page is cut into files").
 */
function servePageFile(res, pagePath, pathname) {
  const match = PAGE_FILE.exec(pathname);
  if (match === null || match[1] !== match[3]) return false;
  try {
    const body = readFileSync(join(dirname(pagePath), match[1], `${match[2]}.${match[3]}`), 'utf8');
    send(res, 200, { 'Content-Type': PAGE_FILE_TYPES.get(match[3]) }, body);
    return true;
  } catch {
    return false;
  }
}

function serveQuiz(res, contentDir, file, course) {
  if (file === null || file === '') {
    sendError(res, 400, 'Missing file parameter');
    return;
  }
  const name = basename(file);
  if (!name.toLowerCase().endsWith('.json')) {
    sendError(res, 404, 'Not a quiz file');
    return;
  }
  const hits = listQuizFiles(contentDir).filter(
    (f) => f.name === name && (course === null || course === '' || f.course === course),
  );
  if (hits.length > 1) {
    sendError(res, 409, 'More than one course has this quiz file; add a course parameter');
    return;
  }
  const hit = hits[0];
  if (hit === undefined) {
    sendError(res, 404, 'Quiz file not found');
    return;
  }
  try {
    sendJson(res, readJson(hit.path));
  } catch (error) {
    sendError(res, 500, String(error));
  }
}

function serveImage(res, contentDir, rawPath) {
  if (rawPath === null || rawPath === '') {
    sendError(res, 400, 'Bad Request');
    return;
  }
  const resolved = resolveImagePath(contentDir, unquote(rawPath));
  if ('problem' in resolved) {
    sendError(res, 400, 'Invalid image path');
    return;
  }
  const type =
    'path' in resolved ? IMAGE_TYPES.get(extname(resolved.path).toLowerCase()) : undefined;
  if ('path' in resolved && type === undefined) {
    sendError(res, 400, 'Unsupported image type');
    return;
  }
  let data;
  try {
    if (!('path' in resolved) || !statSync(resolved.path).isFile()) throw new Error('not a file');
    data = readFileSync(resolved.path);
  } catch {
    stderr.write(`[image 404] ${rawPath}\n`);
    sendError(res, 404, 'Not Found');
    return;
  }
  send(
    res,
    200,
    { 'Content-Type': type ?? 'application/octet-stream', 'Cache-Control': 'max-age=3600' },
    data,
  );
}

if (argv[1] !== undefined && resolve(argv[1]) === import.meta.filename) {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  createServer(createHandler()).listen(port, '127.0.0.1', () => {
    stdout.write(`Quiz page and API on http://127.0.0.1:${port} (fake content from content/)\n`);
  });
}
