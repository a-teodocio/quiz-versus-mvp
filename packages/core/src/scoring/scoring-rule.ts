import type { Progress } from '@quiz-versus/protocol';

/** What a scoring rule may look at. Add fields (such as time taken) when a rule needs them. */
export interface ScoringContext {
  readonly progress: Progress;
}

/**
 * Decides the points for one answer. The state machine never computes points itself, so a streak
 * or speed rule replaces this function without touching it (ADR 6).
 */
export type ScoringRule = (correct: boolean, context: ScoringContext) => number;

/** Points for a correct answer before any multiplier. */
const BASE_POINTS = 1;

/** The multiplier of the standard rule. A later rule can make it depend on the context. */
const MULTIPLIER = 1;

/** 1 point per correct answer times a multiplier that is 1 for now. */
export const standardScoring: ScoringRule = (correct) => (correct ? BASE_POINTS * MULTIPLIER : 0);

/**
 * Applies a rule and keeps its result safe for the wire: a whole number, never negative, and 0
 * for a wrong answer whatever the rule says.
 */
export function pointsFor(rule: ScoringRule, correct: boolean, context: ScoringContext): number {
  if (!correct) return 0;
  const raw = rule(correct, context);
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}
