import type { z } from 'zod';
import { ClientMessageSchema, type ClientMessage } from '../client/client-message.js';
import type { ErrorCode } from '../errors/error-code.js';
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
import { PROTOCOL_VERSION } from '../version.js';
import { describeIssue } from './describe-issue.js';
import { utf8ByteLength } from './utf8-length.js';

/**
 * Outcome of decoding. A failure carries a stable error code and a short `detail` for logs. The
 * detail names the field and the kind of problem, and never repeats what the sender wrote.
 */
export type DecodeResult<T> =
  | { readonly ok: true; readonly message: T }
  | { readonly ok: false; readonly code: ErrorCode; readonly detail: string };

const failure = (code: ErrorCode, detail: string): DecodeResult<never> => ({
  ok: false,
  code,
  detail,
});

/** Checks the size, then parses the JSON. Size comes first so a huge payload is never parsed. */
function parseJson(raw: string, maxBytes: number): DecodeResult<unknown> {
  // Bytes are never fewer than UTF-16 units, so this rejects the obvious case without a full count.
  if (raw.length > maxBytes || utf8ByteLength(raw) > maxBytes) {
    return failure('MESSAGE_TOO_LARGE', `more than ${String(maxBytes)} bytes`);
  }
  try {
    // JSON.parse is typed `any`; `unknown` forces every caller to validate before use.
    return { ok: true, message: JSON.parse(raw) as unknown };
  } catch {
    return failure('MALFORMED_MESSAGE', 'not valid JSON');
  }
}

/** True for the handshake message (`join` or `welcome`) of a different protocol version. */
function hasOtherVersion(value: unknown, handshakeType: 'join' | 'welcome'): boolean {
  if (typeof value !== 'object' || value === null) return false;
  // Safe: a non-null object can be read by key; the values stay `unknown` and are compared below.
  const { type, protocolVersion } = value as Record<string, unknown>;
  return (
    type === handshakeType &&
    typeof protocolVersion === 'number' &&
    protocolVersion !== PROTOCOL_VERSION
  );
}

function validate<S extends z.ZodType>(schema: S, value: unknown): DecodeResult<z.output<S>> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, message: parsed.data }
    : failure('MALFORMED_MESSAGE', describeIssue(parsed.error));
}

/** Turns text received from a client into a typed message, or says why it cannot be one. */
export function decodeClientMessage(raw: string): DecodeResult<ClientMessage> {
  const json = parseJson(raw, MAX_CLIENT_MESSAGE_BYTES);
  if (!json.ok) return json;
  if (hasOtherVersion(json.message, 'join')) {
    return failure('UNSUPPORTED_VERSION', `server speaks version ${String(PROTOCOL_VERSION)}`);
  }
  return validate(ClientMessageSchema, json.message);
}

/** Turns text received from the server into a typed message, or says why it cannot be one. */
export function decodeServerMessage(raw: string): DecodeResult<ServerMessage> {
  const json = parseJson(raw, MAX_SERVER_MESSAGE_BYTES);
  if (!json.ok) return json;
  if (hasOtherVersion(json.message, 'welcome')) {
    return failure('UNSUPPORTED_VERSION', `client speaks version ${String(PROTOCOL_VERSION)}`);
  }
  return validate(ServerMessageSchema, json.message);
}

/** Turns the text of a `POST /rooms` answer into a typed body, or says why it cannot be one. */
export function decodeCreateRoomResponse(raw: string): DecodeResult<CreateRoomResponse> {
  const json = parseJson(raw, MAX_HTTP_BODY_BYTES);
  return json.ok ? validate(CreateRoomResponseSchema, json.message) : json;
}

/** Turns the text of a `GET /quizzes` answer into a typed body, or says why it cannot be one. */
export function decodeQuizListResponse(raw: string): DecodeResult<QuizListResponse> {
  const json = parseJson(raw, MAX_HTTP_BODY_BYTES);
  return json.ok ? validate(QuizListResponseSchema, json.message) : json;
}

/** Turns the text of an HTTP refusal into a typed body, or says why it cannot be one. */
export function decodeHttpErrorBody(raw: string): DecodeResult<HttpErrorBody> {
  const json = parseJson(raw, MAX_HTTP_BODY_BYTES);
  return json.ok ? validate(HttpErrorBodySchema, json.message) : json;
}
