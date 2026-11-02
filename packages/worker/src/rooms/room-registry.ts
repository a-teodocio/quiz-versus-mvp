import { RoomHost } from './room-host.js';
import type { RoomHostDeps } from './room-host.js';

/** Why a room could not be made. */
export type RoomRefusal = 'server-full' | 'address-limit';

export type RoomCreation =
  | { readonly ok: true; readonly room: RoomHost }
  | { readonly ok: false; readonly reason: RoomRefusal };

export interface RoomLimits {
  readonly maxRooms: number;
  readonly maxRoomsPerAddress: number;
}

/**
 * Every room in the process. It makes rooms (within its limits), finds them by id, and forgets
 * a room when the room closes, so memory cannot grow without bound (review-checklist H2).
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, { room: RoomHost; creator: string }>();

  constructor(
    private readonly deps: RoomHostDeps,
    private readonly limits: RoomLimits,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  /** Makes an empty room for a visitor at this network address. */
  create(creator: string): RoomCreation {
    if (this.rooms.size >= this.limits.maxRooms) return { ok: false, reason: 'server-full' };
    if (this.countFor(creator) >= this.limits.maxRoomsPerAddress) {
      return { ok: false, reason: 'address-limit' };
    }
    const room = new RoomHost(this.deps.ids.next(), this.deps, (roomId) => {
      this.rooms.delete(roomId);
    });
    this.rooms.set(room.roomId, { room, creator });
    this.deps.logger.info('room.opened', { rooms: this.rooms.size });
    return { ok: true, room };
  }

  find(roomId: string): RoomHost | undefined {
    return this.rooms.get(roomId)?.room;
  }

  /** Closes every room (the server is stopping). */
  closeAll(reason: string): void {
    for (const { room } of [...this.rooms.values()]) room.close(reason);
  }

  private countFor(creator: string): number {
    let count = 0;
    for (const entry of this.rooms.values()) if (entry.creator === creator) count += 1;
    return count;
  }
}
