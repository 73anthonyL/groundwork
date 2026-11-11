# Testing

What is tested, how, and what is not.

At commit `3afb060` the suite was 22 test files and 156 tests, all passing in about 45 seconds on a laptop. The change set this document was written alongside adds more test files (listed below); run `pnpm test` for the current count.

## Commands

| Command | What it does | Needs |
|---|---|---|
| `pnpm test` | Runs every `*.test.ts` under `src/` and `evals/` once with Vitest | Rendered sample PDFs (committed; `pnpm render:contracts` regenerates them) |
| `pnpm test:watch` | The same, re-running on change | |
| `pnpm vitest run src/domain/waterfall` | Runs one folder or file | |
| `pnpm typecheck` | `tsc --noEmit` | |
| `pnpm lint` | ESLint with `eslint-config-next` | |
| `pnpm eval --cache-only` | Re-scores the committed extractions against their answer keys; never calls the model | |
| `pnpm eval:check` | `pnpm eval --cache-only --check`: re-scores from the cache and fails unless the result reproduces `evals/results/latest.json` | |
| `pnpm eval:gate` | Compares `evals/results/latest.json` with the bounds in `evals/thresholds.json`; reads files only | |
| `pnpm eval:report` | Regenerates `evals/results/REPORT.md` from the committed results; `--check` fails if the committed report is out of date | |
| `pnpm eval` | Uses a cached extraction where one exists, otherwise calls the model | `ANTHROPIC_API_KEY` for any contract not in `evals/cache` |
| `pnpm eval --fresh` | Calls the model for every contract and overwrites the cache | `ANTHROPIC_API_KEY`; costs money |
| `pnpm eval --only=<substring>` | Restricts the run to matching contract slugs | |

CI is defined in `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`. Its jobs are: typecheck and lint; tests (after `pnpm render:contracts`); the cached extraction eval; and a production build. None of them calls the Claude API or needs a secret. Read the workflow file for the exact steps; it is the source of truth.

## How the suite is set up

`vitest.config.mts` sets `NODE_ENV=test` and `PGLITE_MEMORY=1`. With those, `getDb()` in `src/db/client.ts` creates an in-memory PGlite database and applies the migrations in `drizzle/`. Each test file runs in its own worker and gets its own database, so files do not share state and the suite does not touch `./.data/pglite`. It is safe to run while `pnpm dev` is running.

There are no mocks of the database. Integration tests call the same action functions the pages call (`recordOwnerPayment`, `signWaiver`, `reviewPayApp` and so on) against real SQL.

No test calls the Claude API. `flagPayApp` returns `[]` and `explainPayment` falls back to its deterministic text when `ANTHROPIC_API_KEY` is not set. If the key is exported in your shell, tests that reach those functions would call the API; run the suite without it.

Tests live beside the code they cover.

## What is covered

### Pure domain (no database)

| File | Covers |
|---|---|
| `src/domain/waterfall/engine.test.ts` | `allocateProRata` never creates or loses cents. The sample scenario's exact numbers for Owner Payments #1 and #2. Retainage caps (contract and statutory), contract periods against statutory defaults, pay-if-paid handling, exclusions, offsets, final applications, overpayment, and other states (Texas, New York, New Mexico, Kentucky, Washington). Determinism: the same inputs give the same plan. |
| `src/domain/waterfall/review-fixes.test.ts` | Backcharges carried across releases in one event and never taken twice; statutory ceilings on fixed periods; step-down caps (Illinois, North Dakota); the Kansas default; the warning when owner retention arrives and nothing is certified. |
| `src/domain/payapp/checks.test.ts` | The retainage-rate check and its correction, a clean application, over-billing, history mismatch, sequence errors, the no-approved-rules case, final applications. |
| `src/domain/statutes/statutes.test.ts` | All 51 jurisdictions present with the five rules; no number without a citation; plausible ranges; California matches the rules the engine was built on; every cited id resolves; waiver forms per state. |
| `src/domain/rules/from-spec.test.ts` | For each sample contract, every answer-key anchor is found verbatim in the rendered PDF and the resulting rule set passes the strict schema. This reads `seed/contracts/*.pdf`. |
| `src/lib/verify/quote.test.ts` | Exact match, page correction, normalization of quotes, dashes and hyphenation, fuzzy acceptance, rejection of a fabricated quote. |
| `src/lib/ai/extractRuleSet.test.ts` | `fromWire`: typed parsing, silent and omitted fields as not found, a value without a quote keeps no evidence, an unparseable value is rejected. No model call. |
| `src/server/rails/ramp.test.ts` | The Ramp bill request body, vendor mapping, HMAC signature verification (including failing closed with no secret), webhook parsing. No network call. |
| `evals/score.test.ts` | The eval scorer itself: a perfect extraction, a fabricated quote, a hedged wrong value, a confident misreading that no layer catches, value comparison, and the bootstrap. |
| `src/domain/waterfall/invariants.test.ts` | Invariants of `allocateProRata` and `planWaterfall` over many generated scenarios, from a seeded generator so a failure reproduces. |
| `src/domain/payapp/overbilling.test.ts` | A pay application cannot bill a schedule-of-values line past its scheduled value, however the lines are presented. |
| `src/domain/statutes/overlay.test.ts` | Boundaries of the overlay: effective dates, prime-contract-size thresholds, day types, waiver form pairings. |
| `src/lib/money.test.ts` | Parsing and formatting of dollar amounts into integer cents. |
| `evals/gate.test.ts`, `evals/run-file.test.ts`, `evals/report.test.ts`, `evals/cache.test.ts`, `evals/dataset.test.ts` | The eval tooling itself: the regression gate, the results-file format, the report, cache records and spec loading. |

