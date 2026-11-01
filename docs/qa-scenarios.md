# QA scenarios

What the `qa-tester` subagent (`.claude/agents/qa-tester.md`) checks, from the point of view of a player. Its goal is an excellent experience: the app does what is required, it is easy, clear and forgiving to use, and everyone can use it. The scenarios are also acceptance criteria: a feature branch is not done when its scenarios cannot pass.

Each scenario has an ID the reports and pull requests refer to. The tester writes them as tests, titled with the ID, which a test framework runs. The tester cannot edit this page: it proposes new scenarios in its report and the author adds them. Add a scenario when a bug is found that none of them would have caught, and when a rule changes.

## Standards the tester judges against

Every finding cites one of these, so the author can see why it matters.

- **Functionality:** the requirements in [protocol.md](protocol.md), [ADR 6](adr/0006-versus-game-rules.md), [ADR 7](adr/0007-core-state-machine.md) and the scenarios below. A difference listed in [fidelity.md](fidelity.md) is by design.
- **Usability:** Nielsen's ten usability heuristics (visibility of system status, match with the real world, user control and freedom, consistency and standards, error prevention, recognition rather than recall, flexibility and efficiency, minimalist design, helping users recover from errors, help), plus the multiplayer principles in the agent definition (waiting states, fairness, social presence, tone).
- **Accessibility:** WCAG 2.2 level AA. Automated checks (axe) find only part of the problems, so the rest is walked through by hand.

**Inherited problems.** The web client starts as a verbatim copy of the real quiz app's page. If that page fails a check, the tester reports it under "Inherited findings", with its true severity, so the author can decide whether to fix it in the mock or note it for the port. It is not a regression of the branch and does not change the verdict unless the owner says so.

**Product questions.** A question about the core game goes to the owner now ("Core product questions" in the report). A question outside it is parked, ranked P1 to P3, in [parked-product-questions.md](parked-product-questions.md), and never blocks a branch.

**Suggestions are not findings.** Ideas such as asking before a player leaves mid-game go under "Suggestions" in the report: no requirement or principle is broken by their absence.

## Personas

The tester walks the whole journey (join, play, lose and regain connection, finish) as each of these, not just single screens.

- The friend on a phone who opened a link with no account and no instructions (375 px, touch, poor connection).
- The keyboard-only player.
- The screen-reader player (judged through the accessibility tree and the announcements).
- The low-vision player (200% text, 400% zoom, forced colors, dark theme).
- The colour-blind player (every state readable without colour).
- The distracted player (switches tabs, locks the phone, loses signal, answers at the last second).
- The host under pressure (starts with one player, a late arrival, loses their connection).
- The competitive player (cares that it is fair and that the scores and tie-break make sense).

## What a script cannot judge

Some things need a person. The tester lists them in every report under "Needs a human check", so they are never assumed fine: real screen readers (NVDA, VoiceOver, TalkBack), real phones and tablets, how colour-blind players actually see the screens, whether the wording is understood, and usability with real players. Plan a pass with real people before real use.

## Levels

- **W (worker):** needs the running Worker and Durable Object. Played with several scripted WebSocket clients speaking the protocol (Node has a built-in `WebSocket` client, so no extra package is needed). Becomes possible with `feat/worker`.
- **B (browser):** needs the web client. Played in two or three browser windows. Becomes possible with `feat/web-versus`. A browser scenario also covers what the W scenario with the same subject checks. All accessibility and usability scenarios are level B.

A scenario that cannot run yet is reported as "could not run", not as failed.

## How a run goes

1. The tester starts the app with `npm run qa:start` and stops it with `npm run qa:stop`. It uses the fake quizzes in `content/`.
2. The tester writes tests for the scenarios that apply to the branch (in `e2e/qa/` and `packages/worker/test/qa/`, the two folders it owns), has the frameworks run them, and walks the personas with short exploratory tests. It leaves its files in the working tree.
3. Report in the format of the agent definition (findings with their basis, personas, what works well, product questions, and what needs a human check). The author reads the tester's tests as code, runs `npm run format` and `npm run check` on them (the tester cannot), verifies each finding against the app and the code, fixes the real ones, and the same tester looks again at the fixes (as for the standards-reviewer).
4. The pull request description gives the verdict and the commit the final run covered.

The exact commands to start the app, and a seed that makes a game repeatable, are added by the branch that makes them real (`feat/worker`, `feat/web-versus`). Until then this page says what to check, not how to start it.

## Lobby and joining

