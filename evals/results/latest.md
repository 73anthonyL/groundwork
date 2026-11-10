# Extraction eval

28 contracts · 588 fields · 4 categories. 95% bootstrap CIs over contracts in brackets.

## Headline

| Metric | Value |
|---|---|
| Value accuracy | 99.1% [98–100] |
| Quotes verified verbatim | 100.0% [100–100] |
| Wrong fields the model itself hedged (calibration) | 40.0% |
| Wrong fields reaching the engine unflagged (production policy) | 1 of 588 (0.2%) |

## Ablation: what each review layer buys

Same extractions, re-reviewed under four policies. *Caught* = share of wrong values a human is asked to look at. *Burden* = share of all fields a human must look at.

| Policy | Silent errors | Caught | Burden |
|---|---|---|---|
| L0 Trust the model | 5 (0.9%) | 0.0% [0–0] | 0.0% |
| L1 + model confidence | 3 (0.5%) | 40.0% [0–100] | 5.3% |
| L2 + quote verification | 3 (0.5%) | 40.0% [0–100] | 5.3% |
| L3 + statute & anomalies (production) | 1 (0.2%) | 80.0% [33–100] | 34.2% |

## By category

| Category | Contracts | Accuracy | Quotes verified | Silent (prod) | Burden (prod) |
|---|---|---|---|---|---|
| adversarial | 18 | 99.5% | 100.0% | 0 | 32.5% |
| clean | 5 | 100.0% | 100.0% | 0 | 26.7% |
| demo | 3 | 98.4% | 100.0% | 0 | 41.3% |
| real | 2 | 95.2% | 100.0% | 1 | 57.1% |

## Per contract

| Contract | Category | Accuracy | Silent (prod) | Model | Time |
|---|---|---|---|---|---|
| ironline-steel | demo | 20/21 | 0 | claude-opus-5-5 (cached) | 49.4s |
| pacific-electric | demo | 21/21 | 0 | claude-opus-5-5 | 59.1s |
| summit-drywall | demo | 21/21 | 0 | claude-opus-5-5 | 49.0s |
| adv-amendment-changes-days | adversarial | 21/21 | 0 | claude-opus-5-5 | 38.9s |
| adv-cross-reference-days | adversarial | 21/21 | 0 | claude-opus-5-5 | 41.3s |
| adv-days-in-words-only | adversarial | 21/21 | 0 | claude-opus-5-5 | 40.8s |
| adv-distractor-prime-retention | adversarial | 21/21 | 0 | claude-opus-5-5 | 34.7s |
| adv-long-boilerplate | adversarial | 21/21 | 0 | claude-opus-5-5 | 50.1s |
| adv-no-backcharge | adversarial | 21/21 | 0 | claude-opus-5-5 | 38.3s |
| adv-pif-buried-in-definitions | adversarial | 21/21 | 0 | claude-opus-5-5 | 35.1s |
| adv-pif-without-magic-words | adversarial | 21/21 | 0 | claude-opus-5-5 | 38.9s |
| adv-pwp-looks-like-pif | adversarial | 21/21 | 0 | claude-opus-5-5 | 35.1s |
| adv-reduction-trigger | adversarial | 20/21 | 0 | claude-opus-5-5 | 41.5s |
| adv-retention-cap | adversarial | 20/21 | 0 | claude-opus-5-5 | 46.5s |
| adv-retention-intentionally-omitted | adversarial | 21/21 | 0 | claude-opus-5-5 | 32.9s |
| adv-retention-only-in-exhibit | adversarial | 21/21 | 0 | claude-opus-5-5 | 40.5s |
| adv-rider-overrides-retention | adversarial | 21/21 | 0 | claude-opus-5-5 | 41.3s |
| adv-silent-timing | adversarial | 21/21 | 0 | claude-opus-5-5 | 35.3s |
| adv-silent-waivers | adversarial | 21/21 | 0 | claude-opus-5-5 | 38.6s |
| adv-stored-materials-conditional | adversarial | 21/21 | 0 | claude-opus-5-5 | 41.6s |
| adv-subjective-release | adversarial | 21/21 | 0 | claude-opus-5-5 | 37.2s |
| clean-joint-check | clean | 21/21 | 0 | claude-opus-5-5 | 47.1s |
| clean-nevada-law | clean | 21/21 | 0 | claude-opus-5-5 | 39.0s |
| clean-no-lower-tier | clean | 21/21 | 0 | claude-opus-5-5 | 39.6s |
| clean-pwp-10-ret10 | clean | 21/21 | 0 | claude-opus-5-5 | 37.7s |
| clean-pwp-7-ret5 | clean | 21/21 | 0 | claude-opus-5-5 | 34.8s |
| ewb-attachment-a | real | 20/21 | 1 | claude-opus-5-5 | 48.6s |
| swinerton-ca | real | 20/21 | 0 | claude-opus-5-5 | 57.2s |

## Every miss

| Contract | Field | Expected | Got | Model confidence | Production policy |
|---|---|---|---|---|---|
| ironline-steel | `retainage.release_condition` | "one-half at Substantial Completion of the Subcontract Work; balance at Final Completion and Contractor's receipt of final retention from Owner" | "Final Completion of the Subcontract Work, acceptance by Owner, and delivery of the closeout documents required by Article 7" | high | flagged |
| adv-reduction-trigger | `retainage.reduction_trigger` | "Reduces to 5% once the Subcontract Work is 50% complete as certified by the Architect" | "After the Architect certifies that the Subcontract Work is fifty percent (50%) complete, retention on further progress payments shall be five percent (5%)" | high | flagged |
| adv-retention-cap | `retainage.reduction_trigger` | null | "once the total Retention held equals five percent (5%) of the Subcontract Sum" | medium | flagged |
| ewb-attachment-a | `parties.contractor` | "Eleven Western Builders, Inc." | "ELEVEN WESTERN BUILDERS INC., a California Corporation" | high | **silent** |
| swinerton-ca | `timing.type` | "pay_when_paid" | "pay_if_paid" | low | flagged |

Synthetic contracts are generated from their spec, so the spec is the answer key; they measure extraction fidelity, not real-world distribution. Real forms are hand-labeled (see evals/real/README.md).
