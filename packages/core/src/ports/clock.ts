/** The current time. Adapters read the platform clock; tests use a manual one. */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}
