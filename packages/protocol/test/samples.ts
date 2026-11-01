import type { ClientMessage, GameSettings, ServerMessage } from '../src/index.js';
import { PROTOCOL_VERSION } from '../src/index.js';

/** Fake ids, long enough to pass the opaque id rule. */
export const ROOM_ID = 'room_AAAAAAAAAAAAAAAAAAAAAA';
export const HOST_ID = 'player_host_AAAAAAAAAAAAA';
export const GUEST_ID = 'player_guest_AAAAAAAAAAAA';
export const RESUME_TOKEN = 'token_AAAAAAAAAAAAAAAAAAAAAA';

/** Progress of a regular question, for tests that vary the position. */
export const regularProgress = (
  position: number,
  totalItems: number,
): { kind: 'regular'; position: number; totalItems: number } => ({
  kind: 'regular',
  position,
  totalItems,
});

type Sample<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** The first sample of a server message type. */
export function sampleOf<T extends ServerMessage['type']>(type: T): Sample<T> {
  const found = SERVER_SAMPLES.find((message): message is Sample<T> => message.type === type);
  if (found === undefined) throw new Error(`no sample of type ${type}`);
  return found;
}

/** The first sample question of the given mode. */
export function questionSample(mode: 'pick' | 'type'): Sample<'question'> {
  const found = SERVER_SAMPLES.find(
    (message): message is Sample<'question'> =>
      message.type === 'question' && message.mode === mode,
  );
  if (found === undefined) throw new Error(`no ${mode} question sample`);
  return found;
}

export const SETTINGS: GameSettings = {
  quizIds: ['fake-quiz-one', 'fake-quiz-two'],
  questionCount: 10,
  secondsPerQuestion: 20,
  answerBy: 'pick',
};

/** One valid example of every message a client may send. */
export const CLIENT_SAMPLES: readonly ClientMessage[] = [
  { type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada' },
  { type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada', resumeToken: RESUME_TOKEN },
  { type: 'start', settings: SETTINGS },
  { type: 'answer', itemKey: 'fake-q1', answer: { kind: 'pick', index: 2 } },
  { type: 'answer', itemKey: 'fake-q1_p2', answer: { kind: 'type', text: 'Mitochondria' } },
  { type: 'next' },
  { type: 'leave' },
];

const PLAYERS = [
  { id: HOST_ID, name: 'Ada', connected: true, answered: false, score: 0 },
  { id: GUEST_ID, name: 'Grace', connected: true, answered: true, score: 120 },
];

/** One valid example of every message the server may send. */
export const SERVER_SAMPLES: readonly ServerMessage[] = [
  {
    type: 'welcome',
    protocolVersion: PROTOCOL_VERSION,
    roomId: ROOM_ID,
    playerId: HOST_ID,
    resumeToken: RESUME_TOKEN,
  },
  {
    type: 'room',
    room: {
      roomId: ROOM_ID,
      phase: 'lobby',
      hostId: HOST_ID,
      players: PLAYERS,
      settings: null,
      tiebreak: null,
    },
  },
  {
    type: 'room',
    room: {
      roomId: ROOM_ID,
      phase: 'question',
      hostId: HOST_ID,
      players: PLAYERS,
      settings: SETTINGS,
      tiebreak: null,
    },
  },
  {
    type: 'room',
    room: {
      roomId: ROOM_ID,
      phase: 'question',
      hostId: HOST_ID,
      players: PLAYERS,
      settings: SETTINGS,
      tiebreak: { round: 1, playerIds: [HOST_ID, GUEST_ID] },
    },
  },
  {
    type: 'question',
    mode: 'pick',
    progress: { kind: 'regular', position: 1, totalItems: 10 },
    itemKey: 'fake-q1',
    prompt: 'Which organelle makes most of the cell energy?',
    options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi body'],
    durationMs: 20_000,
  },
  {
    type: 'question',
    mode: 'type',
    progress: { kind: 'tiebreak', round: 1 },
    itemKey: 'fake-q2_p2',
    prompt: 'Name the structure the arrow points to.',
    imageUrl: '/images/fake-course/item-0007.png',
    part: { index: 2, count: 3 },
    durationMs: 30_000,
  },
  { type: 'answerAck', itemKey: 'fake-q1' },
  {
    type: 'reveal',
    itemKey: 'fake-q1',
    reason: 'all-answered',
    correct: { kind: 'pick', index: 1, text: 'Mitochondrion' },
    explanation: 'Fake explanation for a fake question.',
    results: [
      {
        playerId: HOST_ID,
        outcome: 'wrong',
        near: false,
        points: 0,
        score: 0,
        answer: { kind: 'pick', index: 0 },
      },
      {
        playerId: GUEST_ID,
        outcome: 'correct',
        near: false,
        points: 120,
        score: 120,
        answer: { kind: 'pick', index: 1 },
      },
    ],
  },
  {
    type: 'reveal',
    itemKey: 'fake-q2_p2',
    reason: 'timeout',
    correct: {
      kind: 'type',
      text: 'Loose (areolar) connective tissue',
      acceptedForms: ['Loose connective tissue'],
    },
    explanation: 'Fake explanation.',
    results: [
      { playerId: HOST_ID, outcome: 'no-answer', near: false, points: 0, score: 0, answer: null },
    ],
  },
  {
    type: 'results',
    standings: [
      { playerId: GUEST_ID, name: 'Grace', rank: 1, score: 120, correctCount: 1 },
      { playerId: HOST_ID, name: 'Ada', rank: 2, score: 0, correctCount: 0 },
    ],
  },
  { type: 'error', code: 'NOT_HOST', message: 'Only the host can start the game.' },
];
