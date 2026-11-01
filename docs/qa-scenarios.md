# QA scenarios

What the `qa-tester` subagent (`.claude/agents/qa-tester.md`) plays through, from the point of view of a player. The scenarios are also acceptance criteria: a feature branch is not done when its scenarios cannot pass.

Each scenario has an ID the reports and pull requests refer to. Add a scenario when a bug is found that none of them would have caught, and when a rule changes.

## Levels

- **W (worker):** needs the running Worker and Durable Object. Played with several scripted WebSocket clients speaking the protocol (Node has a built-in `WebSocket` client, so no extra package is needed). Becomes possible with `feat/worker`.
- **B (browser):** needs the web client. Played in two or three browser windows. Becomes possible with `feat/web-versus`. A browser scenario also covers what the W scenario with the same subject checks.

A scenario that cannot run yet is reported as "could not run", not as failed.

## How a run goes

1. Start the app as the README says, on a free local port. Use the fake quizzes in `content/`.
2. Play the scenarios that apply to the branch, in order.
3. Report in the format of the agent definition. The author verifies each finding against the app and the code, fixes the real ones, and the same tester looks again at the fixes (as for the standards-reviewer).
4. The pull request description gives the verdict and the commit the final run covered.

The exact commands to start the app, and a seed that makes a game repeatable, are added by the branch that makes them real (`feat/worker`, `feat/web-versus`). Until then this page says what to check, not how to start it.

## Lobby and joining

| ID  | Scenario                                                                                           | Expected, as the player sees it                                                                                                        | Level |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| J1  | The host creates a room and shares the link; a friend opens it                                     | Both see each other in the lobby with their names, and who the host is. The link works for a third player too                          | W, B  |
| J2  | Names: empty, 24 and 25 characters, an emoji, a control character, text with `<b>` or a script tag | Bad names are refused with a clear message. A good name shows exactly as typed. Markup is shown as text, never run                     | W, B  |
| J3  | The room has 8 players and a ninth tries to join                                                   | The ninth is told the room is full. The others notice nothing                                                                          | W, B  |
| J4  | A link to a room that does not exist, or one that has been closed                                  | A clear "room not found" message, not a blank page or a spinner that never ends                                                        | W, B  |
| J5  | The host starts with one player in the room                                                        | Start is refused with a message that says two players are needed. Nothing changes for anyone. A guest who is not the host cannot start | W, B  |
| J6  | The host starts with two players, then with one of the two dropped                                 | Two connected: the game starts. One connected: refused as in J5                                                                        | W, B  |

## Playing a game

| ID  | Scenario                                                                                  | Expected, as the player sees it                                                                                                            | Level |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| P1  | Three players play a whole 3-question game                                                | Everyone gets the same questions in the same order with the same option order. Scores add up. The final table is right, best first         | W, B  |
| P2  | Nobody answers one question                                                               | A countdown is visible and the question closes at zero. The reveal shows who did not answer. The clock does not drift between players      | W, B  |
| P3  | Everyone answers before the time is up                                                    | The question closes at once, without waiting for the clock                                                                                 | W, B  |
| P4  | A player answers twice, double-clicks, or answers with the keys 1 to 4 and Enter or Space | One answer counts, with clear feedback that it was received. Keys work as in the real quiz app                                             | W, B  |
| P5  | Typed answers: right, wrong case, wrong accent, one letter off, plural, a long answer     | Right answers score. One letter off is wrong and the reveal says it was close. Long answers are asked as multiple choice instead           | W, B  |
| P6  | Picture questions and picture groups with several parts                                   | The picture loads, can be zoomed, and stays the same for every part, with the parts in order. The picture address does not name the answer | W, B  |
| P7  | Secrecy: read every message and the page while a question is open                         | Nothing shows the correct answer, the explanation, who is right, or a changed score until the reveal                                       | W, B  |
| P8  | A player answers just after the time ran out, on a slow connection                        | They are told the time was up, and are not left wondering. No points are given                                                             | W, B  |

## Connection loss and coming back

