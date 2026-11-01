import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../src/room/messages.js';
import { RoomDriver, messages, pickItem, planOf, typedItem } from './support/room-driver.js';

function twoPlayerGame(): { room: RoomDriver; ids: [string, string] } {
  const room = new RoomDriver();
  const ids = room.joinMany(2) as [string, string];
  room.start(ids[0], planOf([pickItem('i1', 2), pickItem('i2')]));
  return { room, ids };
}

describe('nothing about correctness leaves the room while a question is open', () => {
  it('gives the same snapshot whether the first player answered right or wrong', () => {
    const right = twoPlayerGame();
    const wrong = twoPlayerGame();
    right.room.right(right.ids[0]);
    wrong.room.wrong(wrong.ids[0]);
    expect(snapshotOf(right.room.state)).toEqual(snapshotOf(wrong.room.state));
  });

  it('sends the same messages to everyone whether an answer was right or wrong', () => {
    const right = twoPlayerGame();
    const wrong = twoPlayerGame();
    expect(messages(right.room.right(right.ids[0]), 'everyone')).toEqual(
      messages(wrong.room.wrong(wrong.ids[0]), 'everyone'),
    );
  });

  it('keeps scores at their old values until the question closes', () => {
    const { room, ids } = twoPlayerGame();
    room.right(ids[0]);
    expect(snapshotOf(room.state).players.map((player) => player.score)).toEqual([0, 0]);
    room.right(ids[1]);
    expect(snapshotOf(room.state).players.map((player) => player.score)).toEqual([1, 1]);
  });

  it('puts no explanation, correct index or accepted forms in a question message', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(2) as [string, string];
    const effects = room.start(host, planOf([typedItem('i1')]));
    const text = JSON.stringify(messages(effects));
    expect(text).not.toContain('Explanation');
    expect(text).not.toContain('Zorbulin');
    expect(text).not.toContain('acceptedForms');
    expect(text).not.toContain('correct');
  });

  it('sends a typed question without any options', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(2) as [string, string];
    const [question] = messages(room.start(host, planOf([typedItem('i1')])), 'everyone');
    expect(question).toMatchObject({ type: 'question', mode: 'type' });
    expect(question).not.toHaveProperty('options');
  });

  it('shows image names that do not spell out the picture', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(2) as [string, string];
    const item = { ...pickItem('i1'), imageAlias: 'k3f9a0z1q8w2e7r4' };
    const [question] = messages(room.start(host, planOf([item])), 'everyone');
    expect(question).toMatchObject({ imageUrl: '/images/k3f9a0z1q8w2e7r4' });
  });
});
