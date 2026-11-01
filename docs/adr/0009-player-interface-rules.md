# 9. Player interface rules for the core game: shortcut keys and the time warning

Status: accepted (2026-11-01)

## Context

Two questions about how the core game behaves for every player were open after the first accessibility review (CQ-1 and CQ-2 in [parked-product-questions.md](../parked-product-questions.md)). The real quiz app answers a question with the keys 1 to 4 whatever has focus. WCAG 2.2 criterion 2.1.4 (level A) asks that a shortcut made of a single character can be turned off, remapped, or active only while its control has focus. No requirement said whether or when to warn that a question is about to close. The owner ruled on both on 2026-11-01.

## Decision

**Shortcut keys.**

- The keys 1 to 4 pick an option **only while keyboard focus is inside the question area** (the question and its options). Elsewhere, and in a typed-answer field, a digit does nothing special.
- A player can **switch the shortcuts off**. The control is visible, reachable by keyboard, and remembered on that device.
- The shortcuts are **not remappable**.
- Enter and Space act on the focused control, as for any button, and work as in the real app.
- _Interpretation:_ "active only on focus" means focus anywhere in the question area, so a player who has just arrived at a question does not need to tab to an option first. If the owner wants the keys to work only when an option itself has focus, say so; it is a small change.

**Warning before a question closes.**

- When **10 seconds** remain, the clock shows a cue that does not rely on colour alone (a visible text or icon change, such as "10 seconds left") and the change is announced **once**, politely, to assistive technology. The clock is never announced every second.
- The warning is worked out on the client from the question's `durationMs` and the time left, so the protocol does not change, and every player gets it at the same moment of the question. A player who arrives with less than 10 seconds left sees the cue at once.
- _Interpretation:_ when a question's whole limit is 10 seconds or less (the minimum is 5), there is no separate warning: the clock already is one. If the owner wants a different rule for short limits, say so.

## Consequences

- The web client (`feat/web-fork`, `feat/web-versus`) implements both. Scenarios A7 and A14 in [qa-scenarios.md](../qa-scenarios.md) check them, and the tester reports a failure as a finding (A14 is WCAG 2.1.4, level A).
- A difference from the real app: the keys there are active everywhere. It is recorded in [fidelity.md](../fidelity.md) for the port.
- `parked-product-questions.md` moves CQ-1 and CQ-2 to "Decided" with a link here.
