// ─── Start confirmation ─────────────────────────────────────────────────────
// Every new session (start, mixed, restart, redo) waits on this modal, so the
// timer, which beginSession() starts, only runs once the user confirms.
// Resume skips it: its timer carries on from where it stopped.
let pendingStart = null;  // runs the session start once confirmed

// "about 25 min" / "about 1h 20m" for a number of seconds, rounded to the minute (never under 1 min).
function estimateLabel(secs) {
  const mins = Math.max(1, Math.round(secs / 60));
  return 'about ' + (mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm');
}

// `picked` is the set of questions this session will use, chosen before the window opens so the numbers
// shown are the ones played: Start runs startFn, which uses the same set, and Cancel throws it away.
// Length is counted in scored parts; entries are shown too because a picture group is one entry with several parts.
function requestStart(label, picked, startFn) {
  pendingStart = startFn;
  const timerLabel = TIMER_OPTIONS.find(o => o.secs === state.settings.timerSecs)?.label || 'No timer';
  const bits = [label, timerLabel];
  if (state.settings.examMode) bits.push('Exam mode');
  if (state.settings.answerBy === 'type') bits.push('Typing');
  const parts = picked.reduce((sum, q) => sum + (q.type === 'image-group' ? q.parts.length : 1), 0);
  const perPart = state.settings.answerBy === 'type' ? SECS_PER_TYPED : SECS_PER_PICK;
  const size = parts + (parts === 1 ? ' question' : ' questions') +
    (picked.length === parts ? '' : ' in ' + picked.length + (picked.length === 1 ? ' entry' : ' entries')) +
    ', ' + estimateLabel(parts * perPart);
  document.getElementById('startConfirmMsg').textContent = bits.join(' · ') + '. ' + size +
    (state.settings.timerSecs > 0 ? '. The timer starts when you press Start.' : '.');
  document.getElementById('startConfirm').classList.add('active');
  document.getElementById('startConfirmBtn').focus();
}

function confirmStart() {
  const startFn = pendingStart;
  pendingStart = null;
  document.getElementById('startConfirm').classList.remove('active');
  if (startFn) startFn();
}

function cancelStart() {
  pendingStart = null;
  document.getElementById('startConfirm').classList.remove('active');
}

// The loaded quiz only becomes state.quiz on confirmation, so Cancel leaves
// the previous quiz (if any) untouched.
async function startQuiz(fileOrFiles) {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  let quiz;
  try {
    quiz = await loadQuizFiles(files);
  } catch {
    showToast('Could not load the selected quiz file(s).');
    return;
  }
  const picked = applyDistribution(quiz.questions, getQCount(quiz.questions.length), state.settings.dist, state.settings.order);
  requestStart(quiz.title || 'Untitled quiz', picked, () => {
    state.quiz = quiz;
    document.getElementById('unitLabel').textContent = quiz.unit || '';
    beginSession(picked);
  });
}

// ─── Timer ──────────────────────────────────────────────────────────────────
function startTimer() {
  const el = document.getElementById('timerDisplay');
  el.classList.remove('warning', 'hidden');
  updateTimerDisplay();
  clearInterval(state.sessionTimerInterval);
  state.timerLastTick = Date.now();
  state.timerCarryMs = 0;
  state.sessionTimerInterval = setInterval(tickTimer, 1000);
}

// The timer follows the clock rather than counting ticks, because a locked screen or a
// backgrounded tab stops or throttles setInterval. Standard timers pause while the page is
// hidden (like a resume); the exam timer keeps running, so away time counts against it.
function tickTimer() {
  if (document.hidden && state.settings.examMode !== true) { state.timerLastTick = Date.now(); return; }
  advanceTimer();
}

function advanceTimer() {
  const now = Date.now();
  state.timerCarryMs += Math.max(0, now - state.timerLastTick);  // a clock set backwards adds nothing
  state.timerLastTick = now;
  const secs = Math.floor(state.timerCarryMs / 1000);
  if (secs <= 0) return;
  state.timerCarryMs -= secs * 1000;
  state.sessionTimerRemaining -= secs;
  updateTimerDisplay();

  // <= not ===: after a catch-up the exact second may have been skipped
  if (!state.halfwayWarningShown && state.sessionTimerRemaining > 0 &&
      state.sessionTimerRemaining <= Math.floor(state.settings.timerSecs / 2)) {
    state.halfwayWarningShown = true;
    showToast('\u23F1 Half your time remaining');
  }
  if (!state.threeMinWarningShown && state.sessionTimerRemaining <= 180 && state.sessionTimerRemaining > 0) {
    state.threeMinWarningShown = true;
    showToast('\u26A0\uFE0F 3 minutes remaining');
    document.getElementById('timerDisplay').classList.add('warning');
  }
  if (state.sessionTimerRemaining <= 0) {
    clearInterval(state.sessionTimerInterval);
    state.sessionTimerInterval = null;
    timeExpired();
  }
}

// Leaving the page (home button, lock screen, app switch) settles the clock and saves the
// resume record; coming back catches an exam timer up and restarts a standard one from now.
function onVisibilityChange() {
  const running = state.sessionTimerInterval !== null && !state.timedOut;
  if (document.hidden) {
    if (running) advanceTimer();
    saveResume();
  } else if (running) {
    if (state.settings.examMode) advanceTimer();
    else state.timerLastTick = Date.now();
  }
}

function updateTimerDisplay() {
  const rem = Math.max(0, state.sessionTimerRemaining);
  const m = Math.floor(rem / 60), s = rem % 60;
  document.getElementById('timerDisplay').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function stopTimer() {
  clearInterval(state.sessionTimerInterval);
  state.sessionTimerInterval = null;
}

function showToast(msg) {
  const el = document.getElementById('timerToast');
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 4500);
}

function timeExpired() {
  cancelPendingAdvance();
  state.timedOut = true;
  clearResume(state.sessionCourse);
  document.getElementById('endConfirm').classList.remove('active');
  document.getElementById('timeupModal').classList.add('active');
}

// Unanswered parts (never reached, or reached and left blank) in a questions / answerHistory
// pair. Walks the questions by index because the live history is sparse. Pure: it also
// reads the saved snapshots.
function countUnanswered(questions, history) {
  let n = 0;
  questions.forEach((q, i) => {
    const h = history[i];
    if (q.type === 'image-group') {
      q.shuffledParts.forEach((p, pi) => {
        const ph = Array.isArray(h) ? h[pi] : null;
        if (!ph || ph.selected === null) n++;
      });
    } else if (!h || h.selected === null) {
      n++;
    }
  });
  return n;
}

// End exam button (every mode): confirm, then fill the gaps and open the results.
function endExam() {
  if (state.timedOut || !state.questions.length) return;
  const left = countUnanswered(state.questions, state.answerHistory);
  const answered = state.totalParts - left;
  document.getElementById('endConfirmMsg').textContent = left === 0
    ? 'You have answered every question. Open your results now?'
    : answered + ' of ' + state.totalParts + ' answered. The ' + left + ' unanswered ' +
      (left === 1 ? 'question' : 'questions') + ' will show in your results with the correct answer, ' +
      'marked Unanswered, and will not count as attempts.';
  document.getElementById('endConfirm').classList.add('active');
  document.getElementById('endKeepBtn').focus();
}
function cancelEndExam() {
  document.getElementById('endConfirm').classList.remove('active');
  document.activeElement.blur();  // a focused button would otherwise also take Enter / Space meant for Next
}
function confirmEndExam() {
  document.getElementById('endConfirm').classList.remove('active');
  document.activeElement.blur();
  if (state.timedOut) return;
  cancelPendingAdvance();
  state.endedEarly = true;
  flushCurrentGroupParts();
  showResults();
}

// Fills every gap in the history so the results see all questions: unanswered group parts
// get a skipped record, a standalone never answered becomes null.
function flushCurrentGroupParts() {
  state.questions.forEach((q, idx) => {
    if (q.type !== 'image-group') {
      if (state.answerHistory[idx] === undefined) state.answerHistory[idx] = null;
      return;
    }
    if (!Array.isArray(state.answerHistory[idx])) state.answerHistory[idx] = [];
    q.shuffledParts.forEach((part, pi) => {
      if (state.answerHistory[idx][pi] === undefined)
        state.answerHistory[idx][pi] = { id: part.id, selected: null, isCorrect: false };
    });
  });
}

function viewResults() {
  document.getElementById('timeupModal').classList.remove('active');
  flushCurrentGroupParts();
  showResults();
}

