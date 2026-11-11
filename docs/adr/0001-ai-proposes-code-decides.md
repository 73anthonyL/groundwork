# 0001. AI proposes, code verifies, a person approves, a deterministic engine executes

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `03a8703` (domain core), `75babf6` (model calls)

## Context

A wrong payment is expensive and hard to reverse. A wrong sentence is cheap to catch. A language model reading a contract can be wrong in ways that look confident, and its output can differ between runs. The product moves money on the strength of what a contract says, so the question is where a model's output is allowed to have effect.

The alternative considered was an agent that reads the contract and pays in one step (recorded in `docs/DECISIONS.md`).

## Decision

The model is used in three places only, all in `src/lib/ai`:

- `extractRuleSet` proposes a typed rule set from a subcontract PDF.
- `flagPayApp` phrases the results of deterministic checks for a reviewer.
- `explainPayment` narrates the engine's basis for a release.

Everything that decides an amount, a deadline or a state transition is ordinary code: `src/domain/waterfall/engine.ts`, `src/domain/payapp/checks.ts`, `src/domain/statutes`, `src/server/actions`. The engine reads only rule sets a person has approved (`approveRuleSet` in `src/server/actions/rules.ts`). The domain modules do not import from `src/lib/ai`.

## Consequences

- The same inputs always produce the same payments, so the engine can be unit-tested with plain values and replayed (`src/server/engine/replay.ts`).
- If the model is unavailable, compiling a new contract fails and pay-app notes are skipped. Recording payments, signing waivers and settlement are unaffected.
- A person must review flagged fields before any contract becomes active. In the committed eval run the production review policy asks a person to look at 34% of fields.
- The model cannot correct a mistake downstream. A confident misreading that quotes a real clause is caught only by the review policy or the reviewer.
- This is the product's shape. Changing it is not a local edit.
