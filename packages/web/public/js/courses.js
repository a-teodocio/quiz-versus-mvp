// ─── Courses (v1.47.0) ──────────────────────────────────────────────────────
// One course is on show at a time (state.course); every quiz item of every course stays in the DOM and
// is only hidden, so the unseen counts and the progress lines see all of them. Switching course clears
// the mix picks (one course per mix) and goes back to that course's first unit tab. The choice and the
// archive toggle are remembered in mlsquiz_view. An older server (no /api/courses) means one course and
// no switcher, with a notice.
const VIEW_KEY = 'mlsquiz_view';   // {course, showArchived}; its own key, apart from perf, settings and the rest

async function fetchCourses() {
  try {
    const r = await fetch('/api/courses');
    if (!r.ok) return null;
    const list = await r.json();
    return Array.isArray(list) ? list : null;
  } catch { return null; }
}

function readView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY));
    if (v && typeof v === 'object') return { course: typeof v.course === 'string' ? v.course : null, showArchived: v.showArchived === true };
  } catch {}
  return { course: null, showArchived: false };
}

function saveView() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ course: state.course, showArchived: state.showArchived })); } catch {}
}

// Courses the switcher offers. If every course is archived they are shown anyway, never an empty page.
function visibleCourses() {
  const shown = state.courses.filter(c => state.showArchived || !c.archived);
  return shown.length ? shown : state.courses;
}

// Puts `code` on show, or the first visible course if it is gone or hidden. Returns true if the course changed.
function pickCourse(code) {
  const shown = visibleCourses();
  const next = shown.some(c => c.code === code) ? code : (shown.length ? shown[0].code : null);
  const changed = next !== state.course;
  state.course = next;
  return changed;
}

function inCourseOnShow(file) {
  return !state.coursesKnown || state.fileCourse[file] === state.course;
}

function courseNameOf(code) {
  const c = state.courses.find(x => x.code === code);
  return c ? c.name : '';
}

function selectCourse(code) {
  if (code === state.course) return;
  applyCourseView(pickCourse(code));
  saveView();
}

function toggleArchived() {
  state.showArchived = !state.showArchived;
  applyCourseView(pickCourse(state.course));
  saveView();
}

function renderCourseSelect() {
  const row = document.getElementById('courseRow');
  const select = document.getElementById('courseSelect');
  const toggle = document.getElementById('archiveToggleBtn');
  const shown = state.coursesKnown ? visibleCourses() : [];
  const hasArchived = state.courses.some(c => c.archived);
  select.innerHTML = '';
  // a single course and nothing archived: no row at all, so the page looks as it did with one course
  row.classList.toggle('hidden', !state.coursesKnown || (shown.length <= 1 && !hasArchived));
  toggle.classList.toggle('hidden', !hasArchived);
  toggle.textContent = state.showArchived ? 'Hide archived' : 'Show archived';
  toggle.setAttribute('aria-pressed', state.showArchived ? 'true' : 'false');
  shown.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = c.name;
    opt.selected = c.code === state.course;
    select.appendChild(opt);
  });
}

// Redraws everything that depends on the course on show. `changed` = the course just switched.
function applyCourseView(changed) {
  if (changed) {
    state.mixPicked.clear();
    document.querySelectorAll('#quizList .quiz-item').forEach(el => el.classList.remove('picked'));
    updateMixBar();
  }
  renderCourseSelect();
  state.unitGroups = unitGroupsInView();
  if (changed || !state.unitGroups.includes(state.unitGroup)) state.unitGroup = state.unitGroups[0];
  renderUnitTabs();
  applyCourseSettings();   // also refreshes the summary, whose estimate depends on the course on show
  updateProgressViews();
  updateResumePrompt();
}

// ─── Unit tabs ──────────────────────────────────────────────────────────────
// The tabs of the course on show. The server decides each file's group (a top-level "group" in the JSON,
// else the week in the file name, else Other) and its rank; the page only sorts by (rank, label).
// With a single group there is nothing to switch, so the tab row stays hidden and every unit shows.
// Picks made in mix mode survive switching tabs (state.mixPicked is by file name).
function unitGroupsInView() {
  return [...new Set(state.listFiles.filter(inCourseOnShow).map(f => state.fileGroup[f]))].sort(compareUnitGroups);
}

function compareUnitGroups(a, b) {
  return (state.groupRank[a] - state.groupRank[b]) || a.localeCompare(b);
}

function renderUnitTabs() {
  const row = document.getElementById('unitTabs');
  row.innerHTML = '';
  const tabbed = state.unitGroups.length > 1;
  row.classList.toggle('hidden', !tabbed);
  if (tabbed) {
    state.unitGroups.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 't-opt';
      btn.dataset.group = g;
      btn.onclick = () => selectUnitGroup(g);
      row.appendChild(btn);
    });
  }
  selectUnitGroup(state.unitGroup);
}

function selectUnitGroup(g) {
  state.unitGroup = g;
  const tabbed = state.unitGroups.length > 1;
  document.querySelectorAll('#quizList .quiz-item, #quizList .chapter-card').forEach(el => {
    const otherCourse = state.coursesKnown && el.dataset.course !== state.course;
    el.classList.toggle('hidden', otherCourse || (tabbed && el.dataset.group !== g));
  });
  updateUnitTabs();
}

// Marks the open tab and adds the number of units picked for mixing in it, so a pick
// made on another tab is not forgotten.
function updateUnitTabs() {
  document.querySelectorAll('#unitTabs .t-opt').forEach(btn => {
    const g = btn.dataset.group;
    const picked = [...state.mixPicked].filter(f => state.fileGroup[f] === g).length;
    btn.textContent = g + (picked ? ' · ' + picked : '');
    btn.classList.toggle('on', g === state.unitGroup);
    btn.setAttribute('aria-pressed', g === state.unitGroup ? 'true' : 'false');
  });
}

