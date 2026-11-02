/** Server limits and defaults, named in one place (review-checklist D4). */

export const DEFAULT_PORT = 8787;
/** Loopback only by default; a host sets `HOST=0.0.0.0` to accept other machines. */
export const DEFAULT_HOST = '127.0.0.1';

/** Rooms held in memory at once. A room costs little, but the process holds all of them. */
export const DEFAULT_MAX_ROOMS = 200;
/** Rooms one network address may have open, so one visitor cannot fill the server. */
export const DEFAULT_MAX_ROOMS_PER_ADDRESS = 5;
/** A room with nobody connected is closed after this long, including one nobody ever joined. */
export const DEFAULT_IDLE_ROOM_MS = 10 * 60 * 1000;
/** How often every connection is pinged; one that has not answered the last ping is dropped. */
export const DEFAULT_HEARTBEAT_MS = 15 * 1000;

/**
 * Largest WebSocket frame the server reads. Just above `MAX_CLIENT_MESSAGE_BYTES` (2 KiB), so a
 * message that is a little too big reaches the decoder and gets `MESSAGE_TOO_LARGE`; a frame
 * above this closes the connection (the library closes it before anything can be sent).
 */
export const MAX_CLIENT_FRAME_BYTES = 4 * 1024;

/** A quiz file or a picture larger than this is refused rather than read into memory. */
export const MAX_QUIZ_FILE_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How many times a game is prepared again when a picture name collides with another room's. */
export const MAX_PREPARE_ATTEMPTS = 3;
