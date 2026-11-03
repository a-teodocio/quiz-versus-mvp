// ─── Start quiz (called directly by quiz-item click) ────────────────────────
// `resume` (optional): a validated mlsquiz_resume record. Its questions are
// already shuffled, so they are used as-is and the saved progress is restored.
function beginSession(selectedQuestions, isRedo = false, resume = null) {
  const count = selectedQuestions.length;
  resetSession();
  state.totalParts = selectedQuestions.reduce(function(sum, q) { return sum + (q.type === 'image-group' ? q.parts.length : 1); }, 0);
  state.sessionCourse = resume ? resume.course : courseOfFiles(state.quiz.files);
  state.sessionStartedAt = Date.now() - ((resume && resume.elapsedMs > 0) ? resume.elapsedMs : 0);
  state.questions = resume ? selectedQuestions : selectedQuestions.map(shuffleQuestion);
  state.answerHistory = resume
    ? restoreHistory(resume.answerHistory, state.questions.length)
    : new Array(state.questions.length).fill(null);
  if (resume) {
    state.currentIdx = resume.currentIdx;
    state.currentGroupPartIdx = resume.currentGroupPartIdx;
    state.score = resume.score;
    state.halfwayWarningShown = !!resume.halfwayWarningShown;
    state.threeMinWarningShown = !!resume.threeMinWarningShown;
  }

  hide('homeView'); show('quizView'); hide('resultsView'); show('exitBtn');
  scrollToTop();

  if (state.settings.timerSecs > 0) {
    state.sessionTimerRemaining = resume ? resume.timerRemaining : state.settings.timerSecs;
    startTimer();
    if (resume && state.threeMinWarningShown) document.getElementById('timerDisplay').classList.add('warning');
  } else {
    document.getElementById('timerDisplay').classList.add('hidden');
  }

  const requested = getQCount(state.quiz.questions.length);
  if (!isRedo && count < requested) {
    showToast('Only ' + count + ' questions available with selected distribution: adjust settings for more.');
  }

  renderQuestion();
}

// \u2500\u2500\u2500 Resume last quiz \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// One saved quiz per course, each under its own key (RESUME_PREFIX + course code). A key per course keeps
// the frequent save (every question, answer and page close) to one record, and a full store only costs
// that course its save. RESUME_KEY is the single record of v1.49.0 and older: migrateLegacyResume() moves
// it to its course's key once the file list has said which course its files belong to.
const RESUME_PREFIX = 'mlsquiz_resume:';
const RESUME_KEY = 'mlsquiz_resume';

function resumeKey(course) { return RESUME_PREFIX + (course || ''); }

// The course a set of files belongs to: the first file's (a mixed session stays inside one course on the home page).
function courseOfFiles(files) {
  return (Array.isArray(files) && files.length && state.fileCourse[files[0]]) || '';
}

// Save the in-progress session. No-op unless a quiz is actually on screen, so
// finished, timed-out and exited-to-home states never overwrite the record.
function saveResume() {
  if (!state.quiz || !state.quiz.files || state.timedOut || !state.questions.length) return;
  if (document.getElementById('quizView').classList.contains('hidden')) return;
  try {
    localStorage.setItem(resumeKey(state.sessionCourse), JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      course: state.sessionCourse,
      files: state.quiz.files,
      title: state.quiz.title || '',
      settings: { timerSecs: state.settings.timerSecs, dist: state.settings.dist, examMode: state.settings.examMode, answerBy: state.settings.answerBy },
      questions: state.questions,
      answerHistory: state.answerHistory,
      currentIdx: state.currentIdx,
      currentGroupPartIdx: state.currentGroupPartIdx,
      score: state.score,
      timerRemaining: state.sessionTimerRemaining,
      elapsedMs: Date.now() - state.sessionStartedAt,
      halfwayWarningShown: state.halfwayWarningShown,
      threeMinWarningShown: state.threeMinWarningShown,
    }));
  } catch {}
}

function clearResume(course) {
  try { localStorage.removeItem(resumeKey(course)); } catch {}
}

