// ─── Shuffle helper ─────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Per-session question shuffle ───────────────────────────────────────────
function shuffleQuestion(q) {
  if (q.type === 'image-group') {
    const shuffledParts = q.parts.map(function(p) {
      const shuffledOptions = shuffle(p.options);
      const shuffledCorrect = shuffledOptions.indexOf(p.options[p.correct]);
      return Object.assign({}, p, { options: shuffledOptions, shuffledCorrect: shuffledCorrect });
    });
    return Object.assign({}, q, { shuffledParts: shuffledParts });
  }
  const shuffledOptions = shuffle(q.options);
  const shuffledCorrect = shuffledOptions.indexOf(q.options[q.correct]);
  return Object.assign({}, q, { options: shuffledOptions, shuffledCorrect });
}

// ─── Typed answers (v1.37.0) ────────────────────────────────────────────────
// "Answer by: Type" shows a text box instead of the options. The expected text is the correct
// option. A short, plain answer (letters, spaces, hyphens, apostrophes, at most 3 words) is
// checked automatically and one wrong letter is wrong; an answer of more than 3 words stays multiple
// choice in both modes (v1.42.0); one with digits, commas or slashes is self-graded after the
// answer is shown. Exam mode shows no answer until the end, so there the self-graded questions
// stay multiple choice too. A typed answer is stored in the same
// answerHistory slot as a pick: {id, selected, isCorrect, typed, manual}, where selected is the
// correct option's index when right and -1 when wrong, so every "was it answered" test still holds.
const TYPED_CHARS = /^[\p{L}' ’-]+$/u;
const TYPED_MAX_WORDS = 3;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// An answer of more than TYPED_MAX_WORDS words is too long to type. Bracketed words do not count:
// "Loose (areolar) connective tissue" is three words.
function answerTooLong(correct) {
  const bare = String(correct).replace(/\([^()]*\)/g, ' ').trim();
  return (bare ? bare.split(/\s+/).length : 0) > TYPED_MAX_WORDS;
}

// The texts that count as the right answer, or null when it cannot be checked automatically.
// "Periodic acid-Schiff (PAS)": either part, or both. "Loose (areolar) connective tissue": with or
// without the bracketed word.
function answerForms(correct) {
  const text = String(correct).replace(/\s+/g, ' ').trim();
  const opens = (text.match(/\(/g) || []).length;
  let forms;
  if (opens === 0) {
    forms = [text];
  } else if (opens === 1) {
    const m = text.match(/^(.*?)\s*\(([^()]*)\)\s*(.*)$/);
    if (!m) return null;
    const join = (...p) => p.filter(Boolean).join(' ');
    forms = [join(m[1], m[3]), join(m[1], m[2], m[3])];
    if (m[1] && !m[3]) forms.push(m[2]);  // a trailing bracket is a name of its own
  } else {
    return null;
  }
  forms = forms.filter(Boolean);
  if (!forms.length) return null;
  return forms.every(f => TYPED_CHARS.test(f)) && !answerTooLong(text) ? forms : null;
}

// Capitals, accents, apostrophes (any style, present or not), hyphen vs space, extra spaces and a
// leading the / a / an do not matter; letters do.
function normTyped(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['‘’ʼ`´]/g, '')
    .replace(/[-‐-―]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an) /, '');
}

// Equal, or equal apart from a plural ending on the last word (cell / cells).
function sameTyped(a, b) {
  if (a === b) return true;
  const x = a.split(' '), y = b.split(' ');
  if (x.length !== y.length) return false;
  const n = x.length - 1;
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
  const p = x[n], r = y[n];
  return p === r + 's' || r === p + 's' || p === r + 'es' || r === p + 'es';
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// { ok, near, form }: ok = right; near = wrong by a letter or two (a spelling slip, still wrong);
// form = the accepted text it was closest to. Not auto-checkable answers are never ok.
function checkTyped(typed, correct) {
  const forms = answerForms(correct);
  const t = normTyped(typed);
  if (!forms || !t) return { ok: false, near: false, form: correct };
  const norms = forms.map(normTyped);
  if (norms.some(f => sameTyped(t, f))) return { ok: true, near: false, form: correct };
  let best = Infinity, at = 0;
  norms.forEach((f, i) => { const d = editDistance(t, f); if (d < best) { best = d; at = i; } });
  return { ok: false, near: best <= 2 && best < Math.ceil(norms[at].length / 2), form: forms[at] };
}

function foldChar(c) {
  const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return f === '-' ? ' ' : (f === '‘' || f === '’') ? "'" : f;
}

// Marks the letters that differ: .d-bad in what was typed (wrong or extra), .d-fix in the
// expected text (missing or different).
function diffHtml(typed, expected) {
  const a = Array.from(typed), b = Array.from(expected);
  const fa = a.map(foldChar), fb = b.map(foldChar);
  const n = a.length, m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); dp[i][0] = i; }
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (fa[i - 1] === fb[j - 1] ? 0 : 1));
    }
  }
  const badA = new Array(n).fill(false), badB = new Array(m).fill(false);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && fa[i - 1] === fb[j - 1] && dp[i][j] === dp[i - 1][j - 1]) { i--; j--; }
    else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) { badA[i - 1] = true; badB[j - 1] = true; i--; j--; }
    else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { badA[i - 1] = true; i--; }
    else { badB[j - 1] = true; j--; }
  }
  const wrap = (chars, bad, cls) =>
    chars.map((c, k) => bad[k] ? '<span class="' + cls + '">' + esc(c) + '</span>' : esc(c)).join('');
  return { typed: wrap(a, badA, 'd-bad'), expected: wrap(b, badB, 'd-fix') };
}