| ID  | Scenario                                                                                           | Expected, as the player sees it                                                                                                                                                                      | Level |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| J1  | The host creates a room and shares the link; a friend opens it                                     | Both see each other in the lobby with their names, and who the host is. The link works for a third player too                                                                                        | W, B  |
| J2  | Names: empty, 24 and 25 characters, an emoji, a control character, text with `<b>` or a script tag | Bad names are refused with a clear message. A good name shows exactly as typed. Markup is shown as text, never run                                                                                   | W, B  |
| J3  | The room has 8 players and a ninth tries to join                                                   | The ninth is told the room is full. The others notice nothing                                                                                                                                        | W, B  |
| J4  | A link to a room that does not exist, or one that has been closed                                  | A clear "room not found" message, not a blank page or a spinner that never ends                                                                                                                      | W, B  |
| J5  | The host looks at Start with one player in the room, and with two of whom one has dropped          | Start shows a visible reason (a second player is needed) and does not start the game. A guest has no Start control. If a start is sent anyway, the server refuses it and the client shows a sentence | W, B  |
| J6  | The host starts with two players, then with one of the two dropped                                 | Two connected: the game starts. One connected: refused as in J5                                                                                                                                      | W, B  |

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

## Accessibility (WCAG 2.2 AA)

Each of these has an automated half (a test the framework runs on every screen state: lobby, question by picking, question by typing, reveal, results, room not found, room full, reconnecting; in light and dark themes; at phone and desktop sizes) and a manual half (walked through with a persona).

| ID  | Scenario                                                | Expected, as the player experiences it                                                                                                                                                                                                          | Level |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| A1  | A whole game with the keyboard only                     | Every control is reachable and usable, there is no trap, the order is logical, the focus is always visible and never hidden by other content, and focus moves to the new question or reveal                                                     | B     |
| A2  | Phone-sized window (375 px), 320 px and 400% zoom       | Nothing is cut off or overlaps, there is no sideways scrolling, targets are at least 24 px (aim 44), text is readable, and zooming is not disabled                                                                                              | B     |
| A3  | Contrast in light, dark and forced-colors modes         | Text has 4.5 to 1 contrast and interface parts and states 3 to 1 (disabled controls are exempt) in light and dark. In forced colors every state stays distinguishable by more than colour (borders, icons, text), which is judged, not measured | B     |
| A4  | Colour is not the only signal                           | Correct, wrong, answered, connected and dropped each show as text or an icon as well as colour                                                                                                                                                  | B     |
| A5  | The accessibility tree of each screen                   | Roles, names, states and reading order are right: headings describe each screen and the question is a heading, options are labelled, the clock is labelled, there are landmarks                                                                 | B     |
| A6  | Announcements to assistive technology                   | Answer received, time up, new question, the reveal, a player joining or leaving, and connection lost and back are announced politely. The countdown is not announced every second                                                               | B     |
| A7  | The question timer                                      | The limit is visible and the clock stays correct when the tab is hidden. A warning near the end is a core product question (no requirement states one); more time for players who need it is a parked one                                       | B     |
| A8  | Motion and flashing                                     | Non-essential animation stops under reduced motion (best practice, so a failure is minor). Flashing is judged from the animations' definitions; if it cannot be told, it is a human check                                                       | B     |
| A9  | The name field and every error                          | The field has a label and states its limit. Errors are shown in text, tied to the field, and say how to fix them. Nothing changes context unexpectedly on focus or input                                                                        | B     |
| A10 | Page structure                                          | The page title changes with the state, the language is set, there is one main heading, and focus is managed when the screen changes                                                                                                             | B     |
| A11 | Text resized to 200% and wider text spacing             | Nothing is clipped or lost                                                                                                                                                                                                                      | B     |
| A12 | Pictures                                                | Every picture has a text alternative that does not give the answer away. Where the picture is the question, what a blind player should get is a parked product question                                                                         | B     |
| A13 | An automated scan of every screen state, theme and size | axe with the tags wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa reports no violation. Its "incomplete" results are listed as unverified, not counted as passes                                                                                | B     |
| A14 | Single-key shortcuts                                    | The keys 1 to 4 can be turned off, remapped, or work only while their control has focus. The real app has them always on, so which option to take is a core product question                                                                    | B     |
| A15 | Labels and pointer use                                  | A control's visible label is part of its accessible name. An answer is not committed on pointer down, so a slip can be cancelled. Nothing needs a path-based gesture or dragging                                                                | B     |
| A16 | Orientation and pop-ups                                 | Both orientations work. Content shown on hover or focus can be dismissed and stays visible while it is needed                                                                                                                                   | B     |

## Usability (heuristics and multiplayer)

