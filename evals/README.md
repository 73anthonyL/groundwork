# Extraction eval

Groundwork asks a model to read a subcontract PDF and propose 21 typed payment terms, each with a verbatim quote. Deterministic code then verifies every quote and decides which fields a person must review before the payment engine may use them.

This directory measures two things about that pipeline:

1. **Fidelity.** How often is a proposed value right?
2. **Containment.** When a value is wrong, how often does it reach the engine without anyone being asked to look? This is the number the product depends on, and the reason the eval re-reviews the same extractions under four review policies.

Every number here is reproducible from committed files, without an API key and without calling a model.

## Reproduce

```bash
pnpm eval:check     # re-score the committed extractions; fail unless they reproduce results/latest.json
pnpm eval:gate      # fail if results/latest.json is below thresholds.json
pnpm eval:report    # regenerate results/REPORT.md (add --check to fail when it is out of date)
pnpm test           # includes the unit tests for scoring, cache, gate and report
```

`pnpm eval --cache-only` prints the run summary and writes nothing when the scores match the record. None of these commands calls the model, and the three `eval:*` commands above do not load `.env.local`.

The two real forms are third-party PDFs that are not in the repository. Without them `eval:check` re-scores 26 of the 28 contracts and says which two it could not; `pnpm eval:fetch` downloads them and verifies their hashes (see [real/README.md](real/README.md)).

## Pipeline

```
build-specs.ts ──► specs/*.json ──► scripts/gen-contracts.tsx ──► contracts/*.{md,pdf,audit.json}
 (answer keys)     (key + brief)     (model drafts, model audits)

seed/specs + seed/contracts     hand-written demo contracts and keys
real/specs  + real/contracts    public forms, hand-labelled, fetched by fetch-real.ts

                    ┌──────────────── run.ts ────────────────┐
PDF ─► extractRuleSet (model) ─► cache/<slug>.json ─► score.ts ─► results/latest.{json,md}
        src/lib/ai/extractRuleSet.ts      │            │
                                          │            └─ annotate() from src/server/rules/review.ts
                                          └─ refused when prompt version, model or contract text differ

results/latest.json ─► gate.ts + thresholds.json ─► pass / fail
                    ─► report.ts ─► results/REPORT.md
```

### 1. Dataset construction

A **spec** is the answer key for one contract: the expected value of each of the 21 fields, with `null` meaning the contract does not state the term.

- **Synthetic, spec-first** (`specs/`, `contracts/`). `build-specs.ts` defines 24 cases as a base contract plus one deliberate twist and writes one spec each. `scripts/gen-contracts.tsx` gives the spec's values and a drafting brief to the model, which writes a contract around them; the spec was fixed before the contract existed, so it is the key. A second model call audits the draft against the brief (did the twist land where asked, is every term present, is nothing present that the key marks absent). A draft that fails is redrafted once. If it fails again the audit is saved as failed and the contract is never scored, so a bad draft cannot be counted as an extraction error.
  - 6 **clean** cases vary values and phrasing with nothing hidden.
  - 18 **adversarial** cases each target one way an extractor fails: the decisive clause buried in Definitions, a rider or amendment that overrides the body, a rate that appears only in an exhibit table, pay-if-paid without the words "condition precedent", pay-when-paid that uses the word "condition", distractor numbers from the prime contract, periods written only in words, cross-references, sections marked "Intentionally Omitted", and terms the contract never states (to catch values filled in from industry custom).
- **Demo** (`seed/`). The three hand-written contracts the product demo uses, with keys that include a verbatim anchor per field.
- **Real** (`real/`). Two California subcontract master forms published by general contractors, labelled by hand. The labelling rules, and which labels are a judgment call, are in [real/README.md](real/README.md).

### 2. Extraction

`run.ts` sends each PDF to `extractRuleSet`, the same function the product calls: one request, the PDF as a document block, structured output. The result is stored in `cache/<slug>.json` with the model id the API returned, the prompt version, token usage, latency and the time of the call.

### 3. Scoring

`score.ts` is pure: a spec, an extraction and the PDF's page texts in, one result per field out. It compares each value with the key and runs the product's own review code (`annotate`) to record whether each field would have been flagged.

### 4. Review-layer ablation

The same extractions are reviewed under four policies, each adding one layer, to show what each layer buys and what it costs in human attention.