function el(id) { return document.getElementById(id); }

// The question or image-group part on screen (the shuffled copy).
function currentItem() {
  const q = state.questions[state.currentIdx];
  return q.type === 'image-group' ? q.shuffledParts[state.currentGroupPartIdx] : q;
}

// 'pick': options. 'auto': typed and checked. 'self': typed, shown, marked by the student.
function answerMode(item) {
  if (state.settings.answerBy !== 'type') return 'pick';
  const correct = item.options[item.shuffledCorrect];
  if (answerTooLong(correct)) return 'pick';
  if (answerForms(correct)) return 'auto';
  return state.settings.examMode === true ? 'pick' : 'self';
}

function currentHist() {
  const h = state.answerHistory[state.currentIdx];
  return Array.isArray(h) ? h[state.currentGroupPartIdx] : h;
}

function setCurrentHist(rec) {
  if (state.questions[state.currentIdx].type === 'image-group') {
    if (!Array.isArray(state.answerHistory[state.currentIdx])) state.answerHistory[state.currentIdx] = [];
    state.answerHistory[state.currentIdx][state.currentGroupPartIdx] = rec;
  } else {
    state.answerHistory[state.currentIdx] = rec;
  }
}

function currentPerfKey() {
  const q = state.questions[state.currentIdx];
  return entryKeys(q)[q.type === 'image-group' ? state.currentGroupPartIdx : 0];
}

// Shows the typing box instead of the options (or the other way round) for the question on screen.
function setAnswerUI(mode) {
  const typing = mode !== 'pick';
  el('optionsEl').classList.toggle('hidden', typing);
  el('typeWrap').classList.toggle('hidden', !typing);
  el('typedActions').classList.add('hidden');
  state.typedPending = null;
  if (typing) el('optionsEl').innerHTML = '';
}

// Label above the question; a multiple-choice question in a typing session says why it is one:
// the answer is too long to type, or (exam mode only) it would have to be marked by hand.
function answerLabel(mode, base, item) {
  if (mode !== 'pick') return base === null ? 'Type your answer' : base + ' · type your answer';
  let why = '';
  if (state.settings.answerBy === 'type') {
    why = answerTooLong(item.options[item.shuffledCorrect])
      ? ' · answer too long to type'
      : ' · cannot be typed in exam mode';
  }
  return (base === null ? 'Multiple choice' : base) + why;
}

// Puts the typing box in the state the stored answer (or none) calls for.
function renderTypedState(item, h) {
  const exam = state.settings.examMode === true;
  const done = !!h && h.selected !== null && h.selected !== undefined;
  const input = el('typeInput');
  state.typedPending = null;
  state.selectedOption = done ? h.selected : null;
  state.answered = done;
  input.value = done && h.typed ? h.typed : '';
  input.readOnly = done && !exam;
  el('typeCheckBtn').textContent = exam ? 'Save' : 'Check';
  el('typeCheckBtn').classList.toggle('hidden', done && !exam);
  el('typeSkipBtn').classList.toggle('hidden', exam || done);
  const fb = el('feedbackEl');
  if (done && !exam) {
    showTypedFeedback(item, h);
  } else {
    fb.style.display = 'none'; fb.className = 'feedback';
  }
  if (done) show('nextBtn'); else hide('nextBtn');
  if (!done || exam) input.focus({ preventScroll: true });
}

function typedLines(typedHtml, answerHtml, explanation) {
  return '<div class="typed-line"><span class="typed-tag">You typed</span><span class="typed-val">' + typedHtml + '</span></div>' +
    '<div class="typed-line"><span class="typed-tag">Answer</span><span class="typed-val"><strong>' + answerHtml + '</strong></span></div>' +
    '<div class="typed-expl">' + explanation + '</div>';
}

// The buttons under the feedback: marking a self-graded answer, or changing a verdict afterwards.
function updateTypedActions(h, pending) {
  const right = el('typedRightBtn'), wrong = el('typedWrongBtn');
  let showRight = false, showWrong = false;
  if (pending) {
    showRight = showWrong = true;
    right.textContent = '✓ I got it right (1)';
    wrong.textContent = '✗ I got it wrong (2)';
  } else if (!h.isCorrect) {
    showRight = !!h.typed;
    right.textContent = '✓ Count it as right';
  } else if (h.manual) {
    showWrong = true;
    wrong.textContent = '✗ Count it as wrong';
  }
  right.classList.toggle('hidden', !showRight);
  wrong.classList.toggle('hidden', !showWrong);
  el('typedActions').classList.toggle('hidden', !showRight && !showWrong);
}

