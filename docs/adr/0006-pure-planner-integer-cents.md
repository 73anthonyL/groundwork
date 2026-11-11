# 0006. The money math is a pure function over integer cents

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `03a8703`; `src/domain/waterfall/engine.ts`

## Context

Splitting a payment between several payees with percentages produces fractions of a cent. Floating-point amounts lose cents, and rounding each share independently creates or destroys them. The allocation also has to be testable without a database and reproducible later to prove stored numbers.

## Decision

`planWaterfall(payment, candidates, retention)` takes plain values and returns a plan. It reads no database, no clock and no random source. The server layer (`loadCandidates` in `src/server/actions/owner-payment.ts`) gathers its inputs and persists its output.

Money is integer cents everywhere (`bigint` columns read as numbers). Percentages are basis points. Pro-rata splits use largest-remainder rounding (`allocateProRata`): floor each share, then hand leftover cents to the largest fractional parts, so the parts always sum to the whole.

## Consequences

- The engine is covered by fast unit tests with no mocks, including odd-cent splits and a determinism test.
- `replayProject` can re-run the planner over stored funding events and compare.
- Amounts above 2^53 cents would lose precision in JavaScript numbers. That is far beyond any contract sum and is not guarded.
- Everything the planner needs must be passed in, which makes `loadCandidates` the place where the state of the world is reconstructed, including for replay.
