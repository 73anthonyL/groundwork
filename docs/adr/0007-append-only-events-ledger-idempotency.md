# 0007. Append-only events and ledger; funding events are idempotent and replayable

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `1c9a240` (schema), `0710def` (events, replay)

## Context

A payment system needs an audit trail that explains every balance, and it must not pay twice when a form is submitted twice or a webhook is delivered twice.

## Decision

- `events` records every domain event with actor, payload and a correlation id. `ledger_entries` records postings per account, each tied to an event. Both are written only through `emit` and `post` in `src/server/events.ts`, inside the caller's transaction. Balances are sums.
- `owner_payment_events` carries a unique `idempotency_key`. `recordOwnerPayment` looks for an existing event inside its transaction and returns the first result on a repeat. Without a caller-supplied key, an owner payment with the same project, bank reference and amount counts as the same payment.
- `webhook_inbox` is unique on rail and external event id; a duplicate delivery inserts nothing and is a no-op.
- Recording a payment, planning its releases, drafting waivers, posting the ledger and planning the lower-tier hop happen in one database transaction.
- `replayProject` re-runs the planner over every stored funding event and reports mismatches with stored releases.

## Consequences

- Tests assert that the ledger reconciles, that recording the same payment twice writes nothing, and that replay reproduces every release on both tiers.
- Corrections are new entries, not edits, so there are more rows.
- Append-only is a convention enforced by code review, not by the database. There are no triggers or revoked privileges.
- Known exceptions: a lower-tier funding event's `received_at` is updated when the upstream payment settles; `webhook_inbox` rows are marked processed after insert; a demo reset deletes the sample workspace's events and ledger entries.
- Working state (`releases.status`, `payments.status`, waivers, pay applications) is mutable. Its history is in `events`.
- Replay depends on `events.created_at` ordering to reconstruct which approvals and change orders preceded each funding event.
