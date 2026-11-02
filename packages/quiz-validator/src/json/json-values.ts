/**
 * Helpers for reading parsed JSON the way the real validator's Python does. The data is
 * untrusted, so everything arrives as `unknown` and is narrowed here.
 */

export type JsonObject = Readonly<Record<string, unknown>>;

/** A JSON object (Python `dict`); an array is not one. */
export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isList = (value: unknown): value is unknown[] => Array.isArray(value);

export const isText = (value: unknown): value is string => typeof value === 'string';

/** A string that is not empty once trimmed. */
export const isFilled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** A whole number that is not a boolean (Python counts `True` as an int; the validator does not). */
export const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** Python truthiness, which `or` chains in the real code rely on. */
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '';
  if (Array.isArray(value)) return value.length > 0;
  return isObject(value) && Object.keys(value).length > 0;
}

/** What JavaScript makes of a value inside a string concatenation (see `entryKeys`). */
export function jsText(value: unknown): string {
  if (value === null || value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? value.map(jsText).join(',') : '[object Object]';
}

const PYTHON_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** A string as Python shows it: single quotes, unless it holds a single quote and no double quote. */
function pythonStringRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  const escaped = text.replace(
    /[\\\n\r\t]/g,
    (character) => PYTHON_ESCAPES[character] ?? character,
  );
  return `${quote}${quote === "'" ? escaped.replaceAll("'", "\\'") : escaped}${quote}`;
}

/** A value as Python's `repr` shows it, for messages that quote what was found. */
export function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return pythonStringRepr(value);
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`;
  const pairs = Object.entries(value as Record<string, unknown>).map(
    ([key, inner]) => `${pythonRepr(key)}: ${pythonRepr(inner)}`,
  );
  return `{${pairs.join(', ')}}`;
}

/** A value as Python's `str` shows it: like `repr`, except that a string is shown as it is. */
export const pythonText = (value: unknown): string =>
  typeof value === 'string' ? value : pythonRepr(value);
