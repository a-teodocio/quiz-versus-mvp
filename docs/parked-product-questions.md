# Parked product questions

Questions about how the product should behave that the documents do not settle. The `qa-tester` and the reviewers raise them; this page keeps them in one place, ranked, so nothing is lost and nothing blocks the work in hand.

## Core and parked

- **Core game mode:** the versus game itself, from joining a room to the results, including questions, reveals, ties, reconnecting and the rules in [ADR 6](adr/0006-versus-game-rules.md) and [ADR 7](adr/0007-core-state-machine.md). A product question about the core game is asked of the owner now, in the report and the pull request, because the branch cannot be judged without an answer. It is listed below under "Core questions waiting for the owner" until answered.
- **Parked:** anything outside the core game, such as accommodations for particular players, content policies, extra flows around the game, or polish. These do not block a branch. They are ranked here for future development.

## Severity of a parked question

- **P1, high:** a group of people cannot use part of the product, or someone could be harmed, and there is no alternative. Decide before real players use it.
- **P2, medium:** a notable gap in the experience or in inclusion, with a workaround. Decide before the product is promoted.
- **P3, low:** an improvement or polish idea. Decide when there is room.

Within one severity, list the question that affects more players first, then the cheaper one.

## How a question gets here

The tester cannot edit `docs/`. It proposes each parked question in its report with a proposed severity and the reason, and does not repeat one already listed unless it has new evidence. The author adds the entry with the next ID. The owner can change a severity or a ruling at any time. When a question is decided, move it to "Decided" with a link to where the decision is recorded (an ADR, `fidelity.md` or the protocol page).

## Core questions waiting for the owner

| ID   | Question                                                                                                                                                                                                             | Why it matters                                                                                                                               | Raised            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| CQ-1 | The keys 1 to 4 answer a question, as in the real app. WCAG 2.1.4 (level A) asks that single-key shortcuts can be turned off, remapped, or work only while their control has focus. Which option does the mock take? | Keyboard and speech-input users can trigger answers by accident. Fidelity says the keys stay; the criterion says they need one of the three. | 2026-11-01 review |
| CQ-2 | Should the last seconds of a question show a warning (a colour change, a sound, an announcement), and at how many seconds?                                                                                           | No requirement states one. The tester is told not to guess, so it cannot judge the clock without an answer.                                  | 2026-11-01 review |

## Parked questions

| ID   | Question                                                                                                                                             | Why it matters                                                                                                                                                 | Area          | Severity | Raised            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ----------------- |
| PQ-1 | Picture questions ask players to identify what a picture shows, so a text alternative must not give the answer away. What should a blind player get? | Without an answer, blind and low-vision players cannot take picture questions at all (WCAG 1.1.1), and the alternative must not spoil them.                    | Content       | P1       | 2026-11-01 review |
| PQ-2 | Should a player be able to ask for more time per question (a setting for the room, or per player)?                                                   | Players who need more time to read, type or use assistive technology are shut out by a fixed limit (WCAG 2.2.1 applies to a real-time game only by exception). | Accessibility | P2       | 2026-11-01 review |
| PQ-3 | Should leaving mid-game ask for confirmation?                                                                                                        | An accidental tap on Leave drops a player's seat and score. A seat can be resumed only while the token is kept.                                                | Flow          | P3       | 2026-11-01 review |
| PQ-4 | Should the results screen offer a way to play again with the same people?                                                                            | Today the way forward is leaving. A rematch is a common wish, and a dead end is a usability cost.                                                              | Flow          | P3       | 2026-11-01 review |

## Decided

None yet.
