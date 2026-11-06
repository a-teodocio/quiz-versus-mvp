import type { z } from 'zod';
import { ClientMessageSchema, type ClientMessage } from '../client/client-message.js';
import {
  CreateRoomResponseSchema,
  HttpErrorBodySchema,
  QuizListResponseSchema,
  type CreateRoomResponse,
  type HttpErrorBody,
  type QuizListResponse,
} from '../http/http-bodies.js';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_HTTP_BODY_BYTES,
  MAX_SERVER_MESSAGE_BYTES,
} from '../limits.js';
import { ServerMessageSchema, type ServerMessage } from '../server/server-message.js';
import { describeIssue } from './describe-issue.js';
import { utf8ByteLength } from './utf8-length.js';

/**
 * The sender built a message the protocol does not allow. This is a bug in the sender, not bad
 * input, so it is thrown rather than returned. Sending a question with the answer in it fails here.
 */
export class InvalidOutgoingMessageError extends Error {
  constructor(detail: string) {
    super(`Refusing to send an invalid message: ${detail}`);
    this.name = 'InvalidOutgoingMessageError';
  }
}

function encode<S extends z.ZodType>(schema: S, message: z.output<S>, maxBytes: number): string {
  const parsed = schema.safeParse(message);
  if (!parsed.success) throw new InvalidOutgoingMessageError(describeIssue(parsed.error));
  const text = JSON.stringify(parsed.data);
  if (utf8ByteLength(text) > maxBytes) {
    throw new InvalidOutgoingMessageError(`more than ${String(maxBytes)} bytes`);
  }
  return text;
}

/** Validates a client message and turns it into text for the WebSocket. */
export function encodeClientMessage(message: ClientMessage): string {
  return encode(ClientMessageSchema, message, MAX_CLIENT_MESSAGE_BYTES);
}

/** Validates a server message and turns it into text for the WebSocket. */
export function encodeServerMessage(message: ServerMessage): string {
  return encode(ServerMessageSchema, message, MAX_SERVER_MESSAGE_BYTES);
}

/** Validates the body of a `201` from `POST /rooms` and turns it into text. */
export function encodeCreateRoomResponse(body: CreateRoomResponse): string {
  return encode(CreateRoomResponseSchema, body, MAX_HTTP_BODY_BYTES);
}

/** Validates the body of a `GET /quizzes` answer and turns it into text. */
export function encodeQuizListResponse(body: QuizListResponse): string {
  return encode(QuizListResponseSchema, body, MAX_HTTP_BODY_BYTES);
}

/** Validates the body of an HTTP refusal and turns it into text. */
export function encodeHttpErrorBody(body: HttpErrorBody): string {
  return encode(HttpErrorBodySchema, body, MAX_HTTP_BODY_BYTES);
}
