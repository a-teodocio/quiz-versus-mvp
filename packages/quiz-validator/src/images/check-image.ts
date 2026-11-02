import { error, note } from '../findings/finding.js';
import type { Finding, Place } from '../findings/finding.js';
import { isFilled, pythonRepr } from '../json/json-values.js';
import { resolveImagePath } from './image-path.js';
import { pngWidth } from './image-source.js';
import type { ImageSource } from './image-source.js';

/** Below this width a picture is reported as low resolution (a note, `--strict` only). */
const MIN_IMAGE_WIDTH = 400;

export interface ImageCheck {
  readonly findings: Finding[];
  /** The path under the content folder, once the path is acceptable and the file exists. */
  readonly resolved: string | undefined;
}

/**
 * Checks one `image_path`: it is given, stays inside the images folder, names a served file type
 * and exists. `seen` holds the pictures this file has already used, so a low-resolution note is
 * made once per picture.
 */
export function checkImage(
  place: Place,
  imagePath: unknown,
  images: ImageSource,
  seen: ReadonlySet<string>,
): ImageCheck {
  if (!isFilled(imagePath)) {
    return { findings: [error(place, 'image entry has no image_path')], resolved: undefined };
  }
  const quoted = pythonRepr(imagePath);
  const result = resolveImagePath(imagePath);
  if (!result.ok) {
    return {
      findings: [error(place, `image_path ${quoted}: ${result.problem}`)],
      resolved: undefined,
    };
  }
  const head = images.fileHead(result.path);
  if (head === undefined) {
    return {
      findings: [error(place, `image_path ${quoted}: file not found`)],
      resolved: undefined,
    };
  }
  const width = seen.has(result.path) ? undefined : pngWidth(head);
  const tooNarrow = width !== undefined && width < MIN_IMAGE_WIDTH;
  const findings = tooNarrow
    ? [note(place, `low-resolution image (${String(width)}px wide): ${imagePath}`)]
    : [];
  return { findings, resolved: result.path };
}
