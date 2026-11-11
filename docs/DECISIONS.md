# Decisions

Why Groundwork is built the way it is. Each entry gives the choice, the reason, what was passed over, and where to change it. The last section lists the choices made during the overnight build of November 10, 2026 that are still open to overrule.

## The shape of the system

**AI proposes, code verifies, a person approves, a deterministic engine executes.**
The model reads contracts and phrases explanations. It never does arithmetic, never decides whether a clause is enforceable, and never moves money. Reason: a wrong payment is expensive and a wrong sentence is not, so the model works only where a mistake is cheap to catch. Passed over: an agent that reads the contract and pays in one step. Change it in: nowhere cheaply; this is the product.

**Every extracted value carries a verbatim quote, and code looks for that quote in the PDF.**
Reason: it turns "trust the model" into something a program can check. A value whose quote is not in the document is escalated to a person. Passed over: asking the model for a confidence score alone (the eval shows that catches 2 of 5 wrong values; the full policy catches 4). Where: `src/lib/verify/quote.ts`, `src/server/rules/review.ts`.

**The contract is a fixed form of 21 fields, not free text.**
Reason: the engine can only act on what it has a type for, and a fixed form can be scored against an answer key. Cost: only 6 of the 21 fields move money in the engine today; the rest inform review, waivers and setoff rights. Where: `src/domain/rules/schema.ts`.

**The model fills a flat list, one entry per field with the value as text; code parses it.**
Reason: the API refused the natural schema (too many nullable fields, then too large a grammar). The flat form passed and made parsing errors explicit. Where: `src/lib/ai/extractRuleSet.ts`.

**The law is data plus code, never the model.**
The prompt says "do not apply law". Each state's rules are a record with a citation; the engine applies them. Reason: legal rules must be the same every time and must be citable. Where: `src/domain/statutes`.

**The money math is a pure function.**
`planWaterfall(payment, candidates, retention)` takes plain values and returns a plan. No database, no clock, no randomness. Reason: it can be tested with plain inputs and replayed later to prove the stored numbers. Where: `src/domain/waterfall/engine.ts`.

**Money is integer cents; percentages are basis points; splits use largest-remainder rounding.**
Reason: floating point loses cents, and rounding each share on its own creates or destroys them. Largest-remainder hands leftover cents to the largest fractions so the parts always sum to the whole.

**Nothing is edited; everything is appended.**
Events, ledger entries, funding events and webhook receipts are only ever inserted. Balances are sums. Approved rule sets are frozen with a hash; a change makes version 2. Reason: an audit trail you can replay. Cost: more rows, and corrections are new entries rather than edits.

**Recording a payment is one transaction with an idempotency key.**
Reason: a payment recorded twice (a double click, a retried webhook) must not pay twice. The second attempt returns the first result.

**Groundwork is the hold; the bank rail only moves money.**
A bill reaches the rail only after the matching waiver is signed. Reason: Ramp's API has no "hold this bill" call, so the gate has to live here. The rail is an interface with a simulated and a Ramp implementation. Where: `src/server/rails`.

## The tools

| Tool | Why | Passed over |
|---|---|---|
| Next.js, one app | Pages and server logic deploy together; one language | Separate API server |
| Postgres + Drizzle | Transactions for money; queries are typed | Prisma (heavier), a document store (no transactions) |
| PGlite locally, Neon in production | The same SQL runs embedded with no setup and hosted with no changes | Docker Postgres (setup for judges), SQLite (different SQL) |
| Zod | One definition is the validator, the TypeScript type and the model's output format | Hand-written types plus JSON Schema |
| Vitest | Fast; the pure engine needs no mocks | Jest |
| `motion` | Springs and shared-layout animation for the charts | CSS-only animation (no layout continuity) |
| No chart library | Every chart is a few hundred lines of SVG we control | Recharts or d3 (heavier, harder to animate our way) |

## Made overnight on November 10, open to overrule

1. **Retention is released on certification, not on reading the contract's condition.** The contract's release condition is free text ("to Contractor's satisfaction"), so a person certifies it was met and the engine pays when the owner's retention arrives. Alternative: type the condition into structured milestones at compile time.
2. **The engine allocates on gross.** It assumes the contractor holds the retainage it withholds from subs. The owner's own retainage against the contractor is not modelled, so an owner retention payment is a trigger, not the source of the money. Alternative: model owner retainage properly; it changes every demo number.
3. **Backcharges are per contract and need a setoff clause.** No clause in the approved rules, no deduction. Unrecovered amounts carry to the contract's next release.
4. **The lower tier has no accounts.** Suppliers are typed in by the sub that pays them, their billing is declared on the sub's pay application, and they sign from an emailed link. Alternative: full accounts and compiled contracts one hop down, which the data model already supports (`parentContractId`).
5. **Lower-tier agreements cannot carry retainage yet.** There is no certification or final application one hop down to release it, so it is refused rather than held forever.
6. **The payer never sees its supplier's signing link.** Otherwise a sub could sign its own supplier's waiver and release its own payment. The demo panel's outbox used to stand in for email; that panel has since been removed, so a supplier's link is not shown anywhere in the app yet.
7. **All 51 jurisdictions are loaded from research, not from a lawyer.** Each rule records its source and confidence. Unconfirmed rules are null and the engine falls back to the contract. Conditions it cannot evaluate are shown to the reviewer, not applied.
8. **Step-down retainage caps are approximated** as a cap on payments after 50% of the contract is billed. Some statutes cap the total held instead.
9. **Only California's statutory waiver text is reproduced.** Other states get a general form that says when the state prescribes its own.
10. **Kansas uses its 5% default cap**, not the 10% ceiling the statute allows when specifically justified.
11. **Superseded.** Three themes and two type sets once shipped side by side on a `/lab` page. One theme ships now and `/lab` was removed; see `docs/DESIGN.md`.
12. **The landing page is at `/`** and signed-in users are no longer redirected past it.
13. **A second project in Texas** was added to show another state's law in the product. Its contract was generated and compiled by the model, and the compile is replayed from a cached copy.
14. **Eval artifacts are committed** (generated contracts, cached extractions, results) so the numbers can be re-scored without an API key.

## Where to change the look

- Colors, radii, shadows, fonts: the `:root` block in `src/app/globals.css`.
- Motion: `src/lib/motion.ts` is the only file that sets a spring or duration.
- Every chart takes plain JSON from `src/server/read/project.ts` (also served at `/api/v1`), so a new view needs no new queries.
