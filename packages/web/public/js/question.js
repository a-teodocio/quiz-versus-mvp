// ─── Image error handler ────────────────────────────────────────────────────
function handleImgError(img, path) {
  const fname = path.split('\\').pop().split('/').pop();
  const ph = document.createElement('div');
  ph.style.cssText = 'padding:24px;text-align:center;color:var(--muted)';
  ph.innerHTML = '<div style="font-size:1.1rem;margin-bottom:4px">Image not available</div>' +
    '<div style="font-size:0.78rem">' + fname + '</div>';
  img.parentNode.replaceChild(ph, img);
}

// ─── Render question ────────────────────────────────────────────────────────
// Exam mode shows no feedback: an answered question just keeps the pick marked (it can be changed).
function markExamPick(selected) {
  const fb = document.getElementById('feedbackEl');
  fb.style.display = 'none'; fb.className = 'feedback';
  const el = selected === null ? null : document.querySelectorAll('.option')[selected];
  if (el) el.classList.add('selected');
}

// Length is counted in scored parts (a picture group is several), so the header and bar match the
// "N questions" on the home page and in the start window. Both helpers take the questions as an argument
// because the resume list reads them from a saved record.
function partsIn(q) {
  return q.type === 'image-group' ? (q.shuffledParts || q.parts).length : 1;
}

function totalPartsOf(questions) {
  return questions.reduce((sum, q) => sum + partsIn(q), 0);
}

// 1-based number of the part at (idx, partIdx).
function partPosition(questions, idx, partIdx) {
  let before = 0;
  for (let i = 0; i < idx; i++) before += partsIn(questions[i]);
  return before + partIdx + 1;
}

function renderProgress() {
  const pos = partPosition(state.questions, state.currentIdx, state.currentGroupPartIdx);
  document.getElementById('progressText').textContent = 'Question ' + pos + ' of ' + state.totalParts;
  document.getElementById('progressFill').style.width = (pos / state.totalParts * 100) + '%';
}

