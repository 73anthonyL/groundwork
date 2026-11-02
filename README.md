# Groundwork

**The contract already says when the sub gets paid. Groundwork makes the money obey it.**

Groundwork compiles construction subcontracts into executable payment rules and pays subcontractors the moment the owner's money lands. Claude reads each subcontract once and proposes typed rules with the verbatim clause behind every value. Our code verifies every quote against the PDF, applies the statute, and sends anything doubtful to a human. The controller approves once. From then on a deterministic, replayable engine splits every owner payment, withholds retainage, generates the statutory lien waiver, gates release on the signature, starts the legal clock, and writes an append-only ledger. Subs get a free "where's my money" view.

Built for the BBS × Ramp Hackathon ("Automate the Old Way"), technical track, by team Groundwork.

## The old way

In US commercial construction the owner pays the general contractor (GC), the GC pays the subcontractors, and the subs pay their suppliers. The owner's money reaches the GC in a median of 17 days. The sub who did the work waits a median of 50 (Built, August 2026 payment ledger). The missing 33 days are someone in the GC's office re-reading a subcontract, doing retainage math in a spreadsheet, chasing a lien waiver by email, and cutting a paper check. GCs spend about 65 hours a month on it (Rabbet, 2025). 92% of subs fronted payroll last year waiting on it (Siteline, 2026).

Existing tools either move money with hand-configured rules and a human clicking "pay", or read contracts and stop at a risk flag. Nobody closes the loop from *subcontract* to *typed rule* to *automatic execution when the owner pays*, and nobody shows a sub where its money is across companies. Ramp runs accounts payable inside one company; Groundwork is the decision layer between companies.

## How it works

| Step | Claude Opus 5.5 | Deterministic code | Human |
|---|---|---|---|
| **Compile** a subcontract | Proposes a typed rule set: payment timing, retainage, release conditions, waiver requirements, offsets. Every value carries a verbatim quote, page and confidence. | Verifies each quote against the PDF text (exact / fuzzy / not found), applies the California statutory overlay, escalates anything unverified, low-confidence, missing or conflicting with statute. | Reviews flagged fields, accepts or overrides with a note, approves once. The version is frozen with a hash. |
| **Intake** a pay application | Phrases the failing checks for the reviewer, citing the rule. | Eight checks: line math, over-billing against the schedule of values, billing history, retainage at the contract rate, net-due arithmetic, sequence, contract sum, rules approved. One-click "correct to rule". | Approves, corrects, or requests changes. |
| **Execute** on owner payment | — | Pure allocator: pro-rata by remaining gross with largest-remainder rounding, retainage at the approved rate (clamped by statute if applicable), offsets, final-application retention release. Deadlines from Bus. & Prof. Code §7108.5 (7 days) and Civ. Code §8814 (10 days). Drafts the Civ. Code §8132/§8136 conditional waiver; release is gated on the signed waiver whose amount matches; payment goes through a pluggable rail; settlement issues the unconditional counterpart. Ledger, events, idempotency. | Sub signs the waiver (typed e-signature, hashed). |
| **Explain** a payment | Narrates the engine's basis for the sub in plain English. | Supplies the facts: amounts, clauses, statutes. | — |

The model never touches arithmetic, never decides enforceability, and never moves money. If the model is down, compiling pauses; execution never does.

## What the demo shows

Project **Bayview Clinic TI** (Oakland). Owner Bayview Health, GC Meridian Builders, three subs with synthetic subcontracts rendered from our own text:

| Sub | Sum | Contract says | What the compiler does with it |
|---|---|---|---|
| Ironline Steel | $400,000 | Pay-when-paid 7 days, 10% retention, half released at Substantial Completion | Clean compile, every quote verified |
| Pacific Electric | $300,000 | Pay-when-paid 7 days, 5% retention released "upon completion of the punch list to Contractor's satisfaction" | Escalates the subjective trigger; the controller overrides it with an operational one |
| Summit Drywall | $200,000 | **Pay-if-paid**, 10% retention, backcharges on 5 business days' notice | Flags pay-if-paid as unenforceable in California (Clarke v. Safeco); the engine applies pay-when-paid with the 7-day clock |

Pay App #1 ($200,000 across the three) is funded in full by Owner Payment #1. Summit's Pay App #2 bills retainage at 5% instead of its contract's 10%; the checks catch the $2,500 overstatement. Owner Payment #2 ($125,000 of $250,000 outstanding) funds everyone 50% pro-rata, drafts three waivers and starts three 7-day clocks.

