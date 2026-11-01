import { standardScoring } from '../scoring/scoring-rule.js';
import type { ScoringRule } from '../scoring/scoring-rule.js';

/** The swappable parts of the game's rules. */
export interface Rules {
  readonly scoring: ScoringRule;
}

export const defaultRules: Rules = { scoring: standardScoring };
