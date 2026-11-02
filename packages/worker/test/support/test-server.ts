import type { ClientOptions } from 'ws';
import type { ServerConfig } from '../../src/config/server-config.js';
import { startServer } from '../../src/server/start-server.js';
import type { RunningServer } from '../../src/server/start-server.js';
import { fakeContentRoot } from './content-root.js';
import { countingIds, ManualTime, seededRandom } from './manual-time.js';
import { createJsonLogger } from '../../src/platform/json-logger.js';
import { TestClient } from './test-client.js';

/** Long enough that no test moves the clock across a heartbeat by accident; heartbeat tests set it. */
const QUIET_HEARTBEAT_MS = 60 * 60 * 1000;

/** A real server on a free port, with manual time and counting ids, for tests with real sockets. */
export class TestServer {
  readonly time = new ManualTime();
  readonly logLines: string[] = [];
  private readonly clients: TestClient[] = [];
  private running: RunningServer | undefined;

  /** Starts the server. `overrides` changes the configuration for one test. */
  async start(overrides: Partial<ServerConfig> = {}): Promise<this> {
    this.running = await startServer(
      {
        port: 0,
        host: '127.0.0.1',
        contentRoot: fakeContentRoot,
        allowedOrigins: [],
        maxRooms: 50,
        maxRoomsPerAddress: 50,
        idleRoomMs: 60_000,
        heartbeatMs: QUIET_HEARTBEAT_MS,
        ...overrides,
      },
      {
        clock: this.time,
        scheduler: this.time,
        random: seededRandom(11),
        ids: countingIds(),
        logger: createJsonLogger((line) => this.logLines.push(line), this.time),
      },
    );
    return this;
  }

  get port(): number {
    if (this.running === undefined) throw new Error('the server is not started');
    return this.running.port;
  }

  get roomCount(): number {
    return this.running?.roomCount() ?? 0;
  }

  get origin(): string {
    return `http://127.0.0.1:${String(this.port)}`;
  }

  /** A plain HTTP request. */
  request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.origin}${path}`, init);
  }

  /** Makes a room and returns its id. */
  async createRoom(): Promise<string> {
    const response = await this.request('/rooms', { method: 'POST' });
    return ((await response.json()) as { roomId: string }).roomId;
  }

  /** Opens a socket to a room without joining. */
  async open(roomId: string, options: ClientOptions = {}): Promise<TestClient> {
    const client = await TestClient.connect(
      `ws://127.0.0.1:${String(this.port)}/rooms/${roomId}`,
      options,
    );
    this.clients.push(client);
    return client;
  }

  /** Opens a socket and joins under a name. */
  async join(roomId: string, name: string, options: ClientOptions = {}): Promise<TestClient> {
    const client = await this.open(roomId, options);
    await client.join(name);
    return client;
  }

  /**
   * One heartbeat: moves time by the interval, then waits until each responsive client has been
   * pinged and the server has taken its pong (a message sent after a pong arrives after it).
   */
  async beat(intervalMs: number, responsive: readonly TestClient[]): Promise<void> {
    const pings = responsive.map((client) => client.nextPing());
    this.time.advance(intervalMs);
    await Promise.all(pings);
    await Promise.all(responsive.map((client) => client.roundTrip()));
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.close();
    await this.running?.close();
    this.running = undefined;
  }
}
