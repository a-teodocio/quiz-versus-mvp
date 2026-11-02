import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { MAX_IMAGE_BYTES } from '../config/defaults.js';

const IMAGES_FOLDER = 'images';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** A picture ready to send. */
export interface ImageFile {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/** Reads pictures by the `image_path` a quiz file gives (`images/<course>/<name>.png`). */
export interface ImageStore {
  /** The picture, or undefined for anything missing, unsafe, too large or not a picture. */
  read(imagePath: string): Promise<ImageFile | undefined>;
}

/** `images/` then one or more plain segments. Backslashes, drives and empty segments cannot match. */
const SAFE_PATH = /^images(\/[A-Za-z0-9._-]+)+$/;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)/;

const isPlainPath = (imagePath: string): boolean =>
  SAFE_PATH.test(imagePath) && !DOT_SEGMENT.test(imagePath);

/**
 * Serves pictures from inside `<contentRoot>/images` only. The path is checked by its spelling and
 * again by where it really leads (links followed), as the real server's containment check does,
 * so a link inside the folder cannot reach a file outside it. `content/` is never served as a
 * folder.
 */
export function createImageStore(contentRoot: string): ImageStore {
  return {
    async read(imagePath) {
      const contentType = CONTENT_TYPES[extname(imagePath).toLowerCase()];
      if (contentType === undefined || !isPlainPath(imagePath)) return undefined;
      try {
        const root = await realpath(join(contentRoot, IMAGES_FOLDER));
        const file = await realpath(join(contentRoot, ...imagePath.split('/')));
        if (!file.startsWith(root + sep)) return undefined;
        const info = await stat(file);
        if (!info.isFile() || info.size > MAX_IMAGE_BYTES) return undefined;
        return { bytes: await readFile(file), contentType };
      } catch {
        // A missing file, a broken link or a denied read all mean "no such picture" to a player.
        return undefined;
      }
    },
  };
}
