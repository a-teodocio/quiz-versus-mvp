// ─── Quiz list loader ────────────────────────────────────────────────────────────────────────────────
// /api/list carries what the home screen needs for every course: file, course, title, unit, group (the
// unit tab), group_rank and keys (the progress keys of the file's questions, so no quiz has to be fetched
// to count unseen questions). /api/courses names the courses.
async function loadQuizList() {
  try {
    const r = await fetch('/api/list');
    const items = await r.json();
    const container = document.getElementById('quizList');
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">No quiz files found yet.</div>';
      return;
    }
    const courses = await fetchCourses();
    state.coursesKnown = !!courses && courses.length > 0;
    state.courses = state.coursesKnown ? courses : [];
    const notice = document.getElementById('courseNotice');
    notice.textContent = courses === null ? 'Restart the quiz server to enable courses.' : '';
    notice.classList.toggle('hidden', courses !== null);
    container.innerHTML = '';
    state.listFiles = [];
    state.fileCourse = {};
    state.fileGroup = {};
    state.groupRank = {};
    state.openChapters = readOpenChapters();
    // Files that share a course, tab group and chapter fold into one card; a chapter with a single file
    // (or a server that sends no "chapter") stays a plain row.
    const chapterId = it => it.chapter ? (it.course || '') + '|' + (it.group || 'All') + '|' + it.chapter : null;
    const chapterSize = {};
    for (const item of items) { const id = chapterId(item); if (id) chapterSize[id] = (chapterSize[id] || 0) + 1; }
    const cards = {};
    for (const item of items) {
      const group = item.group || 'All';   // a server from before courses sends no group
      state.listFiles.push(item.file);
      state.fileCourse[item.file] = item.course || '';
      state.fileGroup[item.file] = group;
      state.groupRank[group] = Number.isInteger(item.group_rank) ? item.group_rank : 1000;
      if (Array.isArray(item.keys)) state.fileKeys[item.file] = item.keys;
      let title = item.title || item.file.replace('.json', '').replace(/[-_]/g, ' ');
      const id = chapterId(item);
      const folded = id !== null && chapterSize[id] > 1;
      let chapterTitle = title, kind = title;
      if (folded) {
        const cut = title.lastIndexOf(': ');   // "Chapter 12 - Example Topic: Terminology"
        if (cut > 0) { chapterTitle = title.slice(0, cut); kind = title.slice(cut + 2); }
        title = kind;
      }
      let meta = '';
      if (item.unit && !folded) meta += item.unit;
      const n = item.parts_count || item.count;
      if (n) meta += (meta ? '  ·  ' : '') + n + (n === 1 ? ' question' : ' questions');
      const el = document.createElement('div');
      el.className = 'quiz-item';
      el.innerHTML = '<div class="quiz-item-title">' + title + '</div>' +
        '<div class="quiz-item-meta">' + meta + '<span class="quiz-item-unseen"></span></div>';
      el.dataset.file = item.file;
      el.dataset.parts = n || 0;
      el.dataset.entries = item.count || 0;
      el.dataset.course = item.course || '';
      el.dataset.group = group;
      el.onclick = () => onQuizItemClick(item.file, el);
      if (folded) {
        el.dataset.kind = kind;
        if (!cards[id]) cards[id] = container.appendChild(makeChapterCard(item, chapterTitle, group));
        cards[id].querySelector('.chapter-body').appendChild(el);
      } else {
        container.appendChild(el);
      }
    }
    Object.values(cards).forEach(sortChapterBody);
    migrateLegacyResume();  // needs state.fileCourse, filled above
    if (state.coursesKnown) {
      const view = readView();
      state.showArchived = view.showArchived;
      pickCourse(state.course !== null ? state.course : view.course);
    }
    applyCourseView(false);
  } catch {
    document.getElementById('quizList').innerHTML =
      '<div class="empty-state">Could not connect to the quiz server.</div>';
  }
}

// ─── Chapter cards (v1.55.0) ────────────────────────────────────────────────
// Files of one chapter (the server's "chapter", e.g. ch12) fold into a card: a header button that opens and
// closes the list of its files, plus (mix mode only) a checkbox that picks or clears all of them. The files stay
// ordinary .quiz-item rows (nested, so every querySelectorAll over '#quizList .quiz-item' still sees them); the
// card is NOT a .quiz-item. Two separate ways to hide: .hidden (other course or tab, set on the card too by
// selectUnitGroup) and .collapsed (the card's own open state, remembered in CHAPTERS_KEY as "course:chNN").
const CHAPTERS_KEY = 'mlsquiz_chapters_open';   // its own key, apart from perf, settings and view
const KIND_ORDER = ['terminology', 'clinical connections', 'textbook terms'];

