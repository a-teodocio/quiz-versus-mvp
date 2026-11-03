/**
 * Every browser-storage key the quiz page reads or writes, and the prefix of the progress text it
 * copies between devices. They are the real app's own names (`mlsquiz_*`), kept so that the
 * progress a player has on the real app means the same thing here.
 *
 * `test/fork-source.test.ts` scans the page for `mlsquiz_` names and fails when this list and the
 * page disagree, so the list cannot drift while the page is still one file.
 */
export const STORAGE_KEYS = {
  /** `'light'` or `'dark'`; removed for "System". */
  theme: 'mlsquiz_theme',
  /** A palette id; removed for Classic. */
  palette: 'mlsquiz_palette',
  /** Flagged question ids, as a JSON array. */
  flags: 'mlsquiz_flags',
  /** Progress: progress key to `[answered, correct]`. */
  perf: 'mlsquiz_perf',
  /** Home settings when the server sends no courses. */
  settings: 'mlsquiz_settings',
  /** Home settings per course. */
  courseSettings: 'mlsquiz_course_settings',
  /** The "Answer by" choice per course. */
  answerBy: 'mlsquiz_answerby',
  /** The course on show and whether archived courses are listed. */
  view: 'mlsquiz_view',
  /** Chapter cards left open on the home list, as `course:chNN`. */
  chaptersOpen: 'mlsquiz_chapters_open',
  /** The last three finished sessions. */
  history: 'mlsquiz_history',
  /** The single resume record of v1.49.0 and older; moved to a per-course key on load. */
  legacyResume: 'mlsquiz_resume',
} as const;

/** Prefix of the per-course resume key: `mlsquiz_resume:<course code>`. */
export const RESUME_KEY_PREFIX = 'mlsquiz_resume:';

/** Start of the text the page copies and pastes between devices (the progress and flags). */
export const PROGRESS_EXPORT_PREFIX = 'MLSQUIZ1:';
