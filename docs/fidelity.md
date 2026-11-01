# Fidelity log

The mock must behave like the real quiz app. Each row records a deliberate difference, so a later port knows what was not exercised.

| Area    | Real app                                | Mock                                     | Why         | Port risk                 |
| ------- | --------------------------------------- | ---------------------------------------- | ----------- | ------------------------- |
| Content | Real course notes and instructor images | Fake notes, generated placeholder images | Public repo | None: schema is identical |

Add a row every time a simplification is made. Remove a row when the gap is closed.