| Layer | A field is flagged when |
|---|---|
| L0 Trust the model | never |
| L1 + model confidence | the model marked its evidence medium or low, or proposed a value with no quote |
| L2 + quote verification | L1, or the quote cannot be found in the PDF |
| L3 production | `annotate` returns anything other than `auto_accepted`: L2, plus a required field not found, an anomaly the model attached to the field, or a conflict with the governing state's statute |

L3 is the shipped policy, called exactly as the product calls it.

### 5. Caching and the committed record

- `cache/` holds one extraction per contract from the paid run. A record is used only if it was made with the current `PROMPT_VERSION` and model, and, for records that carry a text hash, only if the contract's wording is unchanged. Otherwise it is **stale**: a live run extracts again, a cache-only run fails rather than score an extraction the current prompt never made.
- `results/latest.json` is the committed record: per-field results plus summary metrics. The app reads it (`src/server/read/eval.ts`).
- `run.ts` rewrites `latest.json` and `latest.md` only when a **complete** run (every contract scored, no `--only`) produces **different** scores. Re-scoring the cache leaves the working tree clean, and a partial run cannot replace the record with a subset.
- `results/REPORT.md` is generated from `latest.json`, `thresholds.json` and the cache records. It contains no clock time of its own, so it changes only when its inputs do.

## Metrics

All defined in `score.ts`. The unit is the **field**: 21 per contract, every field scored on every contract, including fields the key says are absent.

| Metric | Definition |
|---|---|
| **Value accuracy** | correct fields / all fields. |
| **Correct** | Both absent, or both present and equal after lower-casing and replacing every run of non-alphanumerics with a space. Three free-text fields (`retainage.release_condition`, `retainage.reduction_trigger`, `parties.project`) are correct when at least 70% of the key's tokens appear in the model's value. For `timing.type`, `silent` and absent are the same answer. A value where the key has none, or none where the key has one, is wrong. |
| **Quote-verification rate** | Among fields the model supported with a quote: the share whose quote the verifier finds in the PDF text, exactly after normalisation or with similarity of at least 0.95. Undefined when no field has a quote. |
| **Silent error** (per layer) | A wrong field that layer does not flag. Reported as a count and as a share of all fields. |
| **Catch rate** (per layer) | 1 − silent errors / wrong fields. Undefined when nothing is wrong. |
| **Review burden** (per layer) | flagged fields / all fields, right or wrong. |
| **Calibration** | Among wrong fields, the share the model itself marked medium or low. Undefined when nothing is wrong. |
| **95% interval** | Percentile bootstrap over contracts, not fields (fields within a contract are not independent), 2,000 resamples, fixed seed. Resamples in which a conditional metric is undefined are dropped. |

Not measured: whether the model's anomaly list matches the key's, whether the cited page is right (the verifier corrects it), latency or cost as pass/fail criteria.

## Results

The committed run, from `results/latest.json`. [results/REPORT.md](results/REPORT.md) has the full breakdown by category, field, field group and model confidence, the confusion tables and every miss; `pnpm test` fails if the figures in this section stop matching the file.

- **28 contracts, 588 fields**: 18 adversarial, 5 clean, 3 demo, 2 real.
- **Value accuracy 99.1%** (583 of 588 fields), 95% interval 98.5–99.8%.
- **Quotes verified: 488 of 488.**
- **5 wrong fields**, of which the model had marked 2 as medium or low.
- **Silent errors: 5 → 3 → 3 → 1** under L0 → L1 → L2 → L3. Review burden: 0.0% → 5.3% → 5.3% → 34.2%.

| Category | Contracts | Correct | Silent, production |
|---|---|---|---|
| adversarial | 18 | 376/378 | 0 |
| clean | 5 | 105/105 | 0 |
| demo | 3 | 62/63 | 0 |
| real | 2 | 40/42 | 1 |

How to read this honestly:

- Five wrong fields is a small base. The catch-rate intervals are wide (L3: 33–100%) and no per-layer difference is statistically established.
- Quote verification caught nothing in this run because the model fabricated nothing: L1 and L2 are identical. The layer's value here is the guarantee, not a measured effect.
- L3's two extra catches came from anomalies the model attached to the field. In this run the production policy flags `timing.type` and `retainage.release_condition` on all 28 contracts, so a flag on those two fields carries no information about whether the value is right. The cost shows up as the 34% burden.

## Regression gate

`pnpm eval:gate` reads `results/latest.json`, recomputes every metric from the per-field results and compares with [`thresholds.json`](thresholds.json). It exits 1 with the failing checks and the offending fields.

