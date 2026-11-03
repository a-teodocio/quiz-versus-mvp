// ─── Results ────────────────────────────────────────────────────────────────
function showResults() {
  hide('quizView'); show('resultsView'); hide('exitBtn');
  scrollToTop();
  clearResume(state.sessionCourse);
  recordSession();
  stopTimer();
  document.getElementById('timerDisplay').classList.add('hidden');
  document.getElementById('resultsView').classList.remove('results-readonly');
  hide('viewerNote');

  renderScoreBanner(state.score, state.totalParts, state.timedOut, state.endedEarly,
    countUnanswered(state.questions, state.answerHistory));
  renderResultCards(state.questions, state.answerHistory);

  const hasFlagged = state.quiz.questions.some(q =>
    q.type === 'image-group' ? state.flaggedIds.has(q.id) : state.flaggedIds.has(q.question));
  const hasWrong = hasWrongAnswer(state.answerHistory);
  document.getElementById('examBadge').classList.toggle('hidden', !state.settings.examMode);
  document.getElementById('redoFlaggedBtn').classList.toggle('hidden', !hasFlagged);
  document.getElementById('redoMissedBtn').classList.toggle('hidden', !hasWrong);
  document.getElementById('redoMissedBtnTop').classList.toggle('hidden', !hasWrong);
  document.getElementById('redoFlaggedBtnTop').classList.toggle('hidden', !hasFlagged);
  closeRoundMenu();
  document.getElementById('filterIncorrect').classList.toggle('hidden', !hasWrong);
  setResultsFilter('all');
}