function renderQuestion() {
  saveResume();
  setNextLabel();
  const q = state.questions[state.currentIdx];
  // Mixed quizzes keep the generic "Mixed units" label: a question's own unit name narrows down the answer (v1.41.0)

  if (q.type === 'image-group') {
    const part = q.shuffledParts[state.currentGroupPartIdx];
    const partNum = state.currentGroupPartIdx + 1;
    const partTotal = q.shuffledParts.length;

    renderProgress();

    const imgWrap = document.getElementById('imageWrap');
    const img = document.getElementById('questionImage');
    img.src = '/image?path=' + encodeURIComponent(q.image_path);
    img.onclick = () => openZoom(img.src);
    img.onerror = () => handleImgError(img, q.image_path);
    imgWrap.classList.remove('hidden');

    const mode = answerMode(part);
    document.getElementById('questionLabel').textContent =
      answerLabel(mode, 'Part ' + partNum + ' of ' + partTotal);
    document.getElementById('questionText').textContent = part.question;

    setAnswerUI(mode);
    const opts = document.getElementById('optionsEl');
    opts.innerHTML = '';
    if (mode === 'pick') ['A','B','C','D'].forEach((letter, i) => {
      const optEl = document.createElement('div');
      optEl.className = 'option';
      optEl.dataset.idx = i;
      optEl.innerHTML = '<div class="option-letter">' + letter + '</div>' +
        '<div class="option-text">' + part.options[i] + '</div>';
      optEl.onclick = () => selectOption(i);
      opts.appendChild(optEl);
    });

    const histArr = state.answerHistory[state.currentIdx];
    const partHist = Array.isArray(histArr) ? histArr[state.currentGroupPartIdx] : null;
    const fb = document.getElementById('feedbackEl');
    if (mode !== 'pick') {
      renderTypedState(part, partHist);
    } else if (partHist) {
      state.selectedOption = partHist.selected;
      state.answered = true;
      if (state.settings.examMode === true) {
        markExamPick(partHist.selected);
      } else {
        document.querySelectorAll('.option').forEach((el, i) => {
          if (i === part.shuffledCorrect) el.classList.add('correct-answer');
          else if (partHist.selected !== null && i === partHist.selected && !partHist.isCorrect) el.classList.add('wrong-answer');
        });
        fb.style.display = 'block';
        fb.className = 'feedback ' + (partHist.isCorrect ? 'correct' : 'incorrect');
        document.getElementById('feedbackVerdict').textContent =
          partHist.isCorrect ? '\u2713 Correct!' : '\u2717 Incorrect';
        document.getElementById('feedbackText').innerHTML =
          '<strong>' + part.options[part.shuffledCorrect] + '</strong>: ' + part.explanation;
      }
      show('nextBtn');
    } else {
      state.selectedOption = null;
      state.answered = false;
      fb.style.display = 'none';
      fb.className = 'feedback';
      hide('nextBtn');
    }

    document.getElementById('backBtn').disabled =
      state.currentIdx === 0 && state.currentGroupPartIdx === 0;
    const isFlagged = state.flaggedIds.has(q.id);
    const flagBtn = document.getElementById('flagBtn');
    flagBtn.classList.toggle('flagged', isFlagged);
    flagBtn.textContent = isFlagged ? '\u2691 Flagged' : '\u2691 Flag';
    return;
  }

  const hist = state.answerHistory[state.currentIdx];
  state.selectedOption = hist ? hist.selected : null;
  state.answered = hist !== null;

  renderProgress();
  const mode = answerMode(q);
  document.getElementById('questionLabel').textContent = answerLabel(mode, null);

  const imgWrap = document.getElementById('imageWrap');
  const img = document.getElementById('questionImage');
  if (q.image_path) {
    img.src = '/image?path=' + encodeURIComponent(q.image_path);
    img.onclick = () => openZoom(img.src);
    img.onerror = () => handleImgError(img, q.image_path);
    imgWrap.classList.remove('hidden');
  } else {
    imgWrap.classList.add('hidden');
    img.src = '';
    img.onclick = null;
    img.onerror = null;
  }

  document.getElementById('questionText').textContent = q.question;

  setAnswerUI(mode);
  const opts = document.getElementById('optionsEl');
  opts.innerHTML = '';
  if (mode === 'pick') ['A','B','C','D'].forEach((letter, i) => {
    const optEl = document.createElement('div');
    optEl.className = 'option';
    optEl.dataset.idx = i;
    optEl.innerHTML = '<div class="option-letter">' + letter + '</div>' +
      '<div class="option-text">' + q.options[i] + '</div>';
    optEl.onclick = () => selectOption(i);
    opts.appendChild(optEl);
  });

  const fb = document.getElementById('feedbackEl');
  if (mode !== 'pick') {
    renderTypedState(q, hist);
  } else if (hist) {
    if (state.settings.examMode === true) {
      markExamPick(hist.selected);
    } else {
      document.querySelectorAll('.option').forEach((el, i) => {
        if (i === q.shuffledCorrect) el.classList.add('correct-answer');
        else if (i === hist.selected && !hist.isCorrect) el.classList.add('wrong-answer');
      });
      fb.style.display = 'block';
      fb.className = 'feedback ' + (hist.isCorrect ? 'correct' : 'incorrect');
      document.getElementById('feedbackVerdict').textContent =
        hist.isCorrect ? '\u2713 Correct!' : '\u2717 Incorrect';
      document.getElementById('feedbackText').innerHTML =
        '<strong>' + q.options[q.shuffledCorrect] + '</strong>: ' + q.explanation;
    }
    show('nextBtn');
  } else {
    fb.style.display = 'none'; fb.className = 'feedback';
    hide('nextBtn');
  }

  document.getElementById('backBtn').disabled = state.currentIdx === 0;
  const fq = state.questions[state.currentIdx];
  const isFlagged = state.flaggedIds.has(fq.question);
  const flagBtn = document.getElementById('flagBtn');
  flagBtn.classList.toggle('flagged', isFlagged);
  flagBtn.textContent = isFlagged ? '\u2691 Flagged' : '\u2691 Flag';
}

// Picking an option submits it; an answered question ignores further clicks, except in
// exam mode, where an answer can be changed after going back.
function selectOption(idx) {
  if ((state.answered && state.settings.examMode !== true) || state.timedOut) return;
  if (answerMode(currentItem()) !== 'pick') return;  // typed questions have no options to pick
  state.selectedOption = idx;
  document.querySelectorAll('.option').forEach((el, i) => el.classList.toggle('selected', i === idx));
  submitAnswer();
}

