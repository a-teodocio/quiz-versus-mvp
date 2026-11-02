/** Where room ids, player ids and resume tokens come from. Production must be unguessable. */
export interface IdSource {
  /** A new id of the form the protocol accepts for rooms, players and tokens. */
  next(): string;
}
