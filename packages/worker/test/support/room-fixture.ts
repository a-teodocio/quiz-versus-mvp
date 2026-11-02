import type { QuizRepository } from '@quiz-versus/core';
import { PROTOCOL_VERSION } from '@quiz-versus/protocol';
import type { GameSettings } from '@quiz-versus/protocol';
import { DEFAULT_IDLE_ROOM_MS } from '../../src/config/defaults.js';
import { createDiskQuizRepository } from '../../src/content/disk-quiz-repository.js';
import { ImageIndex } from '../../src/content/image-index.js';
import type { ServerLogger } from '../../src/ports/server-logger.js';
import { RoomHost } from '../../src/rooms/room-host.js';
import { fakeContentRoot } from './content-root.js';
import { FakeConnection, say } from './fake-connection.js';
import { countingIds, ManualTime, seededRandom } from './manual-time.js';

export const QUIZ_ID = 'birds-w1-plumage';

export const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  quizIds: [QUIZ_ID],
  questionCount: 3,
  secondsPerQuestion: 20,
  answerBy: 'pick',
  ...overrides,
});

/** A logger that keeps what it is told, so a test can check what was and was not logged. */
export interface LogBook extends ServerLogger {
  readonly lines: { level: string; event: string; fields: Record<string, unknown> }[];
}

function logBook(): LogBook {
  const lines: LogBook['lines'] = [];
  return {
    lines,
    info: (event, fields) => lines.push({ level: 'info', event, fields: { ...fields } }),
    error: (event, fields) => lines.push({ level: 'error', event, fields: { ...fields } }),
  };
}

/** A player in a test room: the socket, and who the room says they are. */
export interface Player {
  readonly connection: FakeConnection;
  readonly playerId: string;
  readonly resumeToken: string;
}

export interface RoomFixture {
  readonly time: ManualTime;
  readonly images: ImageIndex;
  readonly log: LogBook;
  readonly room: RoomHost;
  readonly closedRooms: string[];
  /** Counts the times a quiz was loaded from disk. */
  readonly loads: { count: number };
  /** Opens a socket and joins; the returned player is the joined one. */
  join(name: string): Player;
  /** Opens a socket that has not joined. */
  connect(): FakeConnection;
}

export interface FixtureOptions {
  readonly repository?: QuizRepository;
  readonly idleRoomMs?: number;
}

/** A room over the fake content, with manual time, counting ids and a fixed random stream. */
export function roomFixture(options: FixtureOptions = {}): RoomFixture {
  const time = new ManualTime();
  const images = new ImageIndex();
  const log = logBook();
  const loads = { count: 0 };
  const disk = createDiskQuizRepository(fakeContentRoot);
  const repository: QuizRepository = options.repository ?? {
    load: (quizId) => {
      loads.count += 1;
      return disk.load(quizId);
    },
  };
  const closedRooms: string[] = [];
  const ids = countingIds();
  const room = new RoomHost(
    ids.next(),
    {
      clock: time,
      scheduler: time,
      random: seededRandom(7),
      ids,
      logger: log,
      repository,
      images,
      idleRoomMs: options.idleRoomMs ?? DEFAULT_IDLE_ROOM_MS,
    },
    (roomId) => closedRooms.push(roomId),
  );
  const connect = (): FakeConnection => {
    const connection = new FakeConnection();
    room.attach(connection);
    return connection;
  };
  return {
    time,
    images,
    log,
    room,
    closedRooms,
    loads,
    connect,
    join(name) {
      const connection = connect();
      say(room, connection, { type: 'join', protocolVersion: PROTOCOL_VERSION, name });
      const welcome = connection.last('welcome');
      return { connection, playerId: welcome.playerId, resumeToken: welcome.resumeToken };
    },
  };
}