// "Another round" menu on the results page: Generate New Quiz and the redo buttons in one place.
function toggleRoundMenu() {
  const open = document.getElementById('roundMenu').classList.contains('hidden');
  if (open) { show('roundMenu'); } else { hide('roundMenu'); }
  document.getElementById('roundMenuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeRoundMenu() {
  hide('roundMenu');
  document.getElementById('roundMenuBtn').setAttribute('aria-expanded', 'false');
}

// A wrong or unanswered part anywhere in the history (null = never answered).
function hasWrongAnswer(history) {
  return history.some(h => Array.isArray(h) ? h.some(ph => !ph || !ph.isCorrect) : (!h || !h.isCorrect));
}

function renderScoreBanner(score, total, timedOut, endedEarly, unanswered) {
  const pct = total > 0 ? Math.round(score / total * 100) : 0;

  document.getElementById('scoreDisplay').textContent = score + '/' + total;

  const pctEl = document.getElementById('scorePct');
  pctEl.textContent = pct + '%';
  pctEl.className = 'score-pct ' + (pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo');

  let note = timedOut ? 'Time’s up: ' : endedEarly ? 'Ended early: ' : '';
  if (unanswered > 0) note += unanswered + ' unanswered: ';
  note += pct >= 80 ? 'Great work!' : pct >= 60 ? 'Keep studying.' : 'Review this unit.';
  document.getElementById('scoreNote').textContent = note;
}

// Builds the result cards from a questions/answerHistory pair. Used for the
// session just finished (state) and for saved sessions (history snapshots), so
// both must be in the shuffled shape: options in display order, shuffledCorrect.
function renderResultCards(questions, answerHistory) {
  const list = document.getElementById('resList');
  list.innerHTML = '';
  const letters = ['A','B','C','D'];

  questions.forEach((q, i) => {
    if (q.type === 'image-group') {
      const histArr = answerHistory[i];
      const allCorrect = Array.isArray(histArr) && histArr.length > 0 &&
        histArr.every(function(ph) { return ph && ph.isCorrect; });
      const noneAnswered = q.shuffledParts.every(function(part, pi) {
        const ph = Array.isArray(histArr) ? histArr[pi] : null;
        return !ph || ph.selected === null;
      });
      const groupStatus = allCorrect ? 'correct' : noneAnswered ? 'skip' : 'wrong';
      let groupImgHtml = '';
      if (q.image_path) {
        groupImgHtml = '<div class="res-img-wrap"><img class="res-img" src="/image?path=' +
          encodeURIComponent(q.image_path) + '" alt="Slide" onclick="openZoom(this.src)" ' +
          'onerror="handleImgError(this,' + JSON.stringify(q.image_path) + ')"></div>';
      }
      let partsHtml = '';
      let correctParts = 0;
      q.shuffledParts.forEach(function(part, pi) {
        const ph = Array.isArray(histArr) ? histArr[pi] : null;
        const partStatus = !ph || ph.selected === null ? 'skip' : ph.isCorrect ? 'correct' : 'wrong';
        const partBadge = partStatus === 'correct' ? 'Correct' : partStatus === 'wrong' ? 'Wrong' : 'Unanswered';
        let answerHtml = '';
        part.options.forEach(function(opt, j) {
          let cls = 'res-opt';
          if (j === part.shuffledCorrect) cls += ' res-opt-correct';
          else if (ph && ph.selected !== null && j === ph.selected && !ph.isCorrect) cls += ' res-opt-wrong';
          answerHtml += '<div class="' + cls + '">' + letters[j] + '. ' + opt + '</div>';
        });
        // Correct parts start folded when the group has a wrong or skipped part, so the
        // missed part sits close to the picture. A fully correct group stays open.
        const fold = !allCorrect && partStatus === 'correct';
        if (fold) correctParts++;
        partsHtml +=
          '<div class="res-group-part' + (fold ? ' collapsed' : '') + '">' +
            '<div class="res-group-part-head" role="button" tabindex="0" aria-expanded="' + (fold ? 'false' : 'true') + '" ' +
              'onclick="togglePart(this)" onkeydown="partKey(event, this)">' +
              '<span class="res-chev">&#x25BE;</span>' +
              '<div class="res-q">' + part.question + '</div>' +
              '<div class="res-badge ' + partStatus + '">' + partBadge + '</div>' +
            '</div>' +
            typedResultHtml(ph) +
            '<div class="res-opts">' + answerHtml + '</div>' +
            '<div class="res-expl">' + part.explanation + '</div>' +
          '</div>';
      });
      const card = document.createElement('div');
      card.className = 'res-card';
      card.dataset.status = groupStatus;
      card.innerHTML =
        '<div class="res-head">' +
          '<div class="res-num">Q' + (i + 1) + '</div>' +
          '<div class="res-badge ' + groupStatus + '">' + (groupStatus === 'correct' ? 'All Correct' : groupStatus === 'skip' ? 'Unanswered' : 'Review') + '</div>' +
          (correctParts > 0 ? '<button class="btn btn-secondary btn-sm res-group-toggle" onclick="toggleCorrectParts(this)">Expand correct</button>' : '') +
        '</div>' +
        '<div class="res-body">' +
          groupImgHtml +
          '<div class="res-group-parts">' + partsHtml + '</div>' +
        '</div>';
      list.appendChild(card);
      return;
    }
    const hist = answerHistory[i];
    const status = !hist || hist.selected === null ? 'skip' : hist.isCorrect ? 'correct' : 'wrong';
    const badgeText = status === 'correct' ? 'Correct' : status === 'wrong' ? 'Wrong' : 'Unanswered';

    let imgHtml = '';
    if (q.image_path) {
      imgHtml = '<div class="res-img-wrap"><img class="res-img" src="/image?path=' +
        encodeURIComponent(q.image_path) + '" alt="Slide" onclick="openZoom(this.src)" ' +
        'onerror="handleImgError(this,' + JSON.stringify(q.image_path) + ')"></div>';
    }

    let optsHtml = '';
    q.options.forEach((opt, j) => {
      let cls = 'res-opt';
      if (j === q.shuffledCorrect) cls += ' res-opt-correct';
      else if (hist && j === hist.selected && !hist.isCorrect) cls += ' res-opt-wrong';
      optsHtml += '<div class="' + cls + '">' + letters[j] + '. ' + opt + '</div>';
    });

    const card = document.createElement('div');
    card.className = 'res-card';
    card.dataset.status = status;
    card.innerHTML =
      '<div class="res-head">' +
        '<div class="res-num">Q' + (i + 1) + '</div>' +
        '<div class="res-badge ' + status + '">' + badgeText + '</div>' +
      '</div>' +
      '<div class="res-body">' +
        imgHtml +
        '<div class="res-q">' + q.question + '</div>' +
        typedResultHtml(hist) +
        '<div class="res-opts">' + optsHtml + '</div>' +
        '<div class="res-expl">' + q.explanation + '</div>' +
      '</div>';
    list.appendChild(card);
  });
}

// Fold or unfold one group part (click or Enter/Space on its header row).
function setPartCollapsed(part, collapsed) {
  part.classList.toggle('collapsed', collapsed);
  part.querySelector('.res-group-part-head').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}
function togglePart(head) {
  const part = head.parentElement;
  setPartCollapsed(part, !part.classList.contains('collapsed'));
  syncGroupToggle(part.closest('.res-card'));
}
function partKey(e, head) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePart(head); }
}
// The card's button acts on its correct parts only: "Collapse correct" while any is open, else "Expand correct".
function correctPartsOf(card) {
  return Array.from(card.querySelectorAll('.res-group-part')).filter(function(p) {
    return p.querySelector('.res-badge.correct');
  });
}
function syncGroupToggle(card) {
  const btn = card.querySelector('.res-group-toggle');
  if (!btn) return;
  const anyOpen = correctPartsOf(card).some(function(p) { return !p.classList.contains('collapsed'); });
  btn.textContent = anyOpen ? 'Collapse correct' : 'Expand correct';
}
function toggleCorrectParts(btn) {
  const card = btn.closest('.res-card');
  const parts = correctPartsOf(card);
  const collapse = parts.some(function(p) { return !p.classList.contains('collapsed'); });
  parts.forEach(function(p) { setPartCollapsed(p, collapse); });
  syncGroupToggle(card);
}

