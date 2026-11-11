# 0003. The model fills a flat wire schema; code parses it into the typed rule set

- Status: Accepted
- Date: 2026-11-10
- Evidence: commit `c9ed9ba` ("fix live extraction schema")

## Context

The domain rule set (`ExtractedRuleSetSchema` in `src/domain/rules/schema.ts`) has 21 fields, each an object with a nullable value and nullable evidence. Sent to the structured-output API as written, it was rejected: 43 union-typed parameters against a limit of 16, and nesting 21 typed objects compiled to too large a grammar. This is recorded in the header of `src/lib/ai/extractRuleSet.ts`.

## Decision

The model fills `WireRuleSetSchema`: an array with one entry per field path, where the value is always a string (`"7"`, `"true"`, `"pay_when_paid"`, or the contract's words), plus `found`, `quote`, `page`, `confidence` and `rationale`. Nothing in it is nullable.

`fromWire` converts each entry to the typed, nullable domain shape. It throws when a number or boolean does not parse, treats a missing entry or `found: false` as not found, and keeps a value that arrived without a quote with `evidence: null` so the review policy escalates it. `StrictRuleSetSchema` then applies range checks the API cannot express.

## Consequences

- The schema is accepted by the API and adding a field does not add union types.
- Type errors in the model's output become explicit exceptions at one place instead of silent coercions. An empty string is never read as zero (`src/server/review-fixes.test.ts`).
- The model's output is no longer type-constrained per field by the API; `fromWire` and `StrictRuleSetSchema` carry that responsibility and are unit-tested (`src/lib/ai/extractRuleSet.test.ts`).
- The prompt has to describe the text encoding of each value. `PROMPT_VERSION` is stored on every rule set so a change is traceable.
