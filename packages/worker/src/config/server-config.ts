import {
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_HOST,
  DEFAULT_IDLE_ROOM_MS,
  DEFAULT_MAX_ROOMS,
  DEFAULT_MAX_ROOMS_PER_ADDRESS,
  DEFAULT_PORT,
} from './defaults.js';

/** Everything that decides how the server runs and that a host may want to change. */
export interface ServerConfig {
  /** 0 asks the system for a free port (tests). */
  readonly port: number;
  readonly host: string;
  /** The folder holding `quizzes/` and `images/`. */
  readonly contentRoot: string;
  /**
   * Origins besides the server's own that may open a connection or make a room, such as a
   * development server for the web client. The server's own origin is always allowed.
   */
  readonly allowedOrigins: readonly string[];
  readonly maxRooms: number;
  readonly maxRoomsPerAddress: number;
  readonly idleRoomMs: number;
  readonly heartbeatMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function whole(name: string, text: string | undefined, fallback: number, minimum: number): number {
  if (text === undefined || text === '') return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < minimum) {
    throw new ConfigError(`${name} must be a whole number of at least ${String(minimum)}`);
  }
  return value;
}

function origins(text: string | undefined): string[] {
  return (text ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

/**
 * Reads the settings from environment variables (`PORT`, `HOST`, `CONTENT_ROOT`,
 * `ALLOWED_ORIGINS` as a comma-separated list, `MAX_ROOMS`, `MAX_ROOMS_PER_ADDRESS`,
 * `IDLE_ROOM_MS`, `HEARTBEAT_MS`). Throws a `ConfigError` for a value that makes no sense, so a
 * typo stops the server at start instead of changing how it behaves.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  currentDirectory: string,
): ServerConfig {
  return {
    port: whole('PORT', env['PORT'], DEFAULT_PORT, 0),
    host: env['HOST'] ?? DEFAULT_HOST,
    contentRoot: env['CONTENT_ROOT'] ?? `${currentDirectory}/content`,
    allowedOrigins: origins(env['ALLOWED_ORIGINS']),
    maxRooms: whole('MAX_ROOMS', env['MAX_ROOMS'], DEFAULT_MAX_ROOMS, 1),
    maxRoomsPerAddress: whole(
      'MAX_ROOMS_PER_ADDRESS',
      env['MAX_ROOMS_PER_ADDRESS'],
      DEFAULT_MAX_ROOMS_PER_ADDRESS,
      1,
    ),
    idleRoomMs: whole('IDLE_ROOM_MS', env['IDLE_ROOM_MS'], DEFAULT_IDLE_ROOM_MS, 1),
    heartbeatMs: whole('HEARTBEAT_MS', env['HEARTBEAT_MS'], DEFAULT_HEARTBEAT_MS, 1),
  };
}
