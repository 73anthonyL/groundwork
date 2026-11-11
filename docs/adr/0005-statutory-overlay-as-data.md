# 0005. State payment law is data plus code, never the model

- Status: Accepted
- Date: 2026-11-01
- Evidence: California in commit `03a8703`; all 51 jurisdictions in `c9ed9ba` (2026-11-10)

## Context

Whether a pay-if-paid clause is enforceable, how long a contractor has to pay, and how much retainage may be withheld depend on the governing state. These answers must be the same every time and must be citable. A model asked to apply law would be neither.

## Decision

`src/domain/statutes/data/states.json` holds one researched record per jurisdiction (50 states and DC) covering five rules: prompt payment, retainage cap, retainage pass-through, pay-if-paid, lien waiver forms. Every rule carries a citation, a source URL and a confidence level. A rule the research could not confirm is `null`.

`overlayFor(state, executedOn, ctx)` in `src/domain/statutes/index.ts` turns a record into the overlay the review policy and the engine use. Structured readings of prose conditions (business-day states, caps that step down at 50%, caps that depend on prime contract size, Kansas's default) are small tables in code beside the data. The extraction prompt tells the model: do not apply law.

## Consequences

- A legal rule changes by editing one record, and the change is visible in a diff with its source.
- `src/domain/statutes/statutes.test.ts` asserts all 51 jurisdictions are present and that no number lacks a citation.
- Where the data is `null` the engine falls back to the contract's terms and records a warning, so gaps are visible rather than guessed.
- The data was researched in November 2026 and has not been reviewed by a lawyer. Nothing in the product is legal advice.
- Conditions the engine does not evaluate (project type, bonding, residential exclusions) are shown to the reviewer, not applied. Step-down caps are approximated as a cap on later payments.
- The data ages. There is no process in the repository for re-checking it.