// A saved record that has everything beginSession() needs.
function validResume(rec) {
  return !!rec && rec.v === 1 && Array.isArray(rec.files) && rec.files.length > 0 &&
    Array.isArray(rec.questions) && rec.questions.length > 0 &&
    Array.isArray(rec.answerHistory) && !!rec.settings &&
    Number.isInteger(rec.currentIdx) && rec.currentIdx >= 0 && rec.currentIdx < rec.questions.length &&
    Number.isInteger(rec.currentGroupPartIdx) && rec.currentGroupPartIdx >= 0 &&
    Number.isInteger(rec.score) && rec.score >= 0;
}

// Returns a validated record for a course, or null (and drops it) if missing/corrupt/expired.
// rec.course is always the course of the key it was found under.
function readResume(course) {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(resumeKey(course))); } catch { return null; }
  if (!rec) return null;
  if (!validResume(rec)) { clearResume(course); return null; }
  if (rec.settings.timerSecs > 0) {
    // Exam timer is strict: time away from the page counts against it.
    // Standard timer is paused while away.
    if (rec.settings.examMode) rec.timerRemaining -= Math.floor((Date.now() - rec.savedAt) / 1000);
    if (!(rec.timerRemaining > 0)) { clearResume(course); return null; }
  }
  rec.course = course || '';
  return rec;
}

// Every course's saved quiz, newest first. The keys are collected before reading, because reading drops bad records.
function readAllResumes() {
  const courses = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RESUME_PREFIX)) courses.push(k.slice(RESUME_PREFIX.length));
    }
  } catch {}
  return courses.map(readResume).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
}

// Moves the v1.49.0 single record to its course's key (the file list must be loaded first). A course that
// already has a newer saved quiz keeps it. If the write fails the old record stays and is tried next load.
function migrateLegacyResume() {
  let raw = null, rec = null;
  try { raw = localStorage.getItem(RESUME_KEY); } catch { return; }
  if (raw === null) return;
  try { rec = JSON.parse(raw); } catch {}
  try {
    if (validResume(rec)) {
      const course = courseOfFiles(rec.files);
      const current = readResume(course);
      if (!current || current.savedAt < rec.savedAt) {
        rec.course = course;
        localStorage.setItem(resumeKey(course), JSON.stringify(rec));
      }
    }
    localStorage.removeItem(RESUME_KEY);
  } catch {}
}

// JSON turns sparse group-part arrays' holes into null; flushCurrentGroupParts
// looks for undefined, so convert them back.
function restoreHistory(saved, n) {
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const h = saved[i];
    out[i] = Array.isArray(h) ? Array.from(h, p => p === null ? undefined : p) : (h || null);
  }
  return out;
}

// The "Unfinished quizzes" section: one item per course with a saved quiz, whichever course is on show
// (archived courses included). Titles come from files, so every value goes in through textContent.
function updateResumePrompt() {
  const recs = readAllResumes();
  document.getElementById('resumeCard').classList.toggle('hidden', recs.length === 0);
  const list = document.getElementById('resumeList');
  list.textContent = '';
  const named = state.coursesKnown && state.courses.length > 0;
  recs.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'resume-item';
    item.dataset.course = rec.course;
    const courseName = named ? courseNameOf(rec.course) : '';
    if (courseName) {
      const course = document.createElement('div');
      course.className = 'resume-course';
      course.textContent = courseName;
      item.appendChild(course);
    }
    const title = document.createElement('div');
    title.className = 'resume-title';
    title.textContent = rec.title || 'Untitled quiz';
    const bits = ['Question ' + partPosition(rec.questions, rec.currentIdx, rec.currentGroupPartIdx) +
      ' of ' + totalPartsOf(rec.questions)];
    if (rec.settings.timerSecs > 0) {
      const m = Math.floor(rec.timerRemaining / 60), s = rec.timerRemaining % 60;
      bits.push(String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ' left');
    }
    if (rec.settings.examMode) bits.push('Exam mode');
    if (rec.settings.answerBy === 'type') bits.push('Typing');
    bits.push('saved ' + formatSessionDate(rec.savedAt));
    const detail = document.createElement('div');
    detail.className = 'resume-detail';
    detail.textContent = bits.join(' \u00b7 ');
    const actions = document.createElement('div');
    actions.className = 'resume-actions';
    const go = document.createElement('button');
    go.className = 'btn btn-primary resume-go';
    go.textContent = 'Resume';
    go.onclick = () => resumeQuiz(rec.course);
    const drop = document.createElement('button');
    drop.className = 'btn btn-secondary resume-discard';
    drop.textContent = 'Discard';
    drop.onclick = () => discardResume(rec.course);
    actions.appendChild(go); actions.appendChild(drop);
    item.appendChild(title); item.appendChild(detail); item.appendChild(actions);
    list.appendChild(item);
  });
}