| ID  | Scenario                                      | Expected, as the player experiences it                                                                                                                                                                              | Level |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| U1  | A first-time friend opens the link on a phone | Within about ten seconds they know what this is, what to enter, and what happens next. No instructions needed                                                                                                       | B     |
| U2  | System status at every moment                 | The player can tell the phase, the time left, whether their answer was received, who has answered, who the host is, and their connection state. No silent wait of more than a second                                | B     |
| U3  | Feedback timing                               | A tap or key press shows a response within about 0.1 s. A longer wait shows that something is happening                                                                                                             | B     |
| U4  | Waiting states                                | After answering, the player sees what they are waiting for and roughly how many are left. In the lobby and at a reveal, guests see that the host decides, and the host sees what to press                           | B     |
| U5  | Every refusal and error                       | Room full, not found, two players needed, time up, game over, connection lost: each says what happened and what to do next, in plain words, near the cause. No codes, no blame                                      | B     |
| U6  | Error prevention                              | Start explains itself until two players are connected, as in J5, and the reason can be read without a mouse and is announced. A double tap or double Enter does not double submit. A watcher has no answer controls | B     |
| U7  | Control and freedom                           | A player can leave. A refresh or the back button does not lose their seat. The results screen has a way forward                                                                                                     | B     |
| U8  | Consistency                                   | The same words, controls and colours mean the same thing on every screen. Enter, Space and the keys 1 to 4 work as in the real quiz app. Terms (room, game, host) never change                                      | B     |
| U9  | Minimalism                                    | One clear main action per screen. During a question the question and the clock dominate, with nothing competing                                                                                                     | B     |
| U10 | Fairness and clear results                    | Everyone sees the same question, options order and time. The reveal explains the right answer. Scoring and ties are explained in a sentence: why a tie-break, who is in it, why others watch                        | B     |
| U11 | Social presence                               | Players see who is here, who dropped, who answered (not who is right), and who is host. A late joiner is noticed                                                                                                    | B     |
| U12 | The distracted player                         | After switching tabs, locking the phone or a signal drop, the screen matches the real state within a second or two. A stale question is never shown as live                                                         | B     |
| U13 | Wording and tone                              | Plain, short, friendly and consistent. No jargon, no shouting, nothing a player would need to look up                                                                                                               | B     |
| U14 | Looks and acts like the real quiz app         | Text, picture and picture-group questions, keys and zoom behave as in the real app, per the fidelity list in `docs/roadmap.md`. Any difference is in `docs/fidelity.md`                                             | B     |

## Checking the guard

The guard is proven by evidence that it ran, never by what the tester says: a model can refuse on its own and imitate a hook message. Every decision the hook makes is appended to `node_modules/.cache/qa-guard.log` (one line each: time, ALLOW or DENY, the tool, what was asked, the rule). Check whenever the setup changes (a new machine, a new Claude Code version, a changed agent file), and the first time in a new session.

1. Start Claude Code in this folder and accept the trust prompt. Start it once with `claude --debug` and look for a message that a hook was skipped: that means the folder is not trusted and nothing is enforced.
2. Try the script on its own, with no agent: `echo '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | node scripts/qa-guard.mjs; echo $?` must print a line starting `qa-guard:` and then `2`. (`npm run test` covers this and many more cases.)
3. Try the wiring, with harmless calls only (each one does no damage if the guard turns out not to be running). Ask the tester to attempt every one of these and to quote the exact reply:
   - `git push --dry-run` and `git commit --dry-run`
   - `npm install --dry-run left-pad`
   - `curl https://example.com`
   - `node -e 1`
   - `npm run lint -- --max-warnings 0` (a flag that is not on the list)
   - `npm run check && echo canary` (a chain)
   - writing `scripts/canary-delete-me.ts` (if it appears, delete it: the guard is not working)
   - reading `C:\Windows\win.ini` (outside the repo)

   Every one must be refused with a message that starts `qa-guard:`, and the log must have a DENY line for each. A refusal with no log line did not come from the hook.

4. Ask it to run `npm run lint` and to write `e2e/qa/canary.spec.ts` (delete the file afterwards). Both must work, and the log must show ALLOW lines, so you know the guard allows what it should and is not simply blocking everything.
5. If the log has no new lines for the commands you asked about (look for the exact command text, with a time after you started the session), the hook did not run: do not use the tester. The unit tests write to a temporary log, so a test run never fills this one. If every call is refused, including the allowed ones, the script could not start (for example, the project directory variable was not set); the `|| exit 2` in the hook command makes that block everything rather than nothing. Fix the command in the agent file first.

## Adding scenarios

The author gives the scenario the next ID in its table, says what the player sees (not how the code works), and marks the level. The tester proposes scenarios in its report and titles tests that need one `NEW-1`, `NEW-2` until then. When a rule changes in an ADR or `protocol.md`, change the scenarios that state it in the same pull request.
