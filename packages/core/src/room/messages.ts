import type { Progress, QuestionMessage, RoomSnapshot, ServerMessage } from '@quiz-versus/protocol';
import type { Item } from '../quiz/item.js';
import type { Cursor, Game, RoomState } from './state.js';

/** Where a cursor sits in the game, in the words of the wire protocol. */
export function progressOf(game: Game, cursor: Cursor): Progress {
  if (cursor.kind === 'tiebreak') return { kind: 'tiebreak', round: cursor.round };
  return {
    kind: 'regular',
    position: cursor.index + 1,
    totalItems: game.plan.regular.length,
  };
}

/**
 * The question as clients see it: shuffled options for `pick`, none for `type`, and never the
 * correct index, the explanation or the accepted forms.
 */
export function questionMessage(
  item: Item,
  progress: Progress,
  durationMs: number,
): QuestionMessage {
  const base = {
    type: 'question' as const,
    progress,
    itemKey: item.key,
    prompt: item.prompt,
    durationMs,
    ...(item.imageAlias === undefined ? {} : { imageUrl: `/images/${item.imageAlias}` }),
    ...(item.part === undefined ? {} : { part: item.part }),
  };
  return item.mode === 'pick'
    ? { ...base, mode: 'pick', options: [...item.options] }
    : { ...base, mode: 'type' };
}

/**
 * The room as everyone sees it. `answered` is true only while a question is open, and says
 * nothing about correctness. Throws if no one has joined: a snapshot of an empty room is a bug.
 */
export function snapshotOf(room: RoomState): RoomSnapshot {
  if (room.hostId === null || room.seats.length === 0) {
    throw new Error('A room needs a player before it can be described.');
  }
  const answered = new Set(
    room.phase === 'question' ? room.open.answers.map((entry) => entry.playerId) : [],
  );
  const game = room.phase === 'lobby' ? null : room.game;
  const tiebreak = game?.tiebreak ?? null;
  return {
    roomId: room.roomId,
    phase: room.phase,
    hostId: room.hostId,
    players: room.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      connected: seat.connected,
      answered: answered.has(seat.id),
      score: seat.score,
    })),
    settings: game?.settings ?? null,
    tiebreak:
      tiebreak === null ? null : { round: tiebreak.round, playerIds: [...tiebreak.playerIds] },
  };
}

export const roomMessage = (room: RoomState): ServerMessage => ({
  type: 'room',
  room: snapshotOf(room),
});
