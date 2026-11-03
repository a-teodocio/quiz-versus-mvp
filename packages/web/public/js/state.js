// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  // Persistent: loaded quiz data and user settings (survive restartQuiz())
  quiz: null,
  settings: {
    timerSecs: 0,  // seconds; 0 = no timer
    dist: 'all',   // distribution filter
    order: 'unseen', // which questions come first: 'unseen', 'weakest' or 'random'
    examMode: false, // exam mode: no feedback until results, picking an option moves on, Back can change answers
    answerBy: 'pick', // 'pick' (multiple choice) or 'type' (typed, spell-checked; long answers are self-graded)
  },
  perf: {},               // question key -> [answered, correct]; persisted to localStorage (mlsquiz_perf)
  fileKeys: {},           // quiz file -> its progress keys (from /api/list), for the unseen counts on the home screen
  courses: [],            // home screen: [{code, name, archived, ...}] from /api/courses ([] = older server or no courses)
  coursesKnown: false,    // true once /api/courses answered with at least one course
  course: null,           // home screen: the course on show (a code); remembered in mlsquiz_view
  showArchived: false,    // home screen: also offer archived courses; remembered in mlsquiz_view
  listFiles: [],          // quiz file names in list order (filled by loadQuizList())
  fileCourse: {},         // quiz file -> course code
  fileGroup: {},          // quiz file -> unit group (tab name)
  groupRank: {},          // unit group -> sort rank (from the server)
  flaggedIds: new Set(),  // persisted to localStorage; survives restartQuiz()
  unitGroups: [],         // home screen: the tab names, in order (filled by loadQuizList())
  unitGroup: null,       // home screen: the unit tab on show (a week or Other); not saved, so the page always opens on the first one
  mixMode: false,        // home screen: quiz list items toggle selection instead of starting
  mixPicked: new Set(),   // quiz file names ticked while mixMode is on
  openChapters: new Set(), // chapter cards left open on the home list ("course:chNN"), remembered in mlsquiz_chapters_open
  // Per-session: reset by resetSession() at the start of every quiz
  questions: [],
  currentIdx: 0,
  score: 0,
  selectedOption: null,
  answered: false,
  answerHistory: [],  // per-question: {id, selected, isCorrect} or null
  timedOut: false,
  endedEarly: false,      // the End exam button was used; unanswered items go to the results marked Unanswered
  sessionTimerRemaining: 0,
  sessionTimerInterval: null,
  halfwayWarningShown: false,
  threeMinWarningShown: false,
  currentGroupPartIdx: 0,
  totalParts: 0,
  pendingAdvance: null,   // exam mode: timeout id of the card sliding out between a pick and the move on
  typedPending: null,     // typed text of a self-graded answer waiting for "I got it right / wrong" (null otherwise)
  sessionCourse: '',      // the course this session's resume record belongs to (the first file's course; '' = unknown)
  sessionStartedAt: 0,    // ms; shifted back by saved elapsed time on resume
  timerLastTick: 0,      // ms clock reading at the last timer update (the timer follows the clock, not tick count)
  timerCarryMs: 0,        // part of a second not yet taken off the remaining time
  historyRecorded: false, // showResults() writes one history entry per session
  resetArmed: false,      // progress modal: the Reset button has been clicked once
};

function resetSession() {
  cancelPendingAdvance();
  state.questions = [];
  state.currentIdx = 0;
  state.score = 0;
  state.selectedOption = null;
  state.answered = false;
  state.answerHistory = [];
  state.timedOut = false;
  state.endedEarly = false;
  state.sessionTimerRemaining = 0;
  clearInterval(state.sessionTimerInterval);
  state.sessionTimerInterval = null;
  state.halfwayWarningShown = false;
  state.threeMinWarningShown = false;
  state.currentGroupPartIdx = 0;
  state.totalParts = 0;
  state.typedPending = null;
  state.sessionCourse = '';
  state.sessionStartedAt = 0;
  state.timerLastTick = 0;
  state.timerCarryMs = 0;
  state.historyRecorded = false;
}

const TIMER_OPTIONS = [
  { label: 'No timer', secs: 0 },
  { label: '15 min',  secs: 15 * 60 },
  { label: '30 min',  secs: 30 * 60 },
  { label: '45 min',  secs: 45 * 60 },
  { label: '60 min',  secs: 60 * 60 },
  { label: '1h 15m',  secs: 75 * 60 },
  { label: '1h 30m',  secs: 90 * 60 },
];

const DIST_OPTIONS = [
  { label: 'All',          value: 'all' },
  { label: 'Text-heavy',   value: 'text-heavy' },
  { label: 'Balanced',     value: 'balanced' },
  { label: 'Visual-heavy', value: 'visual-heavy' },
  { label: 'Visual only',  value: 'visual-only' },
];

const ORDER_OPTIONS = [
  { label: 'Unseen first',  value: 'unseen' },
  { label: 'Weakest first', value: 'weakest' },
  { label: 'Random',        value: 'random' },
];

const ANSWER_OPTIONS = [
  { label: 'Pick', value: 'pick' },
  { label: 'Type', value: 'type' },
];

// Seconds per scored part, for the "about N min" in the start window. Tune these two numbers to your own pace.
const SECS_PER_PICK = 30;
const SECS_PER_TYPED = 40;