### Integration (in-memory Postgres, real actions)

| File | Covers |
|---|---|
| `src/server/flow.test.ts` | Builds the `compiled`, `paid1`, `intake` and `paid2` checkpoints. Approval is blocked while a field is unresolved. Releases planned, signed, paid and settled with the sample numbers. Ledger balances reconcile. Recording the same owner payment twice writes nothing. Replay reproduces the stored releases. |
| `src/server/closeout.test.ts` | Backcharge rules, change orders (including a deductive one that cannot cut below billed), a lower-tier supplier declared on a pay application, the lower-tier hop planned in the same transaction, the sub's release waiting on its supplier's waiver, certified retainage released on the shorter clock, ledger reconciliation and replay on both tiers. |
| `src/server/review-fixes.test.ts` | Retrying a failed payment reuses the one payment row; a late failure notice cannot undo a settlement; replay uses the contract sum as it stood at each event; the payer never receives its claimant's signing token. |
| `src/server/scoped.test.ts` | Org scoping: a contractor sees its contracts, a subcontractor only its own, a stranger sees none. |
| `src/server/scoped-money.test.ts` | Org scoping of releases, waivers, pay applications, documents and the ledger. |
| `src/server/money-path.test.ts` | Guards on the money path: duplicate owner payments, stale schedule lines, rule overrides, a waiver before payment. |
| `src/server/read/project.test.ts` | Read-model totals equal the ledger; each owner payment's flow links add up to the payment; a failed payment stays owed; a subcontractor never learns another's amounts, the owner payment's size or bank reference, review notes or signing tokens. |
| `src/server/accounts.test.ts` | Password hashing, sign-up, duplicate emails, sign-in, identical answers for a wrong password and an unknown email, sample personas cannot sign in with a password. |
| `src/server/invitations.test.ts` | Who may invite into which company, acceptance working once, two people racing for one link, expiry after 14 days, invitations disabled in the sample workspace. |
| `src/server/projects.test.ts` | Creating a project and its owner, input errors, an empty project read through the scoped helpers and the read model, invisibility to other contractors. |
| `src/server/add-subcontract.test.ts`, `src/server/documents.test.ts` | Adding a subcontract with its PDF, refusing duplicates and unreadable files, attaching a replacement PDF, refusing once rules are approved. |

### Demo checkpoints

The sample workspace's checkpoints are built by `resetTo` in `src/server/demo/reset.ts`, which runs the real actions in order rather than inserting finished rows. That makes each checkpoint an end-to-end test of the actions it uses.

| File | Checkpoint | Asserts |
|---|---|---|
| `src/server/flow.test.ts` | `compiled`, `paid1`, `intake`, `paid2` | See above |
| `src/server/demo/checkpoints.test.ts` | `closeout` | Three owner payments on the board with the supplier's event kept off it; Ironline's third release signed and waiting on its supplier; the adjustments shown on the contract page; the Texas subcontract compiled under Texas law and left for review; a clean replay |
| `src/server/demo/demo-checkpoint.test.ts` | `demo` | The second owner payment funds the two approved pay apps and asks each sub for a waiver; Summit's pay app waits on the controller and its first payment waits for Summit to confirm |
| `src/server/demo/reset-preserves.test.ts` | every checkpoint | A reset from any checkpoint to any other leaves every row belonging to a real (non-sample) company unchanged, the real account still signs in, and the sample workspace is rebuilt from nothing |

