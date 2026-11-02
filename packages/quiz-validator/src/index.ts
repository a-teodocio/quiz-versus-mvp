// Public API of @quiz-versus/quiz-validator. Everything else in this package is internal.

export { validateTree } from './tree/validate-tree.js';
export type { FileSummary, ValidateOptions, ValidationResult } from './tree/validate-tree.js';
export type { FileStats } from './file/check-quiz-file.js';
export type { ContentTree, QuizFileSource } from './tree/content-tree.js';

export { readContentTree } from './disk/read-content-tree.js';

export { formatFinding, MOCK_ONLY_PREFIX } from './findings/finding.js';
export type { Finding, FindingLevel } from './findings/finding.js';

export type { ImageSource } from './images/image-source.js';

export { loadRegistry, readRegistry } from './registry/registry.js';
export type { AnswerMode, CourseEntry, RegistryRead } from './registry/registry.js';
