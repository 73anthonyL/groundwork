# Product

<!-- impeccable:product-schema 1 -->

> Written from the repository (README, docs/DECISIONS.md, docs/DESIGN.md, the code) on 2026-11-10 at the owner's instruction to answer from the codebase rather than by interview. Anything marked *(inferred)* has not been confirmed in conversation.

## Platform

web

## Users

- **Primary: the general contractor's controller** (the demo's Priya). Sits in the contractor's office with subcontracts, pay applications and the bank feed. Her job is to pay each subcontractor the right amount, on time, with the right paperwork, every time the owner pays.
- **Subcontractors' office staff** (controller, office manager, owner-operator). Often on a phone. Their job is to bill for the period, sign a lien waiver when a payment is ready, and know when their money arrives.
- **The building owner's representative.** Reads only: sees how far each of their payments has travelled down the chain.
- **Lower-tier parties** (a sub's supplier or sub-subcontractor). No account; they sign a waiver from a link.
- **Hackathon judges** (BBS × Ramp, Round 2 due 2026-11-10, final 2026-11-19) evaluating a working demo and the reasoning behind its design.

## Product Purpose

Groundwork reads a signed subcontract, turns its payment terms into rules a person approves once, and then, each time the owner pays the general contractor, splits that payment between subcontractors, holds retainage, drafts the lien waivers and starts each legal deadline. Success is a subcontractor being paid within the days the contract and the state allow, with nobody re-reading the contract or doing retainage arithmetic by hand.

## Positioning

The model reads; it never does the math. Claude proposes each payment term with the clause it came from, code checks every quote against the PDF and applies the governing state's payment law, a person approves, and a deterministic engine moves the money. The same inputs always produce the same payments, and every figure traces back to a clause or a statute.

## Operating Context

- Documents: subcontract PDFs (text, up to 4 MB), pay applications shaped like AIA G702/G703, conditional and unconditional lien waivers, owner payments identified by a bank reference.
- The chain: owner pays general contractor, who pays subcontractors, who may pay their own suppliers one level down.
- Deadlines come from the contract and from state prompt-payment law; retainage, backcharges and change orders adjust what is paid.
- The demo runs on seeded data in a sample workspace (`/sample`, choose a role) with resettable checkpoints (`POST /api/demo/reset?to=<checkpoint>`). Payments run on a simulated rail.

## Capabilities and Constraints

- Add a subcontract by uploading its PDF; Claude (claude-opus-5-5) extracts 21 payment terms with quotes; quotes are verified against the PDF; the controller resolves flagged terms and approves once.
- Pay applications with arithmetic checks against the approved rules; owner payments split by a pure waterfall engine; retainage held and released on certification; backcharges set off; change orders; lower-tier contracts with a second-hop waterfall; waiver signing with or without an account.
- Statutory overlay for 50 states and DC from researched data with citations; where the law is silent the contract's terms apply.
- Read API under `/api/v1`, shared with the pages and scoped to the signed-in organization.
- Terminology the product uses: subcontract, payment rules, pay application, owner payment, release, retainage, backcharge, lien waiver. User-facing copy says "read", not "compile".
- Not done or undecided: real authentication (the demo sign-in is deliberate); the Ramp sandbox has not been exercised; not deployed; statute data is not lawyer-reviewed; retainage on lower-tier agreements is unsupported; scanned PDFs cannot be read.

## Brand Commitments

- Name: Groundwork. Wordmark is the name beside a small square.
- Voice: plain sentences, sentence case, buttons that say what they do. No legal advice is given or implied.
- Visual commitments the owner has made binding in this project (recorded, not expanded here; see docs/DESIGN.md): the contract's own words are set in a serif and everything the software says in a sans; orange means money on its way or a clock running and is the one loud color; main pages open on a dark steel header; simple pages with obvious, responsive buttons. The owner has said he wants the interface simple but "grand", and distinct from generic generated design.

## Evidence on Hand

- Evaluation run of 2026-11-10: 28 subcontracts, 588 terms, 99.1% accuracy, 100% of quotes verified, wrong terms reaching the engine unflagged reduced from 5 to 1 by the review layers (`evals/results/latest.json`, `evals/contracts/`).
- Demo data is synthetic (`src/db/seed.ts`, `seed/contracts/*.pdf`). The "17 days vs 50 days" figure is attributed on the landing page to a third-party payment ledger.
- There are no customers, testimonials, pricing or press. None may be invented.

## Product Principles

1. The model proposes, code verifies, a person approves, a deterministic engine pays.
2. Every amount and deadline traces to a contract clause or a statute the user can see.
3. Law appears only where it changes something: a term under review, a deadline, a waiver form.
4. Each screen tells its person the one thing to do next.
5. State what is simulated or unverified rather than implying it is real.

## Accessibility & Inclusion

*(inferred)* WCAG 2.1 AA as the working standard: `scripts/contrast.mjs` enforces 4.5:1 for text and 3:1 for marks on the default theme, status is never carried by color alone, focus is visible, and motion respects `prefers-reduced-motion`. Subcontractor pages must work at phone width.
