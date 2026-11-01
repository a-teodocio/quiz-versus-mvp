# 9. Player interface rules for the core game: shortcut keys and the time warning

Status: accepted (2026-11-01)

## Context

Two questions about how the core game behaves for every player were open after the first accessibility review (CQ-1 and CQ-2 in [parked-product-questions.md](../parked-product-questions.md)). The real quiz app answers a question with the keys 1 to 4 whatever has focus. WCAG 2.2 criterion 2.1.4 (level A) asks that a shortcut made of a single character can be turned off, remapped, or active only while its control has focus. No requirement said whether or when to warn that a question is about to close. The owner ruled on both on 2026-11-01: the shortcuts can be switched off and are active only on focus, not remappable; the player is warned in the last 10 seconds. The details below are the author's reading of those rulings, written as decisions. A different reading is a change, and a change supersedes this ADR with a new one.

## Decision

**Shortcut keys.**

- The keys 1 to 4 **answer** the question: a digit picks that option and submits it, as a click does, and a second answer is refused as for any other (one answer per question).
- When a question opens, **focus moves into the question area**, so the digits work at once. They work **only while keyboard focus is inside the question area**: the question text, the picture and its zoom control, and the options, which sit together in one labelled region. The rest of the page is outside it, including the switch below, the header and the Next control. In a typed-answer field a digit is just a digit.
- Only a plain digit counts, from the top row or the numpad. A digit with Ctrl, Alt or Meta held does nothing (those are browser shortcuts), a held key does not repeat the answer, and a key pressed during text composition is ignored. A player who is watching a tie-break has no options, so a digit does nothing. A digit is also ignored unless a question is open and the player may answer (not in the lobby, at a reveal or at the results), so it never sends an answer that would be refused.
- A player can **switch the shortcuts off**. The control is a switch (role `switch`, or a checkbox) with an accessible name and a state (`aria-checked`), reachable by keyboard and outside the question area. The choice is remembered on that device: set it, reload, and it is as it was.
- The shortcuts are **not remappable**.
- Enter and Space continue to the next question when the Next control is shown, as in the real app, except when focus is on another control that uses those keys (a button, a link, the switch, a menu, a text field, a select), which keeps its own behaviour: Enter on a focused button activates that button, not Next. The real page is wider: its page-wide handler advances on Enter or Space from any focus except its theme menu, open dialogs and zoom view, and the typed-answer field. The narrower rule is a small deliberate difference, recorded in `fidelity.md`. 2.1.4 covers keys that type a letter, number, punctuation or symbol, so Enter and Space do not need the same rules.
- The owner's choice of a switch and of focus-only goes further than 2.1.4 asks: either alone satisfies it. If the reading of "the question area" is ever narrowed or widened, conformance is not at risk.

**Warning before a question closes.**

- The question's **whole limit** is `room.settings.secondsPerQuestion` (set once the game starts, so always present during a question; a tie-break question uses the same limit, as core opens every question with it). The **time left** is the `durationMs` of the `question` message counted from the moment it arrives. For a player who sees the question when it opens the two are equal; for a late joiner, or after a refresh or a resume, `durationMs` is only the time left, so the limit must never be read from it.
- When 10 seconds remain, a visible message with the fixed text "Less than 10 seconds left" appears next to the clock, and it stays until the question closes. The text does not count down (the clock shows the number), and it does not rely on colour alone. It sits in a polite live region, so it is announced **once per question per page load** when it appears: a refresh re-announces it, a reconnect without a reload does not, and a tab that was hidden when the mark passed shows it and announces it once on return. The clock itself is never announced every second.
- A player who arrives with 10 seconds or less left sees the message at once. If the whole limit is **10 seconds or less** (the minimum is 5), there is no separate warning: the clock already is one.
- Every player sees it within one second of the others (the time left counts from receipt, so the absolute moments differ by network delay).
- The warning is worked out on the client, so the protocol does not change.

## Consequences

- The web client (`feat/web-fork`, `feat/web-versus`) implements both. Scenarios A7 and A14 in [qa-scenarios.md](../qa-scenarios.md) check them, and the tester reports a failure as a finding (A14 is WCAG 2.1.4, level A). Tests that need to pass the 10-second mark use the framework's fake clock (for Playwright, `page.clock`) or a short fixed limit, never a real wait.
- The one difference from the real app: its digit keys are active everywhere. It is recorded in [fidelity.md](../fidelity.md) for the port, together with the wider exception list for Enter and Space. The warning is new and has no counterpart there.
- `parked-product-questions.md` moves CQ-1 and CQ-2 to "Decided" with a link here. A suggestion that follows from the short-limit rule (a screen-reader player may be told nothing about a limit of 10 seconds or less) is parked there as PQ-5.
