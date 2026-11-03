document.addEventListener('click', e => {
  if (!e.target.closest('#roundMenuWrap')) closeRoundMenu();
  if (!e.target.closest('#themeWrap')) closeThemeMenu(false);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('themeMenu').classList.contains('hidden')) { closeThemeMenu(true); return; }
    if (!document.getElementById('roundMenu').classList.contains('hidden')) { closeRoundMenu(); return; }
    if (document.getElementById('exitConfirm').classList.contains('active')) { cancelExit(); return; }
    if (document.getElementById('endConfirm').classList.contains('active')) { cancelEndExam(); return; }
    if (document.getElementById('startConfirm').classList.contains('active')) { cancelStart(); return; }
    if (document.getElementById('progressModal').classList.contains('active')) { closeProgressModal(); return; }
    closeZoom();
    return;
  }
  if (e.key === 'Enter' && document.getElementById('startConfirm').classList.contains('active')) {
    e.preventDefault();  // the focused Start button would otherwise also fire its click
    confirmStart();
    return;
  }
  // The open menu has its own keys (Enter, Space and 1-4 must not answer the quiz); on the closed button only
  // Enter and Space are its own, so 1-4 still answer after the menu was closed.
  if (e.target && e.target.closest && (e.target.closest('#themeMenu') || (e.target.id === 'themeBtn' && (e.key === 'Enter' || e.code === 'Space')))) return;
  if (document.getElementById('quizView').classList.contains('hidden')) return;
  if (document.querySelector('.modal-overlay.active') || document.getElementById('zoomOverlay').classList.contains('active')) return;
  if (e.target && e.target.id === 'typeInput') return;  // typing: the box handles Enter itself
  if (state.typedPending !== null && (e.key === '1' || e.key === '2')) { gradeTyped(e.key === '1'); return; }
  if (['1','2','3','4'].includes(e.key)) selectOption(parseInt(e.key) - 1);
  const nextShown = !document.getElementById('nextBtn').classList.contains('hidden');
  if (e.key === 'Enter' && nextShown) nextQuestion();
  if (e.key === ' ' && nextShown) {
    e.preventDefault();  // no page scroll
    if (e.repeat) return;  // holding the bar must not skip ahead
    document.activeElement.blur();  // a focused button would otherwise click on key-up
    nextQuestion();
  }
});

window.addEventListener('beforeunload', saveResume);  // captures the latest timer value
window.addEventListener('pagehide', saveResume);        // mobile browsers often skip beforeunload
document.addEventListener('visibilitychange', onVisibilityChange);

initUI();
updateProgressViews();
loadQuizList();
updateResumePrompt();
renderSessionHistory();
