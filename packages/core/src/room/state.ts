import type { Answer, GameSettings, ResultsMessage, RevealMessage } from '@quiz-versus/protocol';
import type { GamePlan } from '../game/game-plan.js';
import type { Item } from '../quiz/item.js';

/** One player's place in the room. Kept after a dropped connection, removed on leave. */
export interface Seat {
  readonly id: string;
  readonly name: string;
  /** Secret. Never put in a snapshot or sent to anyone but its owner. */
  readonly resumeToken: string;
  readonly connected: boolean;
  readonly score: number;
  readonly correctCount: number;
  /** Joined after the game started, so never part of a tie-break (ADR 6). */
  readonly late: boolean;
}

/** The players still tied for first place and the number of the tie-break question. */
export interface Tiebreak {
  readonly round: number;
  readonly playerIds: readonly string[];
}

/** Which item was asked last: one of the regular questions, or a tie-break round. */
export type Cursor =
  | { readonly kind: 'regular'; readonly index: number }
  | { readonly kind: 'tiebreak'; readonly round: number };

/** What is fixed once the host starts the game, plus the tie-break under way. */
export interface Game {
  readonly settings: GameSettings;
  readonly plan: GamePlan;
  readonly tiebreak: Tiebreak | null;
}

/** An answer accepted for the open question. Held until the reveal so nothing leaks early. */
export interface PendingAnswer {
  readonly playerId: string;
  readonly answer: Answer;
}

export interface OpenQuestion {
  readonly cursor: Cursor;
  readonly item: Item;
  readonly deadline: number;
  readonly answers: readonly PendingAnswer[];
}

export interface RoomBase {
  readonly roomId: string;
  /** Null until the first player joins and becomes host. */
  readonly hostId: string | null;
  readonly seats: readonly Seat[];
}

export interface LobbyRoom extends RoomBase {
  readonly phase: 'lobby';
}

export interface QuestionRoom extends RoomBase {
  readonly phase: 'question';
  readonly game: Game;
  readonly open: OpenQuestion;
}

export interface RevealRoom extends RoomBase {
  readonly phase: 'reveal';
  readonly game: Game;
  readonly cursor: Cursor;
  readonly reveal: RevealMessage;
}

export interface ResultsRoom extends RoomBase {
  readonly phase: 'results';
  readonly game: Game;
  readonly results: ResultsMessage;
}

/** The room state machine's state (docs/architecture.md). Phases match the wire phases. */
export type RoomState = LobbyRoom | QuestionRoom | RevealRoom | ResultsRoom;
/** A room that is running a game. */
export type GameRoom = QuestionRoom | RevealRoom | ResultsRoom;

/** An empty room waiting for its first player. */
export function createRoom(roomId: string): LobbyRoom {
  return { phase: 'lobby', roomId, hostId: null, seats: [] };
}
