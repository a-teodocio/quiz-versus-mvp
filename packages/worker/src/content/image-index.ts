/**
 * Every picture name in use across all rooms, so `/images/<alias>` can be answered without the
 * request saying which room it belongs to. Names are added when a game starts and released when
 * its room closes, so a closed room leaves nothing behind.
 */
export class ImageIndex {
  private readonly paths = new Map<string, string>();
  private readonly aliasesByRoom = new Map<string, string[]>();

  /** True if any of these names is already used by a room. */
  collidesWith(aliases: Iterable<string>): boolean {
    for (const alias of aliases) {
      if (this.paths.has(alias)) return true;
    }
    return false;
  }

  /** Adds a room's names. The caller has checked `collidesWith` first. */
  register(roomId: string, images: ReadonlyMap<string, string>): void {
    this.release(roomId);
    for (const [alias, imagePath] of images) this.paths.set(alias, imagePath);
    this.aliasesByRoom.set(roomId, [...images.keys()]);
  }

  /** Forgets every name of a room. */
  release(roomId: string): void {
    for (const alias of this.aliasesByRoom.get(roomId) ?? []) this.paths.delete(alias);
    this.aliasesByRoom.delete(roomId);
  }

  /** The quiz file's `image_path` for a name, or undefined when no room uses it. */
  pathFor(alias: string): string | undefined {
    return this.paths.get(alias);
  }
}
