/** Structured logging. Fields must never carry answers, resume tokens or typed text. */
export interface Logger {
  info(event: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}
