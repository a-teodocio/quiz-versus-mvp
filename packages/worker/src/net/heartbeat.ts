import type { WebSocket } from 'ws';
import type { CancelTimer, Scheduler } from '../ports/scheduler.js';

/**
 * Pings every connection on a timer. A connection that has not answered the previous ping by the
 * next one is dropped, which makes its room see a `disconnect` instead of waiting forever on a
 * connection that died without saying so (a phone that lost signal, a closed laptop).
 */
export class Heartbeat {
  private readonly answered = new Map<WebSocket, boolean>();
  private cancel: CancelTimer | undefined;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.cancel = this.scheduler.after(this.intervalMs, () => {
      this.beat();
      this.start();
    });
  }

  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.answered.clear();
  }

  /** Starts watching a connection; it stops by itself when the connection closes. */
  watch(socket: WebSocket): void {
    this.answered.set(socket, true);
    socket.on('pong', () => {
      if (this.answered.has(socket)) this.answered.set(socket, true);
    });
    socket.on('close', () => {
      this.answered.delete(socket);
    });
  }

  private beat(): void {
    for (const [socket, answered] of [...this.answered]) {
      if (!answered) {
        socket.terminate();
        this.answered.delete(socket);
      } else {
        this.answered.set(socket, false);
        socket.ping();
      }
    }
  }
}