function readOpenChapters() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAPTERS_KEY));
    if (Array.isArray(v)) return new Set(v.filter(x => typeof x === 'string'));
  } catch {}
  return new Set();
}

function saveOpenChapters() {
  try { localStorage.setItem(CHAPTERS_KEY, JSON.stringify([...state.openChapters])); } catch {}
}

function makeChapterCard(item, chapterTitle, group) {
  const key = (item.course || '') + ':' + item.chapter;
  const card = document.createElement('div');
  card.className = 'chapter-card';
  card.dataset.course = item.course || '';
  card.dataset.group = group;
  card.dataset.chapterKey = key;
  card.innerHTML =
    '<div class="chapter-head">' +
      '<input type="checkbox" class="chapter-pick">' +
      '<button type="button" class="chapter-toggle">' +
        '<span class="chapter-caret" aria-hidden="true">▸</span>' +
        '<span><span class="chapter-title"></span><span class="chapter-meta"></span></span>' +
      '</button>' +
    '</div><div class="chapter-body"></div>';
  card.querySelector('.chapter-title').textContent = chapterTitle;
  const open = state.openChapters.has(key);
  card.classList.toggle('collapsed', !open);
  const btn = card.querySelector('.chapter-toggle');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.onclick = () => toggleChapter(card);
  const pick = card.querySelector('.chapter-pick');
  pick.setAttribute('aria-label', 'Pick every set of ' + chapterTitle);
  pick.onchange = () => pickChapter(card, pick.checked);
  return card;
}

// Terminology, Clinical, Textbook; any other kind after them, by name.
function sortChapterBody(card) {
  const body = card.querySelector('.chapter-body');
  const rank = el => { const i = KIND_ORDER.indexOf((el.dataset.kind || '').toLowerCase()); return i < 0 ? KIND_ORDER.length : i; };
  [...body.children]
    .sort((a, b) => (rank(a) - rank(b)) || (a.dataset.kind || '').localeCompare(b.dataset.kind || ''))
    .forEach(el => body.appendChild(el));
}

function toggleChapter(card) {
  const collapsed = card.classList.toggle('collapsed');
  card.querySelector('.chapter-toggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (collapsed) state.openChapters.delete(card.dataset.chapterKey);
  else state.openChapters.add(card.dataset.chapterKey);
  saveOpenChapters();
}

// The pick-all checkbox (visible in mix mode only): picks or clears every set of the chapter.
function pickChapter(card, on) {
  card.querySelectorAll('.quiz-item').forEach(el => {
    if (on) state.mixPicked.add(el.dataset.file); else state.mixPicked.delete(el.dataset.file);
    el.classList.toggle('picked', on);
  });
  updateMixBar();
}

// Sets, questions, unseen and picks of each card, so a collapsed chapter still shows them. Called from
// updateProgressViews() and updateMixBar(), which every pick, course switch, import and reset goes through.
function updateChapterHeaders() {
  document.querySelectorAll('#quizList .chapter-card').forEach(card => {
    const rows = [...card.querySelectorAll('.quiz-item')];
    let parts = 0, unseen = 0, known = true;
    rows.forEach(el => {
      parts += parseInt(el.dataset.parts) || 0;
      const keys = state.fileKeys[el.dataset.file];
      if (keys) unseen += keys.filter(k => !state.perf[k]).length; else known = false;
    });
    const picked = rows.filter(el => state.mixPicked.has(el.dataset.file)).length;
    const bits = [rows.length + ' sets', parts + ' questions'];
    if (known) bits.push(unseen === 0 ? 'all answered' : unseen + ' unseen');
    if (picked) bits.push(picked + ' picked');
    card.querySelector('.chapter-meta').textContent = bits.join('  ·  ');
    card.classList.toggle('has-picks', picked > 0);
    const pick = card.querySelector('.chapter-pick');
    pick.checked = picked === rows.length;
    pick.indeterminate = picked > 0 && picked < rows.length;
  });
}

