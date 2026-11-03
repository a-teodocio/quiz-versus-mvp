// ─── UI init ────────────────────────────────────────────────────────────────
function initUI() {
  buildThemeMenu();

  try {
    const savedFlags = localStorage.getItem('mlsquiz_flags');
    if (savedFlags) state.flaggedIds = new Set(JSON.parse(savedFlags));
  } catch {}

  state.perf = loadPerf();

  const tGrid = document.getElementById('timerOptions');
  TIMER_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 't-opt' + (opt.secs === 0 ? ' on' : '');
    btn.textContent = opt.label;
    btn.dataset.secs = opt.secs;
    btn.onclick = () => selectTimerOption(opt.secs);
    tGrid.appendChild(btn);
  });

  const dGrid = document.getElementById('distOptions');
  DIST_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 't-opt' + (opt.value === 'all' ? ' on' : '');
    btn.textContent = opt.label;
    btn.dataset.dist = opt.value;
    btn.onclick = () => selectDistOption(opt.value);
    dGrid.appendChild(btn);
  });

  const oGrid = document.getElementById('orderOptions');
  ORDER_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 't-opt' + (opt.value === state.settings.order ? ' on' : '');
    btn.textContent = opt.label;
    btn.dataset.order = opt.value;
    btn.onclick = () => selectOrderOption(opt.value);
    oGrid.appendChild(btn);
  });

  const mGrid = document.getElementById('modeOptions');
  [{label: 'Standard', val: false}, {label: 'Exam', val: true}].forEach(o => {
    const b = document.createElement('button');
    b.className = 't-opt' + (o.val === false ? ' on' : '');
    b.textContent = o.label;
    b.dataset.mode = String(o.val);
    b.onclick = () => selectExamMode(o.val);
    mGrid.appendChild(b);
  });
  const aGrid = document.getElementById('answerOptions');
  ANSWER_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 't-opt' + (opt.value === state.settings.answerBy ? ' on' : '');
    btn.textContent = opt.label;
    btn.dataset.answerBy = opt.value;
    btn.onclick = () => chooseAnswerBy(opt.value);
    aGrid.appendChild(btn);
  });
  document.getElementById('typeInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat && !e.isComposing) submitTyped();
  });
  const cGrid = document.getElementById('countPresets');
  COUNT_PRESETS.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 't-opt';
    btn.textContent = n === null ? 'All' : String(n);
    btn.dataset.count = n === null ? '' : String(n);
    btn.onclick = () => selectCountPreset(n);
    cGrid.appendChild(btn);
  });
  document.getElementById('qCountInput').addEventListener('input', () => {
    syncCountPresets();
    updateSettingsSummary();
  });
  document.querySelectorAll('.jump-link').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();  // no #hash in the address, the scroll is animated by jumpTo()
    jumpTo(a.dataset.target);
    a.blur();
  }));
  window.addEventListener('resize', measureStickyOffsets);
  loadHomeSettings();
  syncCountPresets();
  measureStickyOffsets();
  updateSettingsSummary();
}

// ─── Question count presets ──────────────────────────────────────────────────
// A preset only fills the number box (null = blank = all), so the box stays the single source of truth
// (getQCount() and the summary read it) and a typed number that matches a preset lights that preset.
const COUNT_PRESETS = [null, 20, 30, 50, 80, 100];

function selectCountPreset(n) {
  document.getElementById('qCountInput').value = n === null ? '' : String(n);
  syncCountPresets();
  updateSettingsSummary();
}

function syncCountPresets() {
  const val = parseInt(document.getElementById('qCountInput').value);
  const current = isNaN(val) || val <= 0 ? '' : String(val);
  document.querySelectorAll('#countPresets .t-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.count === current);
  });
}

// ─── Jump links (home page) ──────────────────────────────────────────────────
// The sticky bar and the header are measured so a jump lands the section just below both
// (.jump-target scroll-margin-top). Hidden home page = 0 height = keep the last measurement.
function measureStickyOffsets() {
  const root = document.documentElement.style;
  const header = document.querySelector('.header');
  const bar = document.getElementById('jumpBar');
  if (header && header.offsetHeight) root.setProperty('--header-h', header.offsetHeight + 'px');
  if (bar && bar.offsetHeight) root.setProperty('--jump-h', bar.offsetHeight + 'px');
}

function jumpTo(id) {
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