function discardResume(course) {
  clearResume(course);
  updateResumePrompt();
}

// ─── Session history (last 3 finished sessions) ─────────────────────────────
const HISTORY_KEY = 'mlsquiz_history';
const HISTORY_MAX = 3;

// A snapshot is the finished session in results-page shape (see buildSnapshot()).
function validSnapshot(s) {
  return !!s && Array.isArray(s.questions) && s.questions.length > 0 &&
    Array.isArray(s.answerHistory) && s.answerHistory.length === s.questions.length &&
    s.questions.every(q => !!q && (q.type === 'image-group'
      ? Array.isArray(q.shuffledParts) && q.shuffledParts.every(p => !!p && Array.isArray(p.options))
      : Array.isArray(q.options)));
}

// Newest first. Drops malformed entries so a bad record can't break the home screen.
// A bad snapshot only costs that entry its View button, not the summary row.
function readSessionHistory() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(HISTORY_KEY)); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter(e => e && typeof e.title === 'string' &&
    Number.isFinite(e.at) && Number.isFinite(e.score) && Number.isFinite(e.total) && e.total > 0 &&
    Number.isFinite(e.secs) && e.secs >= 0).slice(0, HISTORY_MAX)
    .map(e => validSnapshot(e.snapshot) ? e : Object.assign({}, e, { snapshot: undefined }));
}

// Full copy of the finished session for the read-only viewer: the shuffled
// questions (options in the order shown, shuffledCorrect, explanation, image
// path) and the answers given. Only what renderResultCards() reads is kept.
// Skipped parts are null, which is also how JSON stores sparse array holes.
function buildSnapshot() {
  const slim = q => q.type === 'image-group'
    ? { type: 'image-group', id: q.id, image_path: q.image_path || '',
        shuffledParts: q.shuffledParts.map(p => ({
          id: p.id, question: p.question, options: p.options,
          shuffledCorrect: p.shuffledCorrect, explanation: p.explanation })) }
    : { id: q.id || null, question: q.question, options: q.options,
        shuffledCorrect: q.shuffledCorrect, explanation: q.explanation, image_path: q.image_path || '' };
  return {
    questions: state.questions.map(slim),
    answerHistory: state.answerHistory.map(h => Array.isArray(h) ? Array.from(h, p => p || null) : (h || null)),
  };
}

// Called from showResults(): covers completed sessions and "View results" after time-up.
// Sessions exited to home are not finished, so they are not recorded.
function recordSession() {
  if (state.historyRecorded || !state.totalParts) return;
  state.historyRecorded = true;
  const entry = {
    title: (state.quiz && state.quiz.title) || 'Untitled quiz',
    at: Date.now(),
    score: state.score,
    total: state.totalParts,
    secs: Math.max(0, Math.round((Date.now() - state.sessionStartedAt) / 1000)),
    exam: state.settings.examMode === true,
    typed: state.settings.answerBy === 'type',
    timedOut: state.timedOut,
    endedEarly: state.endedEarly === true,
    snapshot: buildSnapshot(),
  };
  const list = [entry].concat(readSessionHistory()).slice(0, HISTORY_MAX);
  // Snapshots are the bulk of the data. If storage is full, shed the oldest
  // snapshots first; the last attempt keeps summaries only, as before v1.23.0.
  for (let keep = list.length; keep >= 0; keep--) {
    const out = list.map((e, i) => i < keep ? e : Object.assign({}, e, { snapshot: undefined }));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(out));
      return;
    } catch {}
  }
}