// Standard mode: the verdict for a typed answer, with the typed text beside the answer (a near
// miss marks the letters that differ).
function showTypedFeedback(item, h) {
  const correct = item.options[item.shuffledCorrect];
  const res = checkTyped(h.typed, correct);
  let typedHtml = h.typed ? esc(h.typed) : '<em>(no answer)</em>';
  let answerHtml = esc(correct);
  let verdict;
  if (h.manual) {
    verdict = h.isCorrect ? '✓ Marked as right' : '✗ Marked as wrong';
  } else if (h.isCorrect) {
    verdict = '✓ Correct!';
  } else if (res.near) {
    verdict = '✗ Almost: check the spelling';
    const d = diffHtml(h.typed, res.form);
    typedHtml = d.typed;
    answerHtml = d.expected + (res.form !== correct ? ' <span class="typed-note">(full answer: ' + esc(correct) + ')</span>' : '');
  } else {
    verdict = '✗ Incorrect';
  }
  const fb = el('feedbackEl');
  fb.style.display = 'block';
  fb.className = 'feedback ' + (h.isCorrect ? 'correct' : 'incorrect');
  el('feedbackVerdict').textContent = verdict;
  el('feedbackText').innerHTML = typedLines(typedHtml, answerHtml, item.explanation);
  updateTypedActions(h, false);
}

// A self-graded answer: show the answer next to what was typed and wait for the student's verdict.
function showSelfGradePrompt(item, typed) {
  state.typedPending = typed;
  const input = el('typeInput');
  input.readOnly = true;
  input.blur();
  hide('typeCheckBtn'); hide('typeSkipBtn');
  const fb = el('feedbackEl');
  fb.style.display = 'block';
  fb.className = 'feedback pending';
  el('feedbackVerdict').textContent = 'Compare with the answer, then mark yourself';
  el('feedbackText').innerHTML = typedLines(esc(typed), esc(item.options[item.shuffledCorrect]), item.explanation);
  updateTypedActions(null, true);
  fb.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
}

// Records a typed answer (auto-checked, marked by the student, or given up) in the same places a
// picked answer goes: history slot, progress, score, resume. In exam mode there is no feedback and
// the move on follows, as for a pick; a changed answer replaces the earlier one.
function recordTyped(typed, isCorrect, manual) {
  const item = currentItem();
  const exam = state.settings.examMode === true;
  const rec = { id: item.id || null, selected: isCorrect ? item.shuffledCorrect : -1, isCorrect, typed, manual: manual === true };
  const prev = earlierAnswer(currentHist());
  setCurrentHist(rec);
  recordPerf(currentPerfKey(), isCorrect, prev);
  if (prev && prev.isCorrect) state.score--;
  if (isCorrect) state.score++;
  state.selectedOption = rec.selected;
  state.answered = true;
  state.typedPending = null;
  if (!exam) {
    const input = el('typeInput');
    input.readOnly = true;
    input.blur();
    hide('typeCheckBtn'); hide('typeSkipBtn');
    showTypedFeedback(item, rec);
  }
  show('nextBtn');
  revealFeedback();
  saveResume();
  advanceIfExam();
}

function submitTyped() {
  if (state.timedOut || !state.questions.length) return;
  const item = currentItem();
  const mode = answerMode(item);
  if (mode === 'pick') return;
  const exam = state.settings.examMode === true;
  if ((state.answered && !exam) || state.typedPending !== null) return;
  const typed = el('typeInput').value.replace(/\s+/g, ' ').trim();
  if (!typed) return;
  if (mode === 'self') { showSelfGradePrompt(item, typed); return; }
  recordTyped(typed, checkTyped(typed, item.options[item.shuffledCorrect]).ok, false);
}

// "I don't know": counts as wrong and shows the answer.
function giveUpTyped() {
  if (state.timedOut || !state.questions.length || state.answered || state.typedPending !== null) return;
  if (answerMode(currentItem()) === 'pick' || state.settings.examMode === true) return;
  recordTyped('', false, false);
}

// Marks a self-graded answer, or changes the verdict on a typed answer afterwards (standard mode).
function gradeTyped(ok) {
  if (state.timedOut || !state.questions.length) return;
  if (state.typedPending !== null) { recordTyped(state.typedPending, ok, true); return; }
  const h = currentHist();
  if (!h || h.typed === undefined || h.isCorrect === ok || state.settings.examMode === true) return;
  const item = currentItem();
  const rec = Object.assign({}, h, { isCorrect: ok, selected: ok ? item.shuffledCorrect : -1, manual: true });
  setCurrentHist(rec);
  recordPerf(currentPerfKey(), ok, h);
  state.score += ok ? 1 : -1;
  state.selectedOption = rec.selected;
  showTypedFeedback(item, rec);
  saveResume();
}

// "You typed" line on the results cards (typed answers only).
function typedResultHtml(h) {
  if (!h || h.typed === undefined) return '';
  return '<div class="res-typed ' + (h.isCorrect ? 'ok' : 'no') + '">You typed: <b>' +
    (h.typed ? esc(h.typed) : '(no answer)') + '</b>' + (h.manual ? ' (marked by you)' : '') + '</div>';
}

