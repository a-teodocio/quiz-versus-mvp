import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  createRoom,
  isReadableSentence,
  lobby,
  noteRefusal,
  Player,
  QUICK,
  sleep,
  start,
} from './qa-support.js';

afterEach(cleanup);

it(
  'J1: host and friends see each other, with names, and who the host is',
  async () => {
    const roomId = await createRoom();
    const host = await Player.open(roomId);
    await host.join('Ada');
    const friend = await Player.open(roomId);
    await friend.join('Bo');
    const third = await Player.open(roomId);
    await third.join('Cy');

    const hostView = await host.nextRoom((room) => room.players.length === 3);
    const thirdView = await third.nextRoom((room) => room.players.length === 3);
    for (const view of [hostView, thirdView]) {
      expect(view.phase).toBe('lobby');
      expect(view.hostId).toBe(host.playerId);
      expect(view.players.map((p) => p.name)).toEqual(['Ada', 'Bo', 'Cy']);
      expect(view.players.every((p) => p.connected && !p.answered && p.score === 0)).toBe(true);
      expect(view.settings).toBeNull();
      expect(view.roomId).toBe(roomId);
    }
  },
  QUICK,
);

it(
  'J2.1: good names show exactly as typed, markup stays text, spaces are trimmed',
  async () => {
    const roomId = await createRoom();
    const host = await Player.open(roomId);
    await host.join('Host');
    const cases: [string, string][] = [
      ['A', 'A'],
      ['a'.repeat(24), 'a'.repeat(24)],
      ['😀'.repeat(24), '😀'.repeat(24)],
      ['😀', '😀'],
      ['Zoë Müller', 'Zoë Müller'],
      ['李雷', '李雷'],
      ['<b>bold</b>', '<b>bold</b>'],
      ['<script>x</script>', '<script>x</script>'],
      ['"quote" & <amp>', '"quote" & <amp>'],
      ['  padded  ', 'padded'],
    ];
    for (const [typed, shown] of cases) {
      const player = await Player.open(roomId);
      const answer = await player.tryJoin(typed);
      expect(answer.type, `joining as ${JSON.stringify(typed)}`).toBe('welcome');
      const room = await player.nextRoom((r) => r.players.some((p) => p.id === player.playerId));
      expect(room.players.find((p) => p.id === player.playerId)?.name).toBe(shown);
      player.leave();
      await player.closed;
    }
  },
  QUICK,
);

it(
  'J2.2: bad names are refused with a sentence that says it is the name, and the player can retry',
  async () => {
    const roomId = await createRoom();
    const host = await Player.open(roomId);
    await host.join('Host');
    const bad: [string, string][] = [
      ['empty', ''],
      ['only spaces', '   '],
      ['25 characters', 'a'.repeat(25)],
      ['25 emoji', '😀'.repeat(25)],
      ['control character', 'a\u0007b'],
      ['newline', 'a\nb'],
      ['bidi override', '‮evil'],
      ['zero-width space', 'a​b'],
    ];
    const problems: string[] = [];
    for (const [label, name] of bad) {
      const player = await Player.open(roomId);
      const answer = await player.tryJoin(name);
      if (answer.type !== 'error') {
        problems.push(`${label}: was accepted`);
        continue;
      }
      noteRefusal(`J2 bad name: ${label}`, answer);
      if (!isReadableSentence(answer.message, answer.code)) {
        problems.push(`${label}: not a readable sentence: ${answer.message}`);
      }
      if (!/name/i.test(answer.message)) {
        problems.push(`${label}: does not say it is the name (${answer.code}: ${answer.message})`);
      }
      // The same socket can try again with a good name: nothing is stuck.
      const retry = await player.tryJoin('Retry');
      if (retry.type !== 'welcome') problems.push(`${label}: could not retry on the same socket`);
      else {
        player.leave();
        await player.closed;
      }
    }
    expect(problems).toEqual([]);
  },
  QUICK,
);

it(
  'J2.3: two players with the same name are told apart or refused (probe)',
  async () => {
    const { players } = await lobby(['Ada']);
    const twin = await Player.open(players[0]?.roomId ?? '');
    const answer = await twin.tryJoin('Ada');
    // The documents do not say. Record what happens: two "Ada" rows are hard to tell apart.
    expect(['welcome', 'error']).toContain(answer.type);
    if (answer.type === 'welcome') {
      const room = await twin.nextRoom((r) => r.players.length === 2);
      expect(room.players.map((p) => p.name)).toEqual(['Ada', 'Ada']);
    }
  },
  QUICK,
);

