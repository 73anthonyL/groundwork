# 0010. Evaluate extraction on spec-first synthetic contracts, with artifacts committed

- Status: Accepted
- Date: 2026-11-04
- Evidence: commit `c754f0c` (eval v2); first live run in `5bf84be` (2026-11-10)

## Context

Measuring extraction needs contracts with known answers. Real subcontracts are confidential, and hand-labelling is slow and itself error-prone. A generator that writes a contract and then labels it would inherit the labeller's mistakes.

## Decision

Each synthetic contract starts from a spec (`evals/specs/*.json`): the expected values for all 21 fields and a brief describing the twist (for example a pay-if-paid clause buried in definitions, or a rider that overrides the body). `scripts/gen-contracts.tsx` has the model draft a contract around the spec, using a prompt that shares no wording with the extraction prompt. A second, separate call audits the draft against the brief; a draft that fails twice is saved as failed and `evals/run.ts` skips it. The spec is the answer key.

The set also includes the three sample contracts (`seed/specs`) and two public California subcontract forms labelled by hand (`evals/real/specs`), whose PDFs are third-party documents and are fetched rather than committed.

`evals/score.ts` scores each field and re-reviews the same extractions under four policies (trust the model; plus confidence; plus quote verification; plus statute and anomaly checks) to count wrong values that would reach the engine unflagged. Generated contracts, cached extractions (`evals/cache`) and the latest results (`evals/results/latest.json`, `latest.md`) are committed.

## Consequences

- The numbers can be re-scored by anyone without an API key (`pnpm eval --cache-only`), and CI does so on pull requests and pushes to `main`.
- The answer key cannot be wrong in the way a label can, as long as the draft matches the spec; the audit step exists to check that. One generated contract (`clean-fixed-30`) failed its audit and is excluded.
- The sample is small (28 contracts) and mostly synthetic. It measures extraction fidelity on contracts shaped like the generator's, not the distribution of real contracts.
- The same model family drafts and extracts. The two real forms are the only check against that, and the one silent error in the run is on a real form.
- CI re-scores cached extractions; it does not detect a regression in the live model or prompt. That needs `pnpm eval --fresh` with a key.
- Committed caches go stale when the prompt changes. `PROMPT_VERSION` is recorded in each cache file.
