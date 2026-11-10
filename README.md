# Groundwork

**The contract already says when the sub gets paid. Groundwork makes the money obey it.**

Groundwork compiles construction subcontracts into executable payment rules and pays subcontractors the moment the owner's money lands. Claude reads each subcontract once and proposes typed rules with the verbatim clause behind every value. Our code verifies every quote against the PDF, applies the governing state's law, and sends anything doubtful to a human. The controller approves once. From then on a deterministic, replayable engine splits every owner payment, withholds retainage, sets off backcharges, generates the lien waiver, gates release on the signature, starts the legal clock, pays the next tier down, and writes an append-only ledger. Subs and their suppliers get a free "where's my money" view.

Built for the BBS × Ramp Hackathon ("Automate the Old Way"), technical track, by team Groundwork.

## The old way

In US commercial construction the owner pays the general contractor (GC), the GC pays the subcontractors, and the subs pay their suppliers. The owner's money reaches the GC in a median of 17 days. The sub who did the work waits a median of 50 (Built, August 2026 payment ledger). The missing 33 days are someone in the GC's office re-reading a subcontract, doing retainage math in a spreadsheet, chasing a lien waiver by email, and cutting a paper check. GCs spend about 65 hours a month on it (Rabbet, 2025). 92% of subs fronted payroll last year waiting on it (Siteline, 2026).

Existing tools either move money with hand-configured rules and a human clicking "pay", or read contracts and stop at a risk flag. Nobody closes the loop from *subcontract* to *typed rule* to *automatic execution when the owner pays*, and nobody shows a sub where its money is across companies. Ramp runs accounts payable inside one company; Groundwork is the decision layer between companies.

## How it works

| Step | Claude Opus 5.5 | Deterministic code | Human |
|---|---|---|---|
| **Compile** a subcontract | Proposes a typed rule set: payment timing, retainage, release conditions, waiver requirements, offsets. Every value carries a verbatim quote, page and confidence. | Verifies each quote against the PDF text (exact / fuzzy / not found), applies the governing state's statutory overlay, escalates anything unverified, low-confidence, missing or conflicting with statute. | Reviews flagged fields, accepts or overrides with a note, approves once. The version is frozen with a hash. |
| **Intake** a pay application | Phrases the failing checks for the reviewer, citing the rule. | Eight checks: line math, over-billing against the schedule of values, billing history, retainage at the contract rate, net-due arithmetic, sequence, contract sum, rules approved. One-click "correct to rule". | Approves, corrects, or requests changes. |
| **Execute** on owner payment | — | Pure allocator: pro-rata by remaining gross with largest-remainder rounding, retainage at the approved rate (clamped by statute), backcharges, certified retention releases, and the next hop down to suppliers and sub-subcontractors. Deadlines from the governing state's prompt-payment law. Drafts the conditional waiver; release is gated on the signed waiver whose amount matches (and, where the contract requires it, on the lower tier's waivers); payment goes through a pluggable rail; settlement issues the unconditional counterpart. Ledger, events, idempotency. | Sub signs the waiver (typed e-signature, hashed). Lower-tier claimants sign from a link, with no account. |
| **Explain** a payment | Narrates the engine's basis for the sub in plain English. | Supplies the facts: amounts, clauses, statutes. | — |

The model never touches arithmetic, never decides enforceability, and never moves money. If the model is down, compiling pauses; execution never does.

## After the rules are approved

Four things change a contract's money after its rules are frozen. Each is a recorded human decision the engine reads on the next funding event.

- **Change orders.** A sub requests, the controller decides. Approval moves the contract sum and the schedule of values together; a deductive order cannot cut a line below what was billed.
- **Backcharges.** Allowed only when the approved rules contain a setoff clause. Recovered from the contractor's next release to that sub, carried across releases until fully recovered, and shown in the release's math.
- **Retention release.** The controller certifies that the contract's release condition has been met for a share of the retainage held. The engine pays it out when the owner's retention arrives, on the shorter of the contract's period and the statutory pass-through.
- **The lower tier.** A sub adds its suppliers and sub-subcontractors and declares what it owes them on its pay application. When the owner pays, the same planner runs one hop down in the same transaction. If the subcontract requires lower-tier waivers, the sub's release waits for them; a lower-tier payment goes out only after its payer has been paid.

## Every state

`src/domain/statutes` holds one researched record for each of the 50 states and DC: the deadline to pay a subcontractor, the retainage cap, the retainage pass-through deadline, whether pay-if-paid is enforceable, and lien waiver form rules. Every rule carries its citation, a source URL and a confidence level. 33 jurisdictions set a prompt-payment deadline, 23 cap or prohibit retainage, 18 void or limit pay-if-paid, and 9 prescribe statutory waiver forms.