function submitAnswer() {
  if (state.selectedOption === null) return;
  state.answered = true;
  const q = state.questions[state.currentIdx];

  if (q.type === 'image-group') {
    const part = q.shuffledParts[state.currentGroupPartIdx];
    const isCorrect = state.selectedOption === part.shuffledCorrect;
    if (!Array.isArray(state.answerHistory[state.currentIdx]))
      state.answerHistory[state.currentIdx] = [];
    const prev = earlierAnswer(state.answerHistory[state.currentIdx][state.currentGroupPartIdx]);
    state.answerHistory[state.currentIdx][state.currentGroupPartIdx] =
      { id: part.id, selected: state.selectedOption, isCorrect };
    recordPerf(entryKeys(q)[state.currentGroupPartIdx], isCorrect, prev);
    if (!state.settings.examMode) {
      document.querySelectorAll('.option').forEach((el, i) => {
        el.classList.remove('selected');
        if (i === part.shuffledCorrect) el.classList.add('correct-answer');
        else if (i === state.selectedOption && !isCorrect) el.classList.add('wrong-answer');
      });
      const fb = document.getElementById('feedbackEl');
      fb.style.display = 'block';
      fb.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
      document.getElementById('feedbackVerdict').textContent =
        isCorrect ? '\u2713 Correct!' : '\u2717 Incorrect';
      document.getElementById('feedbackText').innerHTML =
        '<strong>' + part.options[part.shuffledCorrect] + '</strong>: ' + part.explanation;
    }
    if (prev && prev.isCorrect) state.score--;
    if (isCorrect) state.score++;
    show('nextBtn');
    revealFeedback();
    saveResume();
    advanceIfExam();
    return;
  }

  const isCorrect = state.selectedOption === q.shuffledCorrect;
  const prev = earlierAnswer(state.answerHistory[state.currentIdx]);
  state.answerHistory[state.currentIdx] = { id: q.id || null, selected: state.selectedOption, isCorrect };
  recordPerf(entryKeys(q)[0], isCorrect, prev);
  if (!state.settings.examMode) {
    document.querySelectorAll('.option').forEach((el, i) => {
      el.classList.remove('selected');
      if (i === q.shuffledCorrect) el.classList.add('correct-answer');
      else if (i === state.selectedOption && !isCorrect) el.classList.add('wrong-answer');
    });
    const fb = document.getElementById('feedbackEl');
    fb.style.display = 'block';
    fb.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
    document.getElementById('feedbackVerdict').textContent =
      isCorrect ? '\u2713 Correct!' : '\u2717 Incorrect';
    document.getElementById('feedbackText').innerHTML =
      '<strong>' + q.options[q.shuffledCorrect] + '</strong>: ' + q.explanation;
  }
  if (prev && prev.isCorrect) state.score--;
  if (isCorrect) state.score++;
  show('nextBtn');
  revealFeedback();
  saveResume();
  advanceIfExam();
}

// The answer being replaced when an exam answer is changed (null for a first answer, or for a
// part that was only flushed as skipped, which recorded nothing).
function earlierAnswer(h) {
  return h && h.selected !== null && h.selected !== undefined ? h : null;
}

// Exam mode shows no feedback, so picking an option is the whole step: once the answer is
// recorded and saved, the card slides out with the pick still highlighted, then the next
// question slides in. Next stays hidden meanwhile. The answer is already saved, so nothing is
// lost if the move never happens. Picking another option while the card slides out swaps the
// answer and brings the card back. Every other way of leaving the position (Back, exit, time up,
// a new session) cancels the move, and it only fires if the position is still the one that was
// answered. The last question stays up with "Finish exam" showing, so earlier answers can still
// be changed before the results open. Reduced motion skips the animation and moves straight on.
const EXAM_CARD_EXIT_MS = 200;

function advanceIfExam() {
  cancelPendingAdvance();
  if (state.settings.examMode === true && !isLastPosition()) {
    const idx = state.currentIdx, part = state.currentGroupPartIdx;
    const stillHere = () => state.currentIdx === idx && state.currentGroupPartIdx === part && !state.timedOut;
    const card = document.getElementById('questionCard');
    hide('nextBtn');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { nextQuestion(); return; }
    card.classList.remove('entering');
    card.classList.add('leaving');
    state.pendingAdvance = setTimeout(() => {
      state.pendingAdvance = null;
      if (!stillHere()) { card.classList.remove('leaving'); return; }
      nextQuestion();        // also takes the leaving class off
      card.classList.add('entering');
      card.addEventListener('animationend', () => card.classList.remove('entering'), { once: true });
    }, EXAM_CARD_EXIT_MS);
  }
}

