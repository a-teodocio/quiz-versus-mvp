// ─── Progress: what has been answered on this device ────────────────────────
// state.perf maps a key to [answered, correct]. Standalone questions use their id
// (or their text when they have none); every part of an image-group has its own key.
const PERF_KEY = 'mlsquiz_perf';
const PERF_PREFIX = 'MLSQUIZ1:';

function entryKeys(q) {
  if (q.type === 'image-group') return q.parts.map((p, i) => p.id || (q.id + '#' + i));
  return [q.id || q.question];
}

// Keeps only well-formed [answered, correct] pairs (also used on pasted text).
function cleanPerf(raw) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(k => {
    const r = raw[k];
    if (Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) &&
        r[0] > 0 && r[1] >= 0 && r[1] <= r[0]) out[k] = [r[0], r[1]];
  });
  return out;
}

function loadPerf() {
  try { return cleanPerf(JSON.parse(localStorage.getItem(PERF_KEY) || '{}')); }
  catch { return Object.create(null); }
}

function savePerf() {
  try { localStorage.setItem(PERF_KEY, JSON.stringify(state.perf)); } catch {}
}

// `prev` is the answer this one replaces (an exam answer changed after going back): its
// count is taken off first, so a changed answer still counts once.
function recordPerf(key, isCorrect, prev) {
  const r = state.perf[key] || [0, 0];
  if (prev) {
    r[0] = Math.max(0, r[0] - 1);
    if (prev.isCorrect) r[1] = Math.max(0, r[1] - 1);
  }
  r[0]++;
  if (isCorrect) r[1]++;
  state.perf[key] = r;
  savePerf();
}

function entryStats(q) {
  const keys = entryKeys(q);
  let seen = 0, a = 0, c = 0;
  keys.forEach(k => { const r = state.perf[k]; if (r) { seen++; a += r[0]; c += r[1]; } });
  return { total: keys.length, seen, a, c };
}

// Lower sorts first. 'unseen': anything with a part not answered yet, then answered
// entries with the fewest rounds (lowest accuracy first). 'weakest': entries answered
// wrongly at least once (lowest accuracy first), then anything unseen, then entries
// always answered right (fewest rounds first). A round is one answer to every part,
// so a group is compared per part (answers / parts), not by its raw total, which
// would make a 4-part group look four times as practised as a standalone question.
function priorityRank(q, order) {
  const s = entryStats(q);
  const acc = s.a ? s.c / s.a : 1;
  const rounds = s.a / s.total;
  if (order === 'weakest') {
    if (s.a > 0 && s.c < s.a) return [0, acc, 0];
    if (s.seen < s.total) return [1, 0, 0];
    return [2, rounds, 0];
  }
  if (s.seen < s.total) return [0, 0, 0];
  return [1, rounds, acc];
}

// Shuffles, then (for 'unseen' / 'weakest') stable-sorts by rank, so ties stay random.
function prioritize(list, order) {
  const shuffled = shuffle(list);
  if (order !== 'unseen' && order !== 'weakest') return shuffled;
  const ranked = shuffled.map(q => ({ q, r: priorityRank(q, order) }));
  ranked.sort((x, y) => {
    for (let i = 0; i < 3; i++) { const d = x.r[i] - y.r[i]; if (d) return d; }
    return 0;
  });
  return ranked.map(e => e.q);
}

// ─── Distribution helper ────────────────────────────────────────────────────
// `order` decides which questions are taken first when there is a limit, and the
// order of the session itself ('random' is a plain shuffle).
function applyDistribution(all, count, dist, order = state.settings.order) {
  const textQs = prioritize(all.filter(q => q.type !== 'image' && q.type !== 'image-group'), order);
  const imgQs  = prioritize(all.filter(q => q.type === 'image' || q.type === 'image-group'), order);

  if (dist === 'all') {
    return prioritize([...textQs, ...imgQs], order).slice(0, count);
  }

  const ratios = {
    'text-heavy':   [0.75, 0.25],
    'balanced':     [0.50, 0.50],
    'visual-heavy': [0.25, 0.75],
    'visual-only':  [0.00, 1.00],
  };
  const [tr, ir] = ratios[dist] || [0.5, 0.5];
  let tWant = Math.round(count * tr);
  let iWant = count - tWant;

  // Clamp to available
  const tTake0 = Math.min(tWant, textQs.length);
  const iTake0 = Math.min(iWant, imgQs.length);
  const tDeficit = tWant - tTake0;
  const iDeficit = iWant - iTake0;

  // Redistribute deficit to the other type
  const iTake = Math.min(imgQs.length, iTake0 + tDeficit);
  const tTake = Math.min(textQs.length, tTake0 + iDeficit);

  return prioritize([...textQs.slice(0, tTake), ...imgQs.slice(0, iTake)], order);
}

function getQCount(available) {
  const val = parseInt(document.getElementById('qCountInput').value);
  if (isNaN(val) || val <= 0) return available;
  return Math.min(val, available);
}

