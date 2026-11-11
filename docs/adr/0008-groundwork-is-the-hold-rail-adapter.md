# 0008. Groundwork holds the payment; the rail is an adapter with a simulated implementation

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `0710def`; revised in `51423c0` (2026-11-04) against Ramp's documented API

## Context

A release must not be paid until its conditional lien waiver is signed. The intended production rail, Ramp's Bill Pay API, creates bills that are auto-approved and exposes no call to hold or approve a bill (recorded in `src/server/rails/ramp.ts`). The gate therefore cannot live on the rail. Separately, the project has no bank credentials and must be demonstrable and testable without moving money.

## Decision

`PaymentRail` in `src/server/rails/types.ts` defines `createBill`, optional `hold` and `release`, `attach`, `getStatus` and `parseWebhook`. Groundwork decides when a bill may exist: `advanceRelease` calls the rail only after the waiver is signed for the matching amount and the lower-tier gates clear. The bill's invoice number is the release id.

Two implementations exist. `SimulatedRail` is in-process and stateless; settlement is a synthetic `bill.paid` event passed to the same `handleRailWebhook` a real webhook reaches. `RampRail` targets Ramp's Bill Pay API and verifies webhook signatures with HMAC-SHA256, rejecting everything when no secret is configured. `getRail()` selects Ramp only when `PAYMENT_RAIL=ramp` and `RAMP_CLIENT_ID` is set.

## Consequences

- No real money moves by default. The whole state machine, including settlement and failure, runs in tests.
- A different rail is one new class.
- The Ramp adapter has never been run against Ramp's sandbox. Only its request body and signature verification are unit-tested (`src/server/rails/ramp.test.ts`).
- The rail call is outside the database transaction. A crash between the call and the status update leaves a payment row behind without reconciliation. One payment row per release, reused on retry, limits the damage to a stuck row rather than a second payment.
- Ramp reports no `bills.failed` event, so a failure on that rail would have to be detected by polling `getStatus`, which nothing does today.
