import { compareCodePoints } from '../text/compare.js';

/** How serious a finding is. The levels and their meaning are the real validator's. */
export type FindingLevel = 'ERROR' | 'WARN' | 'NOTE';

/** Where a finding was made: a file (or the registry, or a folder) and a place inside it. */
export interface Place {
  readonly file: string;
  readonly where: string;
}

export interface Finding extends Place {
  readonly level: FindingLevel;
  readonly message: string;
}

/**
 * Starts the message of a finding that only the mock raises (the real validator has no such
 * rule), so a comparison with the real tool's output can set those apart (docs/fidelity.md).
 */
export const MOCK_ONLY_PREFIX = 'mock: ';

export const error = (place: Place, message: string): Finding => ({
  level: 'ERROR',
  ...place,
  message,
});
export const warn = (place: Place, message: string): Finding => ({
  level: 'WARN',
  ...place,
  message,
});
export const note = (place: Place, message: string): Finding => ({
  level: 'NOTE',
  ...place,
  message,
});

/** One line, laid out as the real validator prints a finding. */
export function formatFinding(finding: Finding): string {
  return `${finding.level.padEnd(5)} ${finding.file} [${finding.where}] ${finding.message}`;
}

const LEVEL_ORDER: Readonly<Record<FindingLevel, number>> = { ERROR: 0, WARN: 1, NOTE: 2 };

/** Errors first, then warnings, then notes, each group by file; otherwise the order they were made. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || compareCodePoints(a.file, b.file),
  );
}
