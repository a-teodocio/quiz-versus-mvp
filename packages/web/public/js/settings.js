function selectTimerOption(secs) {
  if (state.settings.examMode && secs === 0) return;
  state.settings.timerSecs = secs;
  document.querySelectorAll('#timerOptions .t-opt').forEach(btn => {
    btn.classList.toggle('on', parseInt(btn.dataset.secs) === secs);
  });
  updateSettingsSummary();
}

function selectDistOption(val) {
  state.settings.dist = val;
  document.querySelectorAll('#distOptions .t-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.dist === val);
  });
  updateSettingsSummary();
}

function selectOrderOption(val) {
  state.settings.order = val;
  document.querySelectorAll('#orderOptions .t-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.order === val);
  });
  updateSettingsSummary();
}

function selectExamMode(val) {
  state.settings.examMode = val;
  document.querySelectorAll('#modeOptions .t-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.mode === String(val));
  });
  if (val && state.settings.timerSecs === 0) { selectTimerOption(900); }
  document.querySelectorAll('#timerOptions .t-opt').forEach(btn => {
    btn.disabled = val && parseInt(btn.dataset.secs) === 0;
  });
  updateSettingsSummary();
}

// Sets the mode and nothing else. Only a click goes through chooseAnswerBy(), which also remembers it for the
// course on show; resume, the course switch and Clear choices call this directly so they never overwrite a choice.
function selectAnswerBy(val) {
  state.settings.answerBy = val;
  document.querySelectorAll('#answerOptions .t-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.answerBy === val);
  });
  updateSettingsSummary();
}

// ─── Answer mode per course ─────────────────────────────────────────────────
// Each course has its own Pick / Type choice: what the user last clicked for it (mlsquiz_answerby, {course: mode}),
// else the default in courses.json ("answer_by", sent by /api/courses), else Pick. The global mode saved with
// the home settings is only used when the server sends no courses.
const ANSWERBY_KEY = 'mlsquiz_answerby';

function readAnswerByChoices() {
  const out = Object.create(null);
  try {
    const saved = JSON.parse(localStorage.getItem(ANSWERBY_KEY));
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(code => { if (ANSWER_OPTIONS.some(o => o.value === saved[code])) out[code] = saved[code]; });
    }
  } catch {}
  return out;
}

function writeAnswerByChoices(choices) {
  try { localStorage.setItem(ANSWERBY_KEY, JSON.stringify(choices)); } catch {}
}

function courseAnswerSeed(code) {
  const c = state.courses.find(x => x.code === code);
  return c && ANSWER_OPTIONS.some(o => o.value === c.answer_by) ? c.answer_by : 'pick';
}

function courseAnswerBy(code) {
  return readAnswerByChoices()[code] || courseAnswerSeed(code);
}

function chooseAnswerBy(val) {
  selectAnswerBy(val);
  if (!state.coursesKnown || !state.course) return;
  const choices = readAnswerByChoices();
  choices[state.course] = val;
  writeAnswerByChoices(choices);
}

// Puts the course on show's mode on screen (page load, course switch, back on the home page).
function applyCourseAnswerBy() {
  if (state.coursesKnown && state.course) selectAnswerBy(courseAnswerBy(state.course));
}

// "Clear choices": the course on show forgets its remembered mode and goes back to its default.
function resetCourseAnswerBy() {
  if (!state.coursesKnown || !state.course) { selectAnswerBy('pick'); return; }
  const choices = readAnswerByChoices();
  delete choices[state.course];
  writeAnswerByChoices(choices);
  selectAnswerBy(courseAnswerSeed(state.course));
}

// ─── Saved home settings ─────────────────────────────────────────────────────
// The quiz settings card (count, timer, distribution, order, mode) is kept in localStorage on every change,
// per course (mlsquiz_course_settings, {course: {...}}), so each course comes back with its own choices after a
// reload, a visit or a course switch; a course never saved starts at the defaults. The Answer by mode has its own
// per-course record (mlsquiz_answerby, above). Every control ends in updateSettingsSummary(), which is where the
// save happens. The unit tab and mix picks are not saved. Without courses (older server) the flat record
// mlsquiz_settings, answer mode included, is used instead; it is also the one-off source for the course on show
// the first time the per-course record does not exist yet.
const SETTINGS_KEY = 'mlsquiz_settings';
const COURSE_SETTINGS_KEY = 'mlsquiz_course_settings';
let settingsApplying = false;   // true while a saved record is put on screen: the select* calls then must not save

function readCourseSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(COURSE_SETTINGS_KEY));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return Object.assign(Object.create(null), saved);
  } catch {}
  return null;
}

