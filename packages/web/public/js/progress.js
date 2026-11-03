// ─── Progress card, unseen counts and device sync ───────────────────────────
// The unseen counts use each file's keys from /api/list (state.fileKeys), so the home screen fetches no
// quiz file. With more than one course the card has two lines: the course on show (only the keys of its
// files) and all courses (every answer on this device, orphan keys of deleted questions included).
function progressSentence(keys, lead, none, onlyKeys) {
  let answers = 0, correct = 0;
  (onlyKeys ? [...keys] : Object.keys(state.perf)).forEach(k => {
    const p = state.perf[k];
    if (p) { answers += p[0]; correct += p[1]; }
  });
  if (!answers) return none;
  const seen = [...keys].filter(k => state.perf[k]).length;
  return (keys.size ? lead + seen + ' of ' + keys.size + ' questions (' + (keys.size - seen) + ' unseen). ' : '') +
    Math.round(100 * correct / answers) + '% correct over ' + answers + ' answers.';
}

function updateProgressViews() {
  document.querySelectorAll('#quizList .quiz-item').forEach(el => {
    const keys = state.fileKeys[el.dataset.file];
    const tag = el.querySelector('.quiz-item-unseen');
    if (!keys || !tag) return;
    const unseen = keys.filter(k => !state.perf[k]).length;
    tag.textContent = '  ·  ' + (unseen === 0 ? 'all answered' : unseen + ' unseen');
  });
  updateChapterHeaders();
  const universe = new Set();
  Object.keys(state.fileKeys).forEach(f => state.fileKeys[f].forEach(k => universe.add(k)));
  const lead = 'Answered at least once: ';
  const allLine = progressSentence(universe, lead, 'Nothing answered on this device yet.', false);
  const el = document.getElementById('progressSummary');
  const all = document.getElementById('progressSummaryAll');
  if (!state.coursesKnown || state.courses.length < 2) {
    el.textContent = allLine;
    all.classList.add('hidden');
    return;
  }
  const courseKeys = new Set();
  state.listFiles.filter(inCourseOnShow).forEach(f => (state.fileKeys[f] || []).forEach(k => courseKeys.add(k)));
  const name = courseNameOf(state.course);
  el.textContent = name + ' · ' + progressSentence(courseKeys, lead, 'Nothing answered yet.', true);
  all.textContent = 'All courses · ' + allLine;
  all.classList.remove('hidden');
}

function setProgressStatus(msg, kind) {
  const el = document.getElementById('progressStatus');
  el.textContent = msg;
  el.className = 'progress-status' + (kind ? ' ' + kind : '');
}

function disarmProgressReset() {
  state.resetArmed = false;
  document.getElementById('progressResetBtn').textContent = 'Reset progress';
}

function openProgressModal() {
  document.getElementById('progressPaste').value = '';
  setProgressStatus('', '');
  disarmProgressReset();
  document.getElementById('progressModal').classList.add('active');
  document.getElementById('progressPaste').focus();
}

function closeProgressModal() {
  document.getElementById('progressModal').classList.remove('active');
  disarmProgressReset();
}

function exportProgress() {
  return PERF_PREFIX + JSON.stringify({ v: 1, p: state.perf, f: [...state.flaggedIds] });
}

async function copyProgress() {
  const text = exportProgress();
  const box = document.getElementById('progressPaste');
  const summary = Object.keys(state.perf).length + ' answered questions and ' + state.flaggedIds.size + ' flags';
  box.value = text;
  try {
    await navigator.clipboard.writeText(text);
    setProgressStatus('Copied ' + summary + '. Paste it on the other device.', 'ok');
  } catch {
    box.focus(); box.select();
    setProgressStatus('Could not copy by itself. The text is selected: copy it by hand (' + summary + ').', 'error');
  }
}

// Merge rule: the higher count wins per question, flags are added. Both are
// idempotent and commute, so importing twice, or in either direction, is safe.
function importProgress() {
  const raw = document.getElementById('progressPaste').value.trim();
  if (!raw) { setProgressStatus('Paste the copied text into the box first.', 'error'); return; }
  let data = null;
  try {
    if (raw.startsWith(PERF_PREFIX)) data = JSON.parse(raw.slice(PERF_PREFIX.length));
  } catch {}
  if (!data || data.v !== 1 || !data.p || typeof data.p !== 'object') {
    setProgressStatus('That does not look like progress copied from this app.', 'error');
    return;
  }
  const incoming = cleanPerf(data.p);
  let added = 0, raised = 0, newFlags = 0;
  Object.keys(incoming).forEach(k => {
    const cur = state.perf[k], inc = incoming[k];
    if (!cur) { state.perf[k] = inc; added++; return; }
    const a = Math.max(cur[0], inc[0]), c = Math.max(cur[1], inc[1]);
    if (a !== cur[0] || c !== cur[1]) { state.perf[k] = [a, c]; raised++; }
  });
  (Array.isArray(data.f) ? data.f : []).forEach(f => {
    if (typeof f === 'string' && !state.flaggedIds.has(f)) { state.flaggedIds.add(f); newFlags++; }
  });
  savePerf();
  saveFlagsToStorage();
  updateProgressViews();
  setProgressStatus('Imported: ' + added + ' new, ' + raised + ' updated, ' + newFlags + ' new flags.', 'ok');
}

// Two clicks: the first arms the button, the second erases the counts (flags stay).
function resetProgress() {
  const btn = document.getElementById('progressResetBtn');
  if (!state.resetArmed) {
    state.resetArmed = true;
    btn.textContent = 'Click again to erase';
    setProgressStatus('This clears the answered counts on this device only. Flags are kept.', 'error');
    return;
  }
  state.perf = Object.create(null);
  savePerf();
  disarmProgressReset();
  updateProgressViews();
  setProgressStatus('Progress cleared on this device.', 'ok');
}

// ─── Mixed-unit mode ────────────────────────────────────────────────────────
function onQuizItemClick(file, el) {
  if (!state.mixMode) { startQuiz(file); return; }
  if (state.mixPicked.has(file)) state.mixPicked.delete(file);
  else state.mixPicked.add(file);
  el.classList.toggle('picked', state.mixPicked.has(file));
  updateMixBar();
}

function toggleMixMode() {
  state.mixMode = !state.mixMode;
  state.mixPicked.clear();
  document.querySelectorAll('#quizList .quiz-item').forEach(el => el.classList.remove('picked'));
  document.getElementById('mixToggleBtn').textContent = state.mixMode ? 'Cancel mixing' : 'Mix units';
  document.getElementById('quizListLabel').textContent =
    state.mixMode ? 'Select quizzes to mix' : 'Select a quiz';
  document.getElementById('mixBar').classList.toggle('hidden', !state.mixMode);
  document.getElementById('quizList').classList.toggle('mixing', state.mixMode);
  updateMixBar();
}

function updateMixBar() {
  const n = state.mixPicked.size;
  document.getElementById('mixCount').textContent =
    n < 2 ? 'Pick at least 2 quizzes (' + n + ' selected)' : n + ' quizzes selected';
  document.getElementById('mixStartBtn').disabled = n < 2;
  updateUnitTabs();
  updateChapterHeaders();
}

function startMixedQuiz() {
  if (state.mixPicked.size < 2) return;
  return startQuiz([...state.mixPicked]);
}

