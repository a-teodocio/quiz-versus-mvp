# Fidelity log

The mock must behave like the real quiz app. Each row records a deliberate difference, so a later port knows what was not exercised.

| Area                                 | Real app                                                                            | Mock                                                                                                                                                    | Why                                                             | Port risk                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Content                              | Real course notes and instructor images                                             | Fake notes, generated placeholder images                                                                                                                | Public repo                                                     | None: schema is identical                                      |
| Typed answers that need self-grading | Answers with digits, commas or slashes are typed, shown, then marked by the student | Versus asks for typed text only where the answer can be checked automatically; the rest stay multiple choice (as the real app's exam mode already does) | The server must grade every answer; it cannot trust a self-mark | Low: the check itself is the real app's rule, ported in `core` |

Add a row every time a simplification is made. Remove a row when the gap is closed.
