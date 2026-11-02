import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Clock, Random } from '@quiz-versus/core';
import { MAX_CLIENT_FRAME_BYTES } from '../config/defaults.js';
import type { ServerConfig } from '../config/server-config.js';
import { createDiskQuizRepository } from '../content/disk-quiz-repository.js';
import { ImageIndex } from '../content/image-index.js';
import { createImageStore } from '../content/image-store.js';
import { Heartbeat } from '../net/heartbeat.js';
import { createRequestHandler } from '../net/http-routes.js';
import { handleUpgrade } from '../net/upgrade.js';
import type { IdSource } from '../ports/id-source.js';
import type { Scheduler } from '../ports/scheduler.js';
import type { ServerLogger } from '../ports/server-logger.js';
import { RoomRegistry } from '../rooms/room-registry.js';

/** What the server takes from outside, so a test can replace time, randomness and ids. */
export interface ServerDeps {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly random: Random;
  readonly ids: IdSource;
  readonly logger: ServerLogger;
}

/** A server that is listening. */
export interface RunningServer {
  /** The port it listens on (the real one when the configuration asked for 0). */
  readonly port: number;
  /** Rooms currently held in memory. */
  readonly roomCount: () => number;
  /** Closes every room and every connection, then stops listening. */
  close(): Promise<void>;
}

/**
 * Builds the server from its parts and starts listening. Throws a `ContentError` if the content
 * folder cannot be listed, so a bad folder stops the server at start and not mid-game.
 */
export async function startServer(config: ServerConfig, deps: ServerDeps): Promise<RunningServer> {
  const images = new ImageIndex();
  const registry = new RoomRegistry(
    {
      ...deps,
      repository: createDiskQuizRepository(config.contentRoot),
      images,
      idleRoomMs: config.idleRoomMs,
    },
    { maxRooms: config.maxRooms, maxRoomsPerAddress: config.maxRoomsPerAddress },
  );
  const heartbeat = new Heartbeat(deps.scheduler, config.heartbeatMs);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_FRAME_BYTES });
  const http = createServer(
    createRequestHandler({
      allowedOrigins: config.allowedOrigins,
      registry,
      images,
      imageStore: createImageStore(config.contentRoot),
      logger: deps.logger,
    }),
  );
  http.on('upgrade', (request, socket, head) => {
    handleUpgrade(request, socket, head, {
      allowedOrigins: config.allowedOrigins,
      registry,
      sockets,
      clock: deps.clock,
      logger: deps.logger,
      heartbeat,
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(config.port, config.host, resolve);
  });
  heartbeat.start();
  const address = http.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the server is not listening on a TCP port');
  }
  const port = address.port;
  deps.logger.info('server.listening', { port });
  return {
    port,
    roomCount: () => registry.size,
    async close() {
      heartbeat.stop();
      registry.closeAll('server stopping');
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise<void>((resolve) => {
        http.close(() => {
          resolve();
        });
        http.closeAllConnections();
      });
    },
  };
}
