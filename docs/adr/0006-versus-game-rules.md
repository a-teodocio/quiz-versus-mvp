# 6. Game rules for versus mode

Status: accepted (2026-11-01)

## Context

The roadmap left four rules open: how points work, when a question closes, whether players may join late, and what happens on a tie. `core` implements them and the protocol has to be able to carry them. The user answered the four on 2026-11-01; the points below that go beyond the answers are interpretations, marked as such.

## Decision

**Points.** A correct answer is worth 1 point times a multiplier. The multiplier is one function in `core` (a `ScoringRule`) and is always 1 for now, so the game is plain "1 point per correct answer". A streak or speed multiplier can later replace it without touching the state machine. Points on the wire stay whole numbers: a rule that produces a fraction rounds it. A wrong answer or no answer earns 0.

**Closing a question.** A question closes as soon as every connected player has answered, or when its time runs out. _Interpretation:_ a player who has disconnected does not hold the room up.

**Late joiners.** A player may join in any phase until the results are shown. A player who joins while a question is open is sent that question with the time that is left (the protocol sends a duration, so this needs no new message), starts on 0 points and counts toward "everyone has answered" from then on. A player who joins during a reveal waits for the next question. After the results, joining is refused with `GAME_OVER`. The error `GAME_IN_PROGRESS` is removed because nothing refuses on that ground any more.

**Ties.** If two or more players are tied for first place when the regular questions end, the game plays tie-break questions:

- Only the tied players are asked; everyone else watches. The room snapshot says who and which round.
- Tie-break questions score like any other, so scores move apart as people answer. After each one, the players still tied at the top score stay in.
- It ends when one player leads, or after `MAX_TIEBREAK_ROUNDS` (5), or when the quiz has no spare question left. In the last two cases the players still tied are co-winners and share rank 1.
- _Interpretation:_ the tie-break is for first place only. A tie further down is not played off; equal scores share a rank (two players on 7 points are both 3rd, and the next player is 5th).
- A late joiner is never in a tie-break.

## Consequences

- The protocol changes: a question carries `progress` (`regular` or `tiebreak`) in place of `position` and `totalItems`, the room snapshot has `tiebreak`, and `GAME_IN_PROGRESS` becomes `GAME_OVER`. The version goes from 1 to 2.
- `QuizRepository` must be able to give spare questions beyond the chosen count, and say when there are none.
- `core` needs a tie-break phase inside its state machine; the wire phases stay `lobby`, `question`, `reveal` and `results`.
- A scoring multiplier is a small, local change later; a different tie rule is a larger one.