function cancelPendingAdvance() {
  clearTimeout(state.pendingAdvance);
  state.pendingAdvance = null;
  document.getElementById('questionCard').classList.remove('leaving');
}

function isLastPosition() {
  const q = state.questions[state.currentIdx];
  return state.currentIdx === state.questions.length - 1 &&
    (q.type !== 'image-group' || state.currentGroupPartIdx === q.shuffledParts.length - 1);
}

// Exam mode ends on "Finish exam" instead of Next at the very last question or part.
function setNextLabel() {
  document.getElementById('nextBtn').textContent =
    state.settings.examMode === true && isLastPosition() ? 'Finish exam' : 'Next →';
}

// After a live answer, scroll just far enough that the whole explanation and the Next
// button are on screen. If both cannot fit, the explanation's top wins (it stays just
// below the sticky header). Exam mode shows no explanation, so the page stays put.
function revealFeedback() {
  if (state.settings.examMode) return;
  const gap = 16;
  const fb = document.getElementById('feedbackEl').getBoundingClientRect();
  const nb = document.getElementById('nextBtn').getBoundingClientRect();
  const headerH = document.querySelector('.header').offsetHeight;
  const dy = Math.min(nb.bottom + gap - window.innerHeight, fb.top - headerH - gap);
  if (dy > 0) window.scrollBy({ top: dy, behavior: scrollBehavior() });
}

// Moving to another question or part brings the page back to the top (smoothly) only when
// a different picture comes up, so it never starts scrolled out of view. Text-only
// questions and other parts of the same picture keep the scroll position.
function scrollToTopIfNewImage(prevImage) {
  const img = state.questions[state.currentIdx].image_path || null;
  if (img && img !== prevImage) scrollToTopSmooth();
}

function nextQuestion() {
  cancelPendingAdvance();
  const q = state.questions[state.currentIdx];
  const prevImage = q.image_path || null;
  if (q.type === 'image-group' && state.currentGroupPartIdx < q.shuffledParts.length - 1) {
    state.currentGroupPartIdx++;
    renderQuestion();
    scrollToTopIfNewImage(prevImage);
    return;
  }
  if (q.type === 'image-group') state.currentGroupPartIdx = 0;
  state.currentIdx++;
  if (state.currentIdx >= state.questions.length) showResults();
  else { renderQuestion(); scrollToTopIfNewImage(prevImage); }
}

function goBack() {
  cancelPendingAdvance();
  const prevImage = state.questions[state.currentIdx].image_path || null;
  if (state.currentGroupPartIdx > 0) {
    state.currentGroupPartIdx--;
    renderQuestion();
    scrollToTopIfNewImage(prevImage);
    return;
  }
  if (state.currentIdx === 0) return;
  state.currentIdx--;
  // back from the first question after a picture group lands on the group's last part, so the count steps back by one
  const before = state.questions[state.currentIdx];
  state.currentGroupPartIdx = before.type === 'image-group' ? before.shuffledParts.length - 1 : 0;
  renderQuestion();
  scrollToTopIfNewImage(prevImage);
}

// Header title: during a quiz it is the Exit button (same confirm, so the resume
// record and group-part flushing in confirmExit() stay correct); on the results
// page it goes home; on the home screen it does nothing.
function titleClick() {
  if (!document.getElementById('quizView').classList.contains('hidden')) { exitQuiz(); return; }
  if (!document.getElementById('resultsView').classList.contains('hidden')) backToHome();
}

function exitQuiz() { document.getElementById('exitConfirm').classList.add('active'); }
function cancelExit() { document.getElementById('exitConfirm').classList.remove('active'); }
function confirmExit() {
  cancelPendingAdvance();
  document.getElementById('exitConfirm').classList.remove('active');
  saveResume();  // before flushCurrentGroupParts, which marks unseen parts as skipped
  flushCurrentGroupParts();
  stopTimer();
  document.getElementById('timerDisplay').classList.add('hidden');
  hide('quizView'); hide('exitBtn'); show('homeView');
  scrollToTop();
  applyCourseSettings();
  updateResumePrompt();
  renderSessionHistory();
  updateProgressViews();
}