| Check | Threshold | Committed run | Why this bound |
|---|---|---|---|
| Summary matches per-field results | exact | consistent | A hand-edited summary cannot pass. |
| Silent errors non-increasing L0..L3 | invariant | 5, 3, 3, 1 | Each layer must only add flags. |
| Contracts, fields scored | ≥ 28, ≥ 588 | 28, 588 | Every rate improves by scoring less. |
| Value accuracy | ≥ 99.0% | 99.15% | One more wrong field (582/588 = 98.98%) fails. |
| Quote-verification rate | ≥ 99.5% | 100% | Allows 2 of 488 quotes to fail on a renderer or normaliser change; 3 fail the gate. |
| Silent errors, production | ≤ 1 | 1 | The count today. Any new one fails. |
| Review burden, production | ≤ 36% | 34.2% | Stops silent errors being fixed by flagging everything; about 10 more flagged fields of headroom. |

The gate is a floor under the committed record, not a judgment of a new run. After a live run changes the results, tighten any bound the run improved on; loosen one only in a commit that explains why.

## Data card

**What it is.** 28 scored English-language US construction subcontracts as text PDFs, 21 labelled fields each.

| Source | Scored | How made | Key |
|---|---|---|---|
| Synthetic | 23 (of 24 drafted) | Drafted by `claude-opus-5-5` from a spec and brief, 3,055–5,962 words each, audited by a second call | The spec, fixed before drafting |
| Demo | 3 | Written by hand for the product demo | Hand-written, with a verbatim anchor per field |
| Real | 2 | Published by two general contractors; fetched, hash-pinned, not redistributed | Hand-labelled by one person |

**What it is not, and known biases.**

- **Mostly synthetic, and generated by the model family that is evaluated.** The drafter and the extractor are the same model. A model may find its own prose easier to read than a lawyer's, so synthetic accuracy is an upper bound on what to expect from real paper. The two real forms score lower (40/42) than the synthetic set (481/483), on a sample far too small to size the gap.
- **The audit is also that model.** A draft that contradicts its key in a way the auditor misses would be scored against a wrong key.
- **No scanned documents.** Every PDF has a text layer. Nothing here exercises OCR, handwriting, stamps, strike-throughs or filled-in blanks.
- **Real forms are blank masters.** Party names, sums and some rates are placeholders, labelled `null`. No executed contract with negotiated edits is included.
- **Narrow jurisdiction.** 26 keys are California law, one Nevada, one has no choice-of-law clause. Statutory flags at L3 are therefore tested almost only against California's overlay.
- **Class imbalance in the field that matters most.** `timing.type` keys: 24 pay-when-paid, 3 pay-if-paid, 1 silent, **0 fixed-days**. The one fixed-days case (`clean-fixed-30`) failed its audit because its brief contradicts itself, and is excluded; that class is untested.
- **Rare positives.** `retainage.cap_bps` has a value in 1 contract, `retainage.reduction_trigger` in 2, `offsets.joint_check` in 5. Accuracy on these fields is mostly accuracy at saying "absent".
- **One twist per contract.** No contract combines several adversarial features.
- **Single labeller, no agreement measure** on the real forms; 10 of their 42 labels are marked as judgment calls.
- **One run.** Each contract was extracted once. Run-to-run variance of the model is not measured.

**Excluded.** `clean-fixed-30`, by its failed audit. No contract was removed after seeing its extraction.

## Model card

| | |
|---|---|
| Model | `claude-opus-5-5`, as returned by the API on every cache record |
| Prompt | `extract-v2` (`PROMPT_VERSION` in `src/lib/ai/extractRuleSet.ts`); system prompt, field glossary and wire schema are in that file |
| Call | One request per contract, PDF as a document block, structured output, effort high, max 16,000 output tokens |
| Run | 28 calls on 2026-11-10; 753,584 input and 145,017 output tokens; median 40.1 s per contract |
| Output | 21 fields, each a value or "not found", with a verbatim quote, page, confidence and rationale; plus a list of anomalies |

**Intended use.** Proposing payment terms from a text-layer subcontract PDF to a reviewer who approves them before the payment engine uses them. Every value is checked against the PDF by code, and the review policy decides what a person must see.

**Not intended for.** Unreviewed use; scanned or image-only documents; contracts other than US construction subcontracts; deciding whether a clause is enforceable (the prompt forbids it; statute is applied by code).

**Failures observed in the committed run** (all five wrong fields):