it(
  'J3.1: a ninth player is told the room is full and the others notice nothing',
  async () => {
    const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const { roomId, players } = await lobby(names);
    for (const player of players.slice(0, -1)) {
      await player.nextRoom((room) => room.players.length === 8);
    }
    for (const player of players) player.clear();
    const ninth = await Player.open(roomId);
    const answer = await ninth.tryJoin('P9');
    expect(answer.type).toBe('error');
    if (answer.type !== 'error') return;
    noteRefusal('J3 room full', answer);
    expect(answer.code).toBe('ROOM_FULL');
    expect(isReadableSentence(answer.message, answer.code)).toBe(true);
    await sleep(500);
    for (const player of players) {
      expect(player.pending(), `${player.name} was disturbed`).toEqual([]);
    }
  },
  QUICK,
);

it(
  'J3.2: a dropped seat still counts as taken, and its owner can come back into the full room',
  async () => {
    const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const { roomId, players } = await lobby(names);
    const dropper = players[7];
    if (dropper === undefined) throw new Error('no dropper');
    dropper.drop();
    await players[0]?.nextRoom((room) => room.players.some((p) => !p.connected));
    const stranger = await Player.open(roomId);
    const refused = await stranger.tryJoin('Stranger');
    expect(refused.type === 'error' ? refused.code : refused.type).toBe('ROOM_FULL');
    const back = await Player.open(roomId);
    const welcome = await back.tryJoin('P8', dropper.resumeToken);
    expect(welcome.type).toBe('welcome');
    if (welcome.type === 'welcome') expect(welcome.playerId).toBe(dropper.playerId);
  },
  QUICK,
);

it(
  'J4.1: a room that never existed answers ROOM_NOT_FOUND in a sentence and closes',
  async () => {
    const ghost = await Player.open('A'.repeat(22));
    const error = await ghost.next('error');
    noteRefusal('J4 unknown room', error);
    expect(error.code).toBe('ROOM_NOT_FOUND');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
    expect(await ghost.closed).toBe(1008);
  },
  QUICK,
);

it(
  'J4.2: a truncated invite id (under 16 characters) is refused at the upgrade with a bare 404, with no room-not-found sentence (the web client must check the id shape itself)',
  async () => {
    // A characterisation, not a pass/fail on the server: protocol.md says anything else is 404.
    // A browser cannot read the status of a refused upgrade, so a link cut short by a chat app
    // shows up as a failed connection unless the client checks the id first (J4).
    for (const path of ['/rooms/abc', '/rooms/', '/rooms/..%2F..%2Fetc', '/room/abc', '/']) {
      await expect(Player.open('x', {}, path), path).rejects.toThrow(/404/);
    }
  },
  QUICK,
);

it(
  'J5.1: Start with one player is refused with a sentence, and the game does not start',
  async () => {
    const { players } = await lobby(['Ada']);
    const host = players[0];
    if (host === undefined) throw new Error('no host');
    start(host);
    const error = await host.next('error');
    noteRefusal('J5 start with one player', error);
    expect(error.code).toBe('NOT_ENOUGH_PLAYERS');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
    expect(error.message).toMatch(/two|2|another|second/i);
    await sleep(300);
    expect(host.pending('question')).toEqual([]);
    expect(host.history.some((m) => m.type === 'question')).toBe(false);
  },
  QUICK,
);

it(
  'J5.2: with two players of whom one dropped, Start is refused the same way',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    friend.drop();
    await host.nextRoom((room) => room.players.some((p) => !p.connected));
    start(host);
    const error = await host.next('error');
    expect(error.code).toBe('NOT_ENOUGH_PLAYERS');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
  },
  QUICK,
);

it(
  'J6: with two connected the game starts; the guest cannot start it (X5)',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(friend);
    const refused = await friend.next('error');
    noteRefusal('X5 guest start', refused);
    expect(refused.code).toBe('NOT_HOST');
    expect(isReadableSentence(refused.message, refused.code)).toBe(true);
    friend.send({ type: 'next' });
    expect((await friend.next('error')).code).toBe('NOT_HOST');
    start(host);
    const first = await host.next('question');
    const same = await friend.next('question');
    expect(same.itemKey).toBe(first.itemKey);
  },
  QUICK,
);
