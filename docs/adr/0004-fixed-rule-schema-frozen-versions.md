# 0004. A fixed 21-field rule schema; approved versions are frozen and hashed

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `03a8703`; `src/domain/rules/schema.ts`, `src/server/actions/rules.ts`

## Context

The engine can only act on what it has a type for, and an extraction can only be scored against an answer key if both have the same shape. A contract's rules must also not change underneath payments that were planned from them.

## Decision

A subcontract compiles to a fixed set of 21 fields (`RULE_FIELDS`): parties, governing state, payment timing, retainage, waiver requirements, offsets and stored materials. Five are required for the engine to run (`REQUIRED_FIELDS`).

A rule set row holds the extracted fields, the per-field verification and review annotations, the statutory overlay and anomaly acknowledgements as JSON. While it is in review a reviewer may accept or override fields. On approval it is stamped with `approved_hash` (SHA-256 of the effective values and overlay) and can no longer be changed: `resolveField` and `acknowledgeAnomaly` refuse. Reading the contract again creates the next version; approving it marks the previous one `superseded`. `contracts.active_rule_set_id` points at the approved version.

## Consequences

- Extraction is measurable field by field (588 fields in the committed run).
- A release's `basis` can name the rule paths it used, and they resolve to a fixed version.
- Terms outside the 21 fields are not represented. Per `docs/DECISIONS.md`, 6 of the 21 fields move money in the engine; the rest inform review, waivers and setoff rights.
- Free-text fields such as `retainage.release_condition` are not machine-evaluated. Retention is released on a person's certification (see ADR 0012).
- Before approval a rule set's JSON is edited in place; the history of those edits is in `events`, not in the row.