function formatSessionDate(at) {
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(secs) {
  if (secs < 60) return secs + 's';
  const m = Math.floor(secs / 60);
  if (m < 60) return m + 'm ' + (secs % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

// Quiz titles come from files, so every value goes in via textContent.
function renderSessionHistory() {
  const list = readSessionHistory();
  document.getElementById('historyCard').classList.toggle('hidden', list.length === 0);
  document.getElementById('jumpHistory').classList.toggle('hidden', list.length === 0);  // no card, no link
  const wrap = document.getElementById('historyList');
  wrap.innerHTML = '';
  list.forEach(e => {
    const pct = Math.round(e.score / e.total * 100);
    const row = document.createElement('div');
    row.className = 'hist-row';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'hist-title';
    title.textContent = e.title;
    const meta = document.createElement('div');
    meta.className = 'hist-meta';
    const bits = [formatSessionDate(e.at)];
    if (e.exam) bits.push('Exam');
    if (e.typed) bits.push('Typed');
    if (e.timedOut) bits.push('Time’s up');
    if (e.endedEarly) bits.push('Ended early');
    bits.push(formatDuration(e.secs));
    meta.textContent = bits.join(' · ');
    left.appendChild(title); left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'hist-score ' + (pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo');
    right.textContent = pct + '%';
    const frac = document.createElement('small');
    frac.textContent = e.score + '/' + e.total;
    right.appendChild(frac);

    row.appendChild(left); row.appendChild(right);
    // Entries saved before v1.23.0 have no snapshot, so there is nothing to open
    if (e.snapshot) {
      const view = document.createElement('button');
      view.className = 'btn btn-secondary btn-sm';
      view.textContent = 'View';
      view.title = 'Review the answers from this session';
      view.onclick = () => viewHistoryEntry(e);
      row.appendChild(view);
    }
    wrap.appendChild(row);
  });
}

async function resumeQuiz(course) {
  const rec = readResume(course);
  if (!rec) { updateResumePrompt(); return; }
  try {
    state.quiz = await loadQuizFiles(rec.files);
  } catch {
    showToast('Could not load the quiz file(s) for that session: are they still in the folder?');
    return;
  }
  document.getElementById('unitLabel').textContent = state.quiz.unit || '';
  settingsApplying = true;   // the session's settings are shown, not saved over the course on show's
  try {
    selectExamMode(!!rec.settings.examMode);
    selectAnswerBy(rec.settings.answerBy === 'type' ? 'type' : 'pick');
    selectTimerOption(rec.settings.timerSecs);
    selectDistOption(rec.settings.dist || 'all');
  } finally { settingsApplying = false; }
  beginSession(rec.questions, true, rec);
}

// Fetch one or more quiz files. A single file is returned as-is (plus `files`);
// several are merged into one pooled quiz with `mixed: true`, each question
// tagged with its unit and duplicates (same group id / question text) dropped.
async function loadQuizFiles(files) {
  const datas = await Promise.all(files.map(async f => {
    const r = await fetch('/api/quiz?file=' + encodeURIComponent(f));
    if (!r.ok) throw new Error('Could not load ' + f);
    return r.json();
  }));
  if (datas.length === 1) return Object.assign({}, datas[0], { files: files });
  const seen = new Set();
  const questions = [];
  datas.forEach(d => d.questions.forEach(q => {
    const key = q.type === 'image-group' ? q.id : q.question;
    if (seen.has(key)) return;
    seen.add(key);
    questions.push(Object.assign({}, q, { unit: q.unit || d.unit || d.title || '' }));
  }));
  return { title: 'Mixed units', unit: 'Mixed units', questions: questions, files: files, mixed: true };
}

