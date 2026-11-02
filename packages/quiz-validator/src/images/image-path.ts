/** The one folder pictures live in. The real app has two named roots and a read-only fallback; the mock has this one. */
export const IMAGE_ROOT = 'images';

/** File types the real app's image route serves. */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.tif',
  '.tiff',
]);

export type ImagePathResult =
  { readonly ok: true; readonly path: string } | { readonly ok: false; readonly problem: string };

/** Python's `Path.suffix`: the text from the last dot, empty for a name with no dot or only a leading one. */
export function suffixOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const at = name.lastIndexOf('.');
  return at <= 0 || at === name.length - 1 ? '' : name.slice(at);
}

/** The segments left after resolving `.` and `..`, or undefined when `..` climbs out of the start. */
function resolveSegments(path: string): string[] | undefined {
  const kept: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment !== '..') kept.push(segment);
    else if (kept.pop() === undefined) return undefined;
  }
  return kept;
}

/** A path that starts from the root of a drive or the file system instead of from the content folder. */
const isAbsolute = (normal: string): boolean =>
  normal.includes('\0') || normal.startsWith('/') || (normal.length > 1 && normal[1] === ':');

/**
 * Maps an `image_path` to a file inside the images folder, as `resolve_image_path` and the
 * validator's `resolve_image` do: absolute paths are refused, `..` and look-alike folder names
 * cannot get out, and the file type must be one the app serves. Only the path is judged here;
 * whether the file exists is the image source's job. Symbolic links are the disk adapter's.
 */
export function resolveImagePath(imagePath: string): ImagePathResult {
  const normal = imagePath.replaceAll('\\', '/');
  if (isAbsolute(normal)) return { ok: false, problem: 'absolute paths are not allowed' };
  if (normal.split('/')[0]?.toLowerCase() !== IMAGE_ROOT) {
    return { ok: false, problem: `mock: pictures live under ${IMAGE_ROOT}/ only` };
  }
  const segments = resolveSegments(normal);
  if (segments?.[0] !== IMAGE_ROOT || segments.length < 2) {
    return { ok: false, problem: `path escapes the ${IMAGE_ROOT} folder` };
  }
  const path = segments.join('/');
  const extension = suffixOf(path).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    return { ok: false, problem: `unsupported image extension '${suffixOf(path)}'` };
  }
  return { ok: true, path };
}