## Run it

```bash
pnpm install
cp .env.example .env.local        # optional: add ANTHROPIC_API_KEY to compile with the model
pnpm render:contracts             # seed/contracts/*.md → *.pdf
pnpm dev                          # http://localhost:3000, embedded Postgres, no Docker
pnpm demo:reset --to=paid2        # fresh | compiled | paid1 | intake | paid2
```

Without `DATABASE_URL` the app runs on embedded PGlite (WASM Postgres) at `./.data/pglite`, migrating itself on first start. With `DATABASE_URL` (Neon) it runs the same migrations in `drizzle/`. Without `ANTHROPIC_API_KEY`, "Compile with Claude" loads the cached extraction for the three demo contracts so every screen still works; with a key it reads the PDF with `claude-opus-5-5` and structured outputs.

Sign in as a persona: the GC controller (Priya) compiles, reviews and records owner payments; each sub (Rosa, Tom, Jamal) submits pay apps, signs waivers and sees where the money is. The demo panel at `/demo` resets checkpoints and settles payments at the simulated bank.

## Verify it

```bash
pnpm test        # 42 tests: allocator golden cases, pay-app checks, quote verifier, authz, end-to-end flow + replay
pnpm eval        # extraction eval against the spec answer keys (uses cached results in CI)
pnpm typecheck && pnpm lint
```

- **Golden cases** reproduce every number in the demo, split odd cents without creating or losing any, clamp a 10% contract to the 5% statutory cap for 2026 contracts, honor a 10-day period agreed in writing over the 7-day default, and run the pay-if-paid conversion.
- **Replay** re-runs the planner over every owner payment from scratch and asserts it reproduces the stored releases.
- **Authorization** tests prove a sub reading another sub's contract gets nothing.
- **Eval**: every contract under `evals/` is generated from a spec, so the spec is the answer key; scores are value accuracy, quote-verified rate, and calibration (share of wrong fields the model marked low or medium confidence). The eval is synthetic and measures extraction fidelity, not real-world distribution.

## Architecture

One Next.js 16 app, TypeScript end to end.

```
src/domain/     pure: waterfall engine, pay-app checks, rule schema, statutes, waiver forms   (Vitest)
src/lib/ai/     Claude: extractRuleSet (structured output), flagPayApp, explainPayment
src/lib/verify/ quote verification against the PDF text
src/server/     actions (rules, pay apps, owner payments, waivers/payments), review policy, rails, events + ledger
src/app/        gc/ (board, compile review, pay-app review, releases, ledger)  sub/ (where's my money, pay apps, sign)  api/ (documents, extract, waivers, webhooks, demo)
drizzle/        SQL migrations     seed/   contracts (md → pdf) + specs (answer keys)     evals/   harness
```

- **Database**: Postgres via Drizzle. Neon in production, embedded PGlite locally and in tests. Money is integer cents. `events`, `ledger_entries`, `owner_payment_events` and `webhook_inbox` are append-only; balances are sums.
- **Rules**: `rule_sets.rules` stores the extracted set, per-field verification and review annotations, and the statutory overlay. Approved versions are immutable; edits create v+1. The engine reads only approved versions.
- **Engine**: `planWaterfall` is pure (no DB, no clock). `recordOwnerPayment` wraps it in one transaction with an idempotency key.
- **Rails**: `PaymentRail { createBill, hold, release, attach, getStatus, parseWebhook }`. `SimulatedRail` ships; `RampRail` maps the same calls onto Ramp's Bills API (`POST /bills` → hold → release, `bills.paid` webhook) and is wired but untested against a sandbox.
- **Auth**: persona sessions in a signed cookie; authorization is org-scoped query helpers on every read and write.

## Honest notes

- Contracts are synthetic, written in our own words for fictional parties. Nothing here is legal advice.
- The California overlay encodes Bus. & Prof. Code §7108.5, Civ. Code §§8811, 8814, and the four statutory waiver forms (§§8132–8138). Other states fall back to contract terms and say so.
- The Ramp adapter has not been exercised against a sandbox. The simulated rail runs the identical state machine and webhook path.

## Team

Anthony Lu (engineering), Kalan Karuppana, Vedant Chauhan.