// Read-only view of a saved session from the home screen's "Recent sessions".
// Reuses the results page; the session-only buttons (restart, redo) are hidden
// by the results-readonly class because there is no live session behind it.
function viewHistoryEntry(e) {
  if (!e || !e.snapshot) return;
  hide('homeView'); hide('quizView'); show('resultsView'); hide('exitBtn');
  scrollToTop();
  document.getElementById('resultsView').classList.add('results-readonly');
  const note = document.getElementById('viewerNote');
  note.textContent = 'Saved results · ' + e.title + ' · ' + formatSessionDate(e.at) + ' · read-only';
  note.classList.remove('hidden');

  renderScoreBanner(e.score, e.total, e.timedOut === true, e.endedEarly === true,
    countUnanswered(e.snapshot.questions, e.snapshot.answerHistory));
  renderResultCards(e.snapshot.questions, e.snapshot.answerHistory);
  document.getElementById('examBadge').classList.toggle('hidden', e.exam !== true);
  document.getElementById('filterIncorrect').classList.toggle('hidden', !hasWrongAnswer(e.snapshot.answerHistory));
  setResultsFilter('all');
}

function setResultsFilter(mode) {
  document.getElementById('filterAll').classList.toggle('active', mode === 'all');
  document.getElementById('filterIncorrect').classList.toggle('active', mode === 'incorrect');
  document.querySelectorAll('.res-card').forEach(card => {
    card.style.display = (mode === 'incorrect' && card.dataset.status === 'correct') ? 'none' : '';
  });
}

function toggleFlag() {
  const q = state.questions[state.currentIdx];
  const key = q.type === 'image-group' ? q.id : q.question;
  if (state.flaggedIds.has(key)) {
    state.flaggedIds.delete(key);
  } else {
    state.flaggedIds.add(key);
  }
  saveFlagsToStorage();
  const isFlagged = state.flaggedIds.has(key);
  const btn = document.getElementById('flagBtn');
  btn.classList.toggle('flagged', isFlagged);
  btn.textContent = isFlagged ? '\u2691 Flagged' : '\u2691 Flag';
}

function saveFlagsToStorage() {
  try { localStorage.setItem('mlsquiz_flags', JSON.stringify([...state.flaggedIds])); } catch {}
}

function redoFlagged() {
  const originals = state.quiz.questions.filter(q =>
    q.type === 'image-group' ? state.flaggedIds.has(q.id) : state.flaggedIds.has(q.question));
  if (!originals.length) return;
  requestStart('Redo flagged', originals, () => beginSession(originals, true));
}

function redoMissed() {
  const missedTexts = new Set();
  const missedGroups = new Set();
  // By question index, not forEach over the history: it is sparse. Unanswered counts as missed.
  state.questions.forEach((q, i) => {
    const h = state.answerHistory[i];
    if (q.type === 'image-group') {
      if (!Array.isArray(h) || h.some(ph => !ph || !ph.isCorrect)) missedGroups.add(q.id);
    } else if (!h || !h.isCorrect) {
      missedTexts.add(q.question);
    }
  });
  const originals = state.quiz.questions.filter(q =>
    q.type === 'image-group' ? missedGroups.has(q.id) : missedTexts.has(q.question));
  if (!originals.length) return;
  requestStart('Redo missed/incorrect', originals, () => beginSession(originals, true));
}

function restartQuiz() {
  const picked = applyDistribution(state.quiz.questions, getQCount(state.quiz.questions.length), state.settings.dist, state.settings.order);
  requestStart(state.quiz.title || 'Untitled quiz', picked, () => {
    hide('resultsView');
    beginSession(picked);
  });
}

function backToHome() {
  hide('resultsView'); hide('quizView');
  stopTimer();
  document.getElementById('timerDisplay').classList.add('hidden');
  show('homeView');
  scrollToTop();
  applyCourseSettings();  // a resumed session may have left another course's settings on screen
  updateResumePrompt();
  renderSessionHistory();
  updateProgressViews();
  measureStickyOffsets();  // the bar had no height while the home page was hidden
}