The engine applies what it can evaluate: deadlines the contract cannot lengthen (Texas), business-day periods (Kansas, Kentucky), caps that depend on the contract date or the prime contract's size (California, New York), caps that step down at 50% completion (Illinois, North Dakota), and states that prohibit retainage (New Mexico). A rule the research could not confirm is null, and the engine falls back to the contract's terms and says so. California's four statutory waiver forms are reproduced; other states get a general-form waiver that states on its face when the state prescribes its own. Browse it at `/statutes`.

## What the demo shows

Project **Bayview Clinic TI** (Oakland). Owner Bayview Health, GC Meridian Builders, three subs with synthetic subcontracts rendered from our own text:

| Sub | Sum | Contract says | What the compiler does with it |
|---|---|---|---|
| Ironline Steel | $400,000 | Pay-when-paid 7 days, 10% retention, half released at Substantial Completion | Clean compile, every quote verified |
| Pacific Electric | $300,000 | Pay-when-paid 7 days, 5% retention released "upon completion of the punch list to Contractor's satisfaction" | Escalates the subjective trigger; the controller overrides it with an operational one |
| Summit Drywall | $200,000 | **Pay-if-paid**, 10% retention, backcharges on 5 business days' notice | Flags pay-if-paid as unenforceable in California (Clarke v. Safeco); the engine applies pay-when-paid with the 7-day clock |

Pay App #1 ($200,000 across the three) is funded in full by Owner Payment #1. Summit's Pay App #2 bills retainage at 5% instead of its contract's 10%; the checks catch the $2,500 overstatement. Owner Payment #2 ($125,000 of $250,000 outstanding) funds everyone 50% pro-rata, drafts three waivers and starts three 7-day clocks.

The `closeout` checkpoint continues: a $20,000 change order on Ironline, a $1,500 backcharge against Summit, and Bay Rebar Supply added under Ironline. Owner Payment #3 ($175,000) sets off the backcharge, plans the supplier's $12,000 in the same transaction, and leaves Ironline's release waiting on its supplier's waiver. Half of Ironline's retainage is certified and waits for the owner's retention.

## Run it

```bash
pnpm install
cp .env.example .env.local        # optional: add ANTHROPIC_API_KEY to compile with the model
pnpm render:contracts             # seed/contracts/*.md → *.pdf
pnpm dev                          # http://localhost:3000, embedded Postgres, no Docker
pnpm demo:reset --to=closeout     # fresh | compiled | paid1 | intake | paid2 | closeout
```

Without `DATABASE_URL` the app runs on embedded PGlite (WASM Postgres) at `./.data/pglite`, migrating itself on first start. With `DATABASE_URL` (Neon) it runs the same migrations in `drizzle/`. Without `ANTHROPIC_API_KEY`, "Compile with Claude" loads the cached extraction for the three demo contracts so every screen still works; with a key it reads the PDF with `claude-opus-5-5` and structured outputs.

Sign in as a persona: the GC controller (Priya) compiles, reviews and records owner payments; each sub (Rosa, Tom, Jamal) submits pay apps, signs waivers and sees where the money is; the owner (Dana) sees where the money went. The demo panel at `/demo` resets checkpoints, settles payments at the simulated bank, and lists the signing links Groundwork would email to lower-tier claimants.

Where to look:

| Page | What it is |
|---|---|
| `/` | Landing page: the problem, one project's money in motion, the eval, the state map |
| `/gc/projects/:id` | The working board: every owner payment split by the rules, with clocks |
| `/gc/projects/:id/live` | The same project as pictures: money flow, clocks, contract bars, balances, timeline |
| `/gc/contracts/:id` | Compile review, change orders, retainage, backcharges, lower tier |
| `/sub` | "Where's my money" |
| `/w/:token` | A supplier's whole experience: see the payment, read the waiver, sign |
| `/statutes` | Payment law in 51 jurisdictions, with sources |
| `/lab` | Every visual on live data, with theme and type switching |

## Verify it

```bash
pnpm test        # 107 tests
pnpm eval        # extraction eval against the answer keys (cached extractions; --fresh calls the model)
pnpm typecheck && pnpm lint
```

- **Golden cases** reproduce every number in the demo, split odd cents without creating or losing any, clamp retainage to statutory caps, honor or cap contract periods per state, and run the pay-if-paid conversion.
- **Replay** re-runs the planner over every funding event on both tiers from scratch and asserts it reproduces the stored releases, including after change orders.
- **Closeout flow** runs a backcharge, a change order, a supplier one hop down and a retention release through the real actions and checks the ledger reconciles.
- **Authorization** tests prove a sub reading another sub's contract gets nothing, and that a payer never receives its claimant's signing token.
- **Statute data** tests assert all 51 jurisdictions are present, no number lacks a citation, and California matches the rules the engine was built on.

### Extraction eval

28 subcontracts and 588 fields: the three demo contracts, 23 synthetic contracts generated from a spec (so the spec is the answer key; 18 are adversarial, with buried pay-if-paid clauses, riders that override the body, terms stated only in an exhibit), and two real public California forms labeled by hand. Run on `claude-opus-5-5`, November 10, 2026.

