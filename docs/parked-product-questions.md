# Parked product questions

Questions about how the product should behave that the documents do not settle. The `qa-tester` raises them and the author adds them; this page keeps them in one place, ranked, so nothing is lost and nothing blocks the work in hand.

## Core and parked

- **Core game mode:** the versus game itself, from joining a room to the results, including questions, reveals, ties, reconnecting and the rules in [ADR 6](adr/0006-versus-game-rules.md) and [ADR 7](adr/0007-core-state-machine.md). A product question about the core game is asked of the owner now, in the report and the pull request, because the scenarios it touches cannot pass without an answer. It is listed below under "Core questions waiting for the owner" until answered.
- **Parked:** anything outside the core game, such as options for particular players, content policies, extra flows around the game, or polish. These do not block a branch. They are ranked here for future development.
- **The test that tells them apart:** does the answer change what the core game must do for every player (core), or add an option or a content policy around it (parked)? A question about a rule everyone plays by is core, even when it is about accessibility.
- **Findings are never parked.** If a requirement, a WCAG criterion at level A or AA, or a stated principle already says what must happen, a failure is a finding in the report. Park only a question the documents leave open and that is outside the core game.

## Severity of a parked question

- **P1, high:** a group of people cannot use part of the product, or someone could be harmed, and there is no alternative. Decide before real players use it.
- **P2, medium:** a notable gap in the experience or in inclusion, with a workaround. Decide before the product is promoted.
- **P3, low:** an improvement or polish idea. Decide when there is room.

Within one severity, list the question that affects more players first, then the cheaper one.

## Gates

- Before real players use the product: no open P1, and every core question answered.
- Before the product is promoted: the P2 questions reviewed and each either decided or knowingly left.

## How a question gets here

The tester cannot edit `docs/`. It proposes each parked question in its report with a proposed severity and the reason, and does not repeat one already listed unless it has new evidence. The author adds the entry with the next ID. The owner can change a severity or a ruling at any time. When a question is decided, move it to "Decided" with a link to where the decision is recorded (an ADR, `fidelity.md` or the protocol page).

## Core questions waiting for the owner

None.

## Parked questions

| ID   | Question                                                                                                                                                                                                                                                            | Why it matters                                                                                                                                                               | Area          | Severity | Raised            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ----------------- |
| PQ-1 | A picture question needs a text alternative that identifies the picture without giving the answer away. How much detail may it carry (WCAG 1.1.1 requires at least a descriptive identification)? A missing or useless alternative is a finding, not this question. | A blind player needs enough detail to answer; too much spoils the question for everyone.                                                                                     | Content       | P1       | 2026-11-01 review |
| PQ-2 | Should a room be able to give players more time per question, beyond the host's limit? A per-player extension would break the rule that everyone gets the same time (ADR 6, scenario U10); a room-level setting would not.                                          | Players who need more time to read, type or use assistive technology are shut out by a short limit. Workaround today: the host can set up to 120 seconds for the whole room. | Accessibility | P2       | 2026-11-01 review |
| PQ-3 | Should leaving mid-game ask for confirmation?                                                                                                                                                                                                                       | An accidental tap on Leave drops a player's seat and score. A seat can be resumed only while the token is kept.                                                              | Flow          | P3       | 2026-11-01 review |
| PQ-4 | Should the results screen offer a way to play again with the same people?                                                                                                                                                                                           | Today the way forward is leaving. A rematch is a common wish, and a dead end is a usability cost.                                                                            | Flow          | P3       | 2026-11-01 review |
| PQ-5 | Should the announcement that opens a question state the time limit (for example "You have 8 seconds"), so a screen-reader player is told the limit?                                                                                                                 | A question whose whole limit is 10 seconds or less gets no warning (ADR 9), so a screen-reader player is told nothing about the clock.                                       | Accessibility | P3       | 2026-11-01 review |

## Decided

| ID   | Decision                                                                                                              | Recorded in                                                             | Date       |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| CQ-1 | The keys 1 to 4 can be switched off and are active only while focus is in the question area. They are not remappable. | [ADR 9](adr/0009-player-interface-rules.md), [fidelity.md](fidelity.md) | 2026-11-01 |
| CQ-2 | When 10 seconds remain, the player gets a warning that does not rely on colour alone, announced once.                 | [ADR 9](adr/0009-player-interface-rules.md)                             | 2026-11-01 |