## The extraction eval

The eval answers two questions about `extractRuleSet`: how often a value is right, and how often a wrong value would reach the engine without a person being asked to look.

- **Inputs**: answer keys in `seed/specs`, `evals/specs` and `evals/real/specs`; PDFs in the sibling `contracts/` folders; cached extractions in `evals/cache`.
- **Scoring**: `evals/score.ts`, pure. Each field is compared with its answer key and then checked against four review policies, the last being the production `annotate` function.
- **Record**: `evals/results/latest.json` and `latest.md` are the committed record of a run. `latest.json` is served at `GET /api/v1/eval`.
- **Bounds**: `evals/thresholds.json` holds the floor for contracts, fields, accuracy and quote verification, and the ceiling for silent errors and review burden. `pnpm eval:gate` checks the record against them.

The committed run (2026-11-10, 28 contracts, 588 fields): 99.1% value accuracy, 100% of quotes found, 1 wrong value unflagged under the production policy. Full tables are in `evals/results/latest.md`.

[evals/README.md](../evals/README.md) is the full guide to the eval: the flags, when the record is rewritten, and how the gate works. This section only places it in the test strategy.

### What the eval is as a regression gate

Re-scoring the cache exercises the current scorer, review policy (`src/server/rules/review.ts`), quote verifier (`src/lib/verify/quote.ts`) and statute data against fixed model outputs. A change to any of those that lets a wrong value through unflagged, or sends many more fields to review, shows up as a changed record or a failed threshold.

It does not call the model, so it cannot detect a regression in the model or in the extraction prompt. That takes `pnpm eval --fresh` with a key, by hand.

### Things to know before running it

- The two real California forms are third-party PDFs and are not in the repository. Without them a run skips those two specs. CI is in this situation. To include them, follow `evals/real/README.md` to fetch the PDFs into `evals/real/contracts/` (gitignored).
- `evals/contracts/clean-fixed-30` failed its generation audit and is skipped by design.
- After changing the extraction prompt or wire schema, bump `PROMPT_VERSION` in `src/lib/ai/extractRuleSet.ts` and run `pnpm eval --fresh`. Cached extractions from the old prompt say nothing about the new one. Commit the updated cache and record together.
- Check `git status` after any eval run and do not commit a changed record you did not intend.

## What is not tested

- **No browser end-to-end suite.** Nothing in CI renders a page or clicks a button. React components, forms, server-action wrappers in `src/app/**/actions.ts` (form parsing, redirects, error messages) and route handlers have no automated tests.
- **Dev scripts are not tests.** `scripts/smoke.mjs` (fetches pages as each sample persona), `scripts/e2e.mjs` (drives forms through headless Chrome) and `scripts/upload-check.mjs` are manual tools that need a running dev server, and the last two a Chrome with remote debugging. `scripts/e2e.mjs` still visits `/demo` and `/lab`, which no longer exist, so it fails as written.
- **Live model behaviour** is measured only by a manual `pnpm eval --fresh`.
- **The Neon driver path** (`DATABASE_URL` set) is not exercised by tests or CI.
- **The Ramp rail against Ramp.** Only request construction and signature checks are unit-tested.
- **The HTTP layer of the read API** (`src/app/api/v1`). The read-model functions behind it are tested; status codes and envelopes are not.
- **Concurrency.** One test races two invitation acceptances. There are no tests of concurrent owner payments or concurrent webhook deliveries beyond the idempotency checks.
- **Accessibility and visual regressions.** `scripts/contrast.mjs` checks color contrast of the tokens in `src/app/globals.css` when run by hand; it is not part of CI.
- **Coverage is not measured.** No coverage tool is configured.

## Adding tests

- Put the test beside the code as `name.test.ts`. Vitest picks up `src/**/*.test.ts` and `evals/**/*.test.ts` only; a `.test.tsx` file would not run.
- For engine behaviour, add a case to `src/domain/waterfall/engine.test.ts` with plain inputs. No database is needed.
- For a flow, call `resetTo("<checkpoint>")` in `beforeAll` and drive the real actions. Use `replayProject` and a ledger-balance assertion as the closing checks, as `flow.test.ts` and `closeout.test.ts` do.
- For anything that returns business data, add a case showing that another organization gets nothing.
- Hooks that build a checkpoint need a long timeout; the config allows 60 seconds per hook and 30 per test.
