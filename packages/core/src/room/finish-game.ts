import type { ResultsMessage } from '@quiz-versus/protocol';
import { rankPlayers } from '../scoring/ranking.js';
import { send, toEveryone } from './effects.js';
import { roomMessage } from './messages.js';
import type { Game, ResultsRoom, RoomState } from './state.js';
import type { Transition } from './transition.js';

/** Ends the game: ranks everyone (equal scores share a rank) and shows the results. */
export function finishGame(room: RoomState, game: Game): Transition {
  const results: ResultsMessage = {
    type: 'results',
    standings: rankPlayers(room.seats).map(({ player, rank }) => ({
      playerId: player.id,
      name: player.name,
      rank,
      score: player.score,
      correctCount: player.correctCount,
    })),
  };
  const finished: ResultsRoom = {
    phase: 'results',
    roomId: room.roomId,
    hostId: room.hostId,
    seats: room.seats,
    game: { ...game, tiebreak: null },
    results,
  };
  return {
    state: finished,
    effects: [
      { type: 'clearTimer' },
      send(toEveryone, results),
      send(toEveryone, roomMessage(finished)),
    ],
  };
}