| ID  | Scenario                                                                                              | Expected, as the player sees it                                                                                                               | Level |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R1  | A player refreshes the page in the middle of a question                                               | They are back in the same seat, with the same question and the right time left. If they had answered, it shows, and they cannot answer again  | W, B  |
| R2  | A player goes offline during a question and comes back during the reveal, and again after the results | The others are not held up. The returning player catches up on the reveal, or on the results, with their score intact                         | W, B  |
| R3  | A new player joins while a question is open                                                           | They see the question with the time left, start on 0 points, and the question now waits for them as well                                      | W, B  |
| R4  | A new player joins during a reveal                                                                    | They see the reveal and wait for the next question                                                                                            | W, B  |
| R5  | A new player joins after the results                                                                  | They are told the game is over. A player who was in the game can still come back and see the results                                          | W, B  |
| R6  | The host drops during a reveal                                                                        | Another player becomes host and can continue. The old host, back again, is a guest and sees that                                              | W, B  |
| R7  | Everyone leaves, then someone opens the old link                                                      | The room is closed: "room not found" as in J4                                                                                                 | W, B  |
| R8  | One player opens the game in two tabs                                                                 | The newer tab takes over the seat, and the older tab stops being a player (it is closed or shown that it was replaced). Nobody gets two seats | W, B  |

## Ties

| ID  | Scenario                                                                             | Expected, as the player sees it                                                                                                                     | Level |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| T1  | Two of three players tie for first                                                   | A tie-break is announced at the last reveal. The two tied players are asked an extra question. The third watches and cannot answer, and is told why | W, B  |
| T2  | The tied players stay level for five extra questions, or the spare questions run out | The game ends with co-winners sharing rank 1                                                                                                        | W, B  |
| T3  | A tied player leaves during the tie-break                                            | The game goes to the results at once, with the remaining player winning                                                                             | W, B  |
| T4  | A tie below first place                                                              | It is not played off. Equal scores share a rank (1, 2, 2, 4)                                                                                        | W, B  |
| T5  | A player who joined late is level for first                                          | They are not in the tie-break, and share rank 1 only if the others end level with them                                                              | W, B  |

## Bad input and abuse

| ID  | Scenario                                                                                                   | Expected, as the player sees it                                                                  | Level |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| X1  | Messages that are not JSON, are too big, have unknown fields, or come before joining                       | Refused with a stable error code. The server stays up and other players are unaffected           | W     |
| X2  | One client sends messages as fast as it can                                                                | It is rate limited. Other players notice nothing                                                 | W     |
| X3  | A connection from a page on another origin                                                                 | Refused                                                                                          | W     |
| X4  | A client that sends `answer` for a question that is not open, or as a watcher, or the wrong kind of answer | The matching error (`STALE_QUESTION`, `NOT_IN_TIEBREAK`, `INVALID_ANSWER`), and the game goes on | W     |
| X5  | A guest sends `start` or `next`                                                                            | `NOT_HOST`, and nothing else happens                                                             | W     |

## Using it

| ID  | Scenario                                                                                                                             | Expected, as the player sees it                                                                                 | Level |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----- |
| A1  | A whole game with the keyboard only                                                                                                  | Every control is reachable, the focus is always visible, and nothing needs the mouse                            | B     |
| A2  | A phone-sized window (375 px wide)                                                                                                   | Nothing is cut off or overlaps, buttons can be tapped, text is readable, and the page does not scroll sideways  | B     |
| A3  | Light and dark theme                                                                                                                 | Text and the correct, wrong and neutral states are readable in both                                             | B     |
| A4  | The page read by a screen reader or its accessibility tree                                                                           | Buttons and options have names, the question and the result changes are announced, and nothing is only a colour | B     |
| A5  | Questions look and act like the real quiz app (text, picture, picture group, keys, zoom), per the fidelity list in `docs/roadmap.md` | Same behaviour. Any difference is in `docs/fidelity.md`                                                         | B     |

## Adding scenarios

Give the scenario the next ID in its table, say what the player sees (not how the code works), and mark the level. When a rule changes in an ADR or `protocol.md`, change the scenarios that state it in the same pull request.
