import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { IMAGE_HEAD_BYTES } from '../images/image-source.js';
import type { ImageSource } from '../images/image-source.js';
import { IMAGE_ROOT } from '../images/image-path.js';
import { REGISTRY_FILE } from '../registry/check-registry.js';
import type { ContentTree, QuizFileSource } from '../tree/content-tree.js';

const QUIZZES_FOLDER = 'quizzes';

const isHidden = (name: string): boolean => name.startsWith('_');
const isCourseFolderName = (name: string): boolean =>
  !name.startsWith('_') && !name.startsWith('.');

function readHead(path: string): Uint8Array {
  const handle = openSync(path, 'r');
  try {
    const head = new Uint8Array(IMAGE_HEAD_BYTES);
    const read = readSync(handle, head, 0, IMAGE_HEAD_BYTES, 0);
    return head.subarray(0, read);
  } finally {
    closeSync(handle);
  }
}

/**
 * Pictures from the `images/` folder under `root`. A path whose real location (links followed) is
 * outside that folder is treated as missing, as the real server's containment check treats it.
 */
function imagesOnDisk(root: string): ImageSource {
  const imagesRoot = join(root, IMAGE_ROOT);
  return {
    fileHead(path) {
      const file = join(root, ...path.split('/'));
      if (!existsSync(file) || !statSync(file).isFile()) return undefined;
      if (!realpathSync(file).startsWith(realpathSync(imagesRoot) + sep)) return undefined;
      return readHead(file);
    },
  };
}

function quizFilesIn(quizzes: string, course: string): QuizFileSource[] {
  return readdirSync(join(quizzes, course))
    .filter((name) => name.endsWith('.json') && !isHidden(name))
    .sort()
    .map((name) => ({ course, name, text: readFileSync(join(quizzes, course, name), 'utf8') }));
}

/** Reads the content folder (`quizzes/` and `images/` inside `root`) into a tree the validator can check. */
export function readContentTree(root: string): ContentTree {
  const quizzes = join(root, QUIZZES_FOLDER);
  const entries = readdirSync(quizzes, { withFileTypes: true });
  const courseFolders = entries
    .filter((entry) => entry.isDirectory() && isCourseFolderName(entry.name))
    .map((entry) => entry.name)
    .sort();
  const looseQuizFileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .filter((name) => name !== REGISTRY_FILE && !isHidden(name))
    .sort();
  const registryFile = join(quizzes, REGISTRY_FILE);
  return {
    registryText: existsSync(registryFile) ? readFileSync(registryFile, 'utf8') : undefined,
    courseFolders,
    quizFiles: courseFolders.flatMap((course) => quizFilesIn(quizzes, course)),
    looseQuizFileNames,
    images: imagesOnDisk(root),
  };
}
