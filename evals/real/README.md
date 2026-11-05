# Real-contract answer keys

Two California subcontract master forms, published by the general contractors on their own websites. These are answer keys for the extraction eval (`evals/run.ts` loads `evals/real/specs/*.json` and reads PDFs from `evals/real/contracts/`).

**The PDFs are third-party documents and are not redistributed.** They are fetched into `evals/real/contracts/` (gitignored), and the `sha256` in each spec pins the exact bytes these labels were made against. If a download hashes differently, the publisher has changed the form and the labels need re-checking.

Retrieved: 2026-11-04.

| Spec | Source | sha256 |
|---|---|---|
| `swinerton-ca` → `swinerton-ca.pdf` (21 pp) | https://www.swinerton.com/Subcontractors_Docs/California%20Subcontract%20Agreement.pdf | `098fe3d086135bc1accffa29acab5a25c0187395a5a2a0ab5a68c4b91c8999fe` |
| `ewb-attachment-a` → `ewb-attachment-a.pdf` (23 pp) | https://ewbinc.com/wp-content/uploads/2023/11/Subcontractor-Prequalification-Packet-Attachment-A-Subcontract-Agreement-California.pdf | `f51e1c85ebe3ee8b11fa9602ca3398abf0403cdc9011a7a0cb2f936c30be6f73` |

```sh
mkdir -p evals/real/contracts
curl -sSL -o evals/real/contracts/swinerton-ca.pdf "https://www.swinerton.com/Subcontractors_Docs/California%20Subcontract%20Agreement.pdf"
curl -sSL -o evals/real/contracts/ewb-attachment-a.pdf "https://ewbinc.com/wp-content/uploads/2023/11/Subcontractor-Prequalification-Packet-Attachment-A-Subcontract-Agreement-California.pdf"
shasum -a 256 evals/real/contracts/*.pdf
```

## Labeling rules

- These are blank master forms. A blank or placeholder ("Subcontractor Name", "____ %", "(Owner)") is **not** a value. It is labeled `null` with a `null` anchor.
- Nothing is inferred from industry norms.
- `pay_if_paid` only when owner payment is an express condition precedent to the obligation itself, or the sub assumes the risk of owner nonpayment. A clause that only delays payment, even for a long time, is `pay_when_paid`.
- Each anchor is a contiguous, verbatim phrase (8–40 words) from the text produced by `src/lib/pdf/text.ts`. All anchors were checked against that text with `normalizeForMatch`, and `ruleSetFromSpec` + `StrictRuleSetSchema` pass for both specs.

## Labels

"Sure" = the text states it directly. "Judgment" = a reading of the text a reasonable reviewer could dispute (reasons are in each spec's `notes`).

### `swinerton-ca` — Swinerton Builders, California Subcontract Agreement

| Field | Label | Confidence |
|---|---|---|
| parties.contractor | Swinerton Builders | sure |
| parties.subcontractor / owner / project | null (placeholders) | sure |
| governing_law_state | CA (§18(j)) | sure |
| timing.type | pay_when_paid | **judgment**: "special fund" language in §6(a), but §6(b) conditions precedent are "with respect to the time for payment"; owner insolvency defers but does not extinguish payment |
| timing.days | 7 | sure |
| timing.agreed_in_writing | true | sure |
| retainage.percent_bps | 1000 (10% printed in form) | sure |
| retainage.cap_bps | null | sure |
| retainage.reduction_trigger | null | sure |
| retainage.release_condition | Final acceptance by Architect and Owner and Contractor's receipt of final retention from Owner | sure |
| retainage.release_days | 10 | sure |
| waivers.conditional_before_progress | true (Contractor's conditional waiver form with every monthly billing) | sure |
| waivers.unconditional_after_payment | true | **judgment**: Contractor "reserves the right to require" it, if Contract Documents or Owner require |
| waivers.lower_tier_required | true | **judgment**: "reserves the right to require ... releases from lower tier subcontractors" |
| waivers.statutory_form_required | null | **judgment**: requires Contractor's own form; never cites Civ. Code §§8132–8138 |
| offsets.joint_check | true | sure |
| offsets.backcharge_setoff | true | sure |
| offsets.withhold_defective | true | sure |
| stored_materials | true (on-site; off-site if approved) | sure |

### `ewb-attachment-a` — Eleven Western Builders, Attachment A Subcontract Agreement (California)

| Field | Label | Confidence |
|---|---|---|
| parties.contractor | Eleven Western Builders, Inc. | sure |
| parties.subcontractor / owner / project | null (blank) | sure |
| governing_law_state | null | **judgment**: no choice-of-law clause; arbitration applies law of the (blank) project state; CA only implied |
| timing.type | pay_when_paid | **judgment**: "reasonable time to exhaust all remedies" against Owner before obligated to pay; no express condition precedent or assumption of risk |
| timing.days | 10 | sure |
| timing.agreed_in_writing | true | sure |
| retainage.percent_bps | null | **judgment**: "a percentage equal to the percentage retained by Owner"; no number |
| retainage.cap_bps | null | sure |
| retainage.reduction_trigger | null | sure |
| retainage.release_condition | Completion of the Prime Contract and payment in full by Owner | **judgment**: no retention-release clause; §17(f) final payment is the only release |
| retainage.release_days | null | sure |
| waivers.conditional_before_progress | null (silent) | judgment |
| waivers.unconditional_after_payment | true ("lien releases for the previous payment") | **judgment**: "unconditional" used only for final payment |
| waivers.lower_tier_required | true | sure |
| waivers.statutory_form_required | null (silent) | sure |
| offsets.joint_check | true | sure |
| offsets.backcharge_setoff | true | sure |
| offsets.withhold_defective | true | sure |
| stored_materials | null (silent) | sure |
