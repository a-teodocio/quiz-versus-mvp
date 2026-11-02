/**
 * A quiz file or picture the server cannot use. The message names the file and the kind of
 * problem and never repeats what the file says, so it is safe to log.
 */
export class ContentError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
    this.name = 'ContentError';
  }
}