| Contract | Field | What happened | Production policy |
|---|---|---|---|
| `ironline-steel` (demo) | `retainage.release_condition` | Reported the final-completion condition and omitted that half is released at Substantial Completion. High confidence, real quote. A partial reading of a two-stage clause. | Flagged through an anomaly the model attached to the field; this field is flagged on all 28 contracts |
| `adv-retention-cap` (adversarial) | `retainage.reduction_trigger` | Put the retention cap ("once total Retention held equals 5% of the Subcontract Sum") into the reduction trigger as well as, correctly, into `cap_bps`. The key says no reduction trigger. Medium confidence. | Flagged |
| `swinerton-ca` (real) | `timing.type` | Read the "special fund" clause as pay-if-paid and said in its rationale that the provisions are mixed; the key says pay-when-paid and marks that label a judgment call. Low confidence. | Flagged |
| `adv-reduction-trigger` (adversarial) | `retainage.reduction_trigger` | Same meaning as the key in the contract's words ("fifty percent (50%) complete ... five percent (5%)"); shares 9 of the key's 15 tokens, under the 70% bar. A scorer miss more than a model miss. | Flagged |
| `ewb-attachment-a` (real) | `parties.contractor` | "ELEVEN WESTERN BUILDERS INC., a California Corporation" against the key's "Eleven Western Builders, Inc.". Right party, trailing descriptor; party names are matched exactly. High confidence. | **Silent** |

**Limitations.**

- A confident misreading supported by a real quote passes L1 and L2 by construction (`score.test.ts` pins this as "the honest limit"). Only an anomaly or a statutory conflict can flag it.
- Three of the five misses are on free-text retainage fields; the model's wording of a condition is the least reliable thing it produces and the hardest to score.
- The model's confidence is informative but coarse: error rate 0.7% at high (3 of 457), 3.6% at medium (1 of 28), 33% at low (1 of 3).
- The one spurious value came from reporting a real clause under a second, wrong field. No value was invented without a clause, and no stated term was missed.

## Limitations of the eval itself

- **Two of the five misses are arguably scorer artefacts** (the last two rows above). Counting them as correct would give 585/588 and no silent errors. They are left as scored: the matcher is strict by design and the numbers are the committed record. Changing the matcher is a decision, not a fix.
- **Free-text matching is recall-only.** A value that contains the key's words plus a contradiction would be marked correct.
- **Extraction failures are not in the denominator.** A refusal, a truncated response or a value that fails range checks makes `run.ts` skip the contract and exit non-zero; it is not scored as 21 wrong fields. None occurred in the committed run.
- **The existing cache records carry no text hash**, so a change to a contract's wording is caught by `eval:check` (the scores stop reproducing) rather than by the cache. Records written from now on carry one.
- **`scoreContract` reviews under California law** unless the extraction names another state, as the product does for a California project.

## Files

| File | Role |
|---|---|
| `build-specs.ts` | Defines the 24 synthetic cases; writes `specs/` (`pnpm eval:specs`) |
| `fetch-real.ts` | Downloads and hash-checks the real forms (`pnpm eval:fetch`) |
| `dataset.ts` | Loads specs in a fixed order; rejects duplicate slugs |
| `cache.ts` | Reads and writes extraction records; decides when one is stale |
| `score.ts` | Field comparison, review layers, metrics, bootstrap |
| `run.ts` | The runner (`pnpm eval`, `pnpm eval:check`) |
| `run-file.ts` | Shape of `latest.json`; diff against the record; write policy |
| `gate.ts`, `thresholds.json` | The regression gate (`pnpm eval:gate`, via `scripts/eval-gate.ts`) |
| `report.ts` | Renders `results/REPORT.md` (`pnpm eval:report`, via `scripts/eval-report.ts`) |
| `fixtures.ts`, `*.test.ts` | Unit tests; no PDFs beyond the seed contract, no model |
| `specs/`, `contracts/`, `cache/`, `results/`, `real/` | Committed artefacts of the paid run. Do not edit by hand. |

## Making a new run

A live run calls the model once per contract and costs money. It needs `ANTHROPIC_API_KEY` in `.env.local`.

```bash
pnpm eval --fresh       # re-extract everything; rewrites cache/ and, if scores changed, results/latest.*
pnpm eval:report        # regenerate results/REPORT.md
pnpm eval:gate          # the new record must still clear the thresholds
```

Bump `PROMPT_VERSION` whenever the prompt, glossary or wire schema changes: that makes every cache record stale, so `pnpm eval:check` fails until the eval has been re-run against the new prompt. Commit `cache/`, `results/latest.json`, `results/latest.md` and `results/REPORT.md` together, and update the Results and Model card sections of this file from the new report.