function saveHomeSettings() {
  if (settingsApplying) return;
  const countVal = parseInt(document.getElementById('qCountInput').value);
  const s = state.settings;
  const record = {
    timerSecs: s.timerSecs, dist: s.dist, order: s.order, examMode: s.examMode === true,
    count: isNaN(countVal) || countVal <= 0 ? null : countVal,
  };
  try {
    if (state.coursesKnown && state.course) {
      const all = readCourseSettings() || Object.create(null);
      all[state.course] = record;
      localStorage.setItem(COURSE_SETTINGS_KEY, JSON.stringify(all));
    } else {
      record.answerBy = s.answerBy;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(record));
    }
  } catch {}
}

// Puts a saved record on screen; the controls start from the defaults, so anything missing or not a known
// option (a damaged or older record) falls back to the default. Callers set settingsApplying.
function applySettingsRecord(saved, withAnswerBy) {
  const s = saved && typeof saved === 'object' ? saved : {};
  selectExamMode(false);   // first: while exam mode is on, "No timer" is refused
  selectTimerOption(TIMER_OPTIONS.some(o => o.secs === s.timerSecs) ? s.timerSecs : 0);
  selectDistOption(DIST_OPTIONS.some(o => o.value === s.dist) ? s.dist : 'all');
  selectOrderOption(ORDER_OPTIONS.some(o => o.value === s.order) ? s.order : 'unseen');
  if (withAnswerBy && ANSWER_OPTIONS.some(o => o.value === s.answerBy)) selectAnswerBy(s.answerBy);
  if (s.examMode === true) selectExamMode(true);  // after the timer: exam mode forces one
  document.getElementById('qCountInput').value = Number.isInteger(s.count) && s.count > 0 ? String(s.count) : '';
  syncCountPresets();
}

// Page load, before the courses are known: the flat record.
function loadHomeSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch {}
  if (!saved || typeof saved !== 'object') return;
  settingsApplying = true;
  try { applySettingsRecord(saved, true); } finally { settingsApplying = false; }
}

// Puts the course on show's settings on screen (page load, course switch, back on the home page): its own record,
// else the flat record the very first time, else the defaults. Reads before it changes anything, and the
// select* calls do not save, so the course switch can never write one course's values into another's record.
function applyCourseSettings() {
  if (!state.coursesKnown || !state.course) return;
  const all = readCourseSettings();
  let saved = all ? all[state.course] : null;
  if (!all) { try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch {} }
  settingsApplying = true;
  try {
    applySettingsRecord(saved, false);
    applyCourseAnswerBy();
  } finally { settingsApplying = false; }
  updateSettingsSummary();
}

// "Clear choices": every setting back to its default (exam mode goes first, it blocks "No timer").
function clearHomeSettings() {
  selectExamMode(false);
  selectTimerOption(0);
  selectDistOption('all');
  selectOrderOption('unseen');
  resetCourseAnswerBy();
  selectCountPreset(null);
  showToast('Settings cleared');
}

// "about N min" in the "Starting with" line for the number in the "Questions" box. The box counts entries
// and a picture group has several parts, so the time is limit x the course on show's average parts per entry,
// at the pace of the Answer by setting: an approximation (which entries are drawn, the Distribution setting and a
// unit smaller than the limit all change it); the start window gives the exact figure for the questions it picked.
// A blank box means "all of the unit you pick", which is not known yet, so no estimate.
function limitEstimateLabel(limit) {
  let parts = 0, entries = 0;
  document.querySelectorAll('#quizList .quiz-item').forEach(el => {
    if (state.coursesKnown && el.dataset.course !== state.course) return;
    parts += parseInt(el.dataset.parts) || 0;
    entries += parseInt(el.dataset.entries) || 0;
  });
  if (!(limit > 0) || !entries) return '';
  const perPart = state.settings.answerBy === 'type' ? SECS_PER_TYPED : SECS_PER_PICK;
  return estimateLabel(limit * (parts / entries) * perPart);
}

function updateSettingsSummary() {
  saveHomeSettings();
  const timerLabel = TIMER_OPTIONS.find(o => o.secs === state.settings.timerSecs)?.label || 'No timer';
  const distLabel  = DIST_OPTIONS.find(o => o.value === state.settings.dist)?.label || 'All';
  const countVal   = parseInt(document.getElementById('qCountInput').value);
  const estimate   = limitEstimateLabel(countVal);
  const countLabel = isNaN(countVal) || countVal <= 0 ? 'All' : countVal + ' questions' + (estimate ? ' (' + estimate + ')' : '');
  const orderLabel = ORDER_OPTIONS.find(o => o.value === state.settings.order)?.label || 'Unseen first';
  const modeLabel  = (state.settings.examMode ? ' \u00b7 Exam mode' : '') + (state.settings.answerBy === 'type' ? ' \u00b7 Typing' : '');
  document.getElementById('settingsSummary').textContent =
    'Starting with: ' + countLabel + ' \u00b7 ' + timerLabel + ' \u00b7 ' + distLabel + ' \u00b7 ' + orderLabel + modeLabel;
}