| Metric | Result |
|---|---|
| Value accuracy | 99.1% (583 of 588) |
| Quotes found verbatim in the PDF | 100% |
| Wrong values reaching the engine unflagged, production policy | 1 of 588 |

The question the eval answers is not only how often the model is right, but how often a wrong value reaches the payment engine without a person being asked to look. The same extractions are re-reviewed under four policies:

| Review policy | Silent errors | Fields a person must review |
|---|---|---|
| Trust the model | 5 | 0% |
| + model confidence | 3 | 5% |
| + quote verification | 3 | 5% |
| + statute and anomaly checks (production) | 1 | 34% |

The one silent error is a party name on a real form ("ELEVEN WESTERN BUILDERS INC., a California Corporation" against the labeled "Eleven Western Builders, Inc."), a field the engine does not use. The sample is small and mostly synthetic: it measures extraction fidelity, not the real-world distribution of contracts. Full results are in `evals/results/latest.md`.

## Architecture

One Next.js 16 app, TypeScript end to end.

```
src/domain/       pure: waterfall engine, pay-app checks, rule schema, statutes (51 jurisdictions), waiver forms
src/lib/ai/       Claude: extractRuleSet (structured output), flagPayApp, explainPayment
src/lib/verify/   quote verification against the PDF text
src/server/       actions (rules, pay apps, funding events, payments, adjustments, lower tier), review policy, rails, events + ledger
src/server/read/  read model: project summary, money flow graph, timeline, balance series, clocks
src/components/viz/  charts that take the read model's JSON as props
src/app/          gc/  sub/  owner/  w/ (token signing)  statutes/  lab/  api/v1/ (read API)
drizzle/          SQL migrations     seed/   contracts (md → pdf) + specs (answer keys)     evals/   harness, contracts, results
```

- **Database**: Postgres via Drizzle. Neon in production, embedded PGlite locally and in tests. Money is integer cents. `events`, `ledger_entries`, `owner_payment_events` and `webhook_inbox` are append-only; balances are sums.
- **Rules**: `rule_sets.rules` stores the extracted set, per-field verification and review annotations, and the statutory overlay. Approved versions are immutable; edits create v+1. The engine reads only approved versions.
- **Extraction**: the model fills a flat schema, one entry per rule field with the value as text, which code parses and validates. The structured-output API rejects the nullable domain schema as written (43 union-typed parameters against a limit of 16).
- **Engine**: `planWaterfall` is pure (no DB, no clock). `recordOwnerPayment` wraps it in one transaction with an idempotency key and plans the lower-tier hop recursively.
- **Rails**: `PaymentRail { createBill, hold?, release?, attach, getStatus, parseWebhook }`. Groundwork is the hold: a bill reaches the rail only after the matching conditional waiver is signed. `SimulatedRail` ships. `RampRail` targets Ramp's Bill Pay API: it creates an auto-approved bill against the sub's mapped vendor, scheduled for the statutory pay-by date, and settles on a `bills.paid` webhook (HMAC-verified, fail-closed) at `/api/webhooks/ramp`. A failed payment can be sent again; there is one payment row per release.
- **Read API**: `GET /api/v1` lists the endpoints. Pages and JSON share one read model, scoped to the caller's organization, so anything a chart shows can also be fetched.
- **Visuals**: theme sets and type sets are variable blocks in `src/app/globals.css`; motion is tuned in `src/lib/motion.ts`; `/lab` shows every chart with the file and endpoint behind it.
- **Auth**: persona sessions in a signed cookie; authorization is org-scoped query helpers on every read and write. Lower-tier claimants are authorized by an unguessable link.

## Honest notes

- Contracts are synthetic, written in our own words for fictional parties. Nothing here is legal advice.
- The statutory overlay was researched in November 2026 from state codes and court opinions, with secondary sources where the official text could not be read; each rule records which. It has not been reviewed by a lawyer. Conditions the engine does not evaluate (project type, bonding, residential exclusions) are shown to the reviewer rather than applied. Step-down retainage caps are approximated as a cap on later payments.
- Only California's statutory waiver text is reproduced. Other states that prescribe a form get a general-form draft that says so.
- The engine allocates on gross: it assumes the contractor holds the retainage it withholds. The owner's own retainage against the contractor is not modelled.
- Lower-tier agreements are typed in by the sub that pays them rather than compiled from a document, and cannot carry retainage yet. Signing links are listed in the demo panel instead of being emailed.
- The Ramp adapter has not been exercised against a sandbox. The simulated rail runs the identical state machine and webhook path.
- Not handled: joint checks, lender draws, public works, and holidays in business-day periods.

## Team

Anthony Lu (engineering), Kalan Karuppana, Vedant Chauhan.
