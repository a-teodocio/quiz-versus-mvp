import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Clock, Random } from '@quiz-versus/core';
import type { QuizListing } from '@quiz-versus/protocol';
import { MAX_CLIENT_FRAME_BYTES } from '../config/defaults.js';
import type { ServerConfig } from '../config/server-config.js';
import {
  createDiskQuizRepository,
  type DiskQuizRepository,
} from '../content/disk-quiz-repository.js';
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

/** The TCP port a listening server got; closes it first if it is not on one. */
function listeningPort(http: Server): number {
  const address = http.address();
  if (address === null || typeof address === 'string') {
    http.close();
    throw new Error('the server is not listening on a TCP port');
  }
  return address.port;
}

/** The quizzes a host can pick. A file left out is logged by id and reason, so a typo is found. */
async function readQuizList(
  repository: DiskQuizRepository,
  logger: ServerLogger,
): Promise<readonly QuizListing[]> {
  const catalog = await repository.catalog();
  for (const { id, reason } of catalog.skipped) {
    logger.error('content.quiz-skipped', { quiz: id, reason });
  }
  return catalog.quizzes;
}

/**
 * Builds the server from its parts and starts listening. Throws a `ContentError` if the content
 * folder cannot be listed, so a bad folder stops the server at start and not mid-game.
 */
export async function startServer(config: ServerConfig, deps: ServerDeps): Promise<RunningServer> {
  const images = new ImageIndex();
  const repository = createDiskQuizRepository(config.contentRoot);
  const quizzes = await readQuizList(repository, deps.logger);
  const registry = new RoomRegistry(
    {
      ...deps,
      repository,
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
      quizzes,
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
  const port = listeningPort(http);
  heartbeat.start();
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
