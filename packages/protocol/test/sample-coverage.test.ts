import { describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '../src/index.js';
import { CLIENT_SAMPLES, SERVER_SAMPLES } from './samples.js';

// A Record keyed by every message type: adding a type to a union fails the typecheck here until a
// line is added, and the tests below then fail until a sample exists for it (review-checklist B4).
const CLIENT_TYPES: Record<ClientMessage['type'], true> = {
  join: true,
  start: true,
  answer: true,
  next: true,
  leave: true,
};
const SERVER_TYPES: Record<ServerMessage['type'], true> = {
  welcome: true,
  room: true,
  question: true,
  answerAck: true,
  reveal: true,
  results: true,
  error: true,
};

describe('sample messages', () => {
  it('include every client message type', () => {
    const covered = new Set(CLIENT_SAMPLES.map((message) => message.type));
    expect([...covered].sort()).toEqual(Object.keys(CLIENT_TYPES).sort());
  });

  it('include every server message type', () => {
    const covered = new Set(SERVER_SAMPLES.map((message) => message.type));
    expect([...covered].sort()).toEqual(Object.keys(SERVER_TYPES).sort());
  });
});
