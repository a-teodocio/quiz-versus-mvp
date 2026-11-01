import type { Answer, GameSettings } from '@quiz-versus/protocol';
import type { GamePlan } from '../game/game-plan.js';

/** A seat the adapter wants for a new player. The adapter makes these from a secure source. */
export interface NewIdentity {
  readonly playerId: string;
  readonly resumeToken: string;
}

/**
 * Everything that can happen to a room. Every event carries `now`, so the state machine never
 * reads a clock. The adapter validates messages with `protocol` and works out who sent them.
 */
export type RoomEvent = { readonly now: number } & (
  | {
      readonly type: 'join';
      readonly name: string;
      readonly identity: NewIdentity;
      readonly resumeToken: string | undefined;
    }
  | {
      readonly type: 'start';
      readonly playerId: string;
      readonly settings: GameSettings;
      readonly plan: GamePlan;
    }
  | {
      readonly type: 'answer';
      readonly playerId: string;
      readonly itemKey: string;
      readonly answer: Answer;
    }
  | { readonly type: 'next'; readonly playerId: string }
  | { readonly type: 'leave'; readonly playerId: string }
  | { readonly type: 'disconnect'; readonly playerId: string }
  | { readonly type: 'timerFired' }
);
