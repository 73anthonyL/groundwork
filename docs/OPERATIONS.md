# Operations runbook

How to run Groundwork, reset its sample data, and handle the problems that have come up. The application is not deployed anywhere at the time of writing; the production notes at the end describe what the code expects, not a running service.

## Requirements

- Node.js 24 or newer (`engines` in `package.json`).
- pnpm 10 (`packageManager` in `package.json`).
- No Docker and no database server for local work.

## First run

```bash
pnpm install
cp .env.example .env.local     # optional; see the table below
pnpm dev                       # http://localhost:3000
```

On first start the app creates an embedded Postgres (PGlite) at `./.data/pglite` and applies the migrations in `drizzle/`. The database starts empty. Load the sample workspace with the app running:

```bash
curl -X POST "localhost:3000/api/demo/reset?to=demo"
```

Then open `/sample` and pick a person, or sign up for a real account at `/sign-up`.

The rendered sample PDFs in `seed/contracts/` and `seed/states/contracts/` are committed. Run `pnpm render:contracts` only after editing the markdown beside them.

## Environment variables

All are read from the process environment. Scripts started through `pnpm` load `.env.local` if it exists; `next dev` loads it as Next.js normally does. `.env*` is gitignored except `.env.example`.

| Variable | Default | Effect |
|---|---|---|
| `DATABASE_URL` | empty | Empty: embedded PGlite at `./.data/pglite`. Set: Neon serverless Postgres over WebSocket. |
| `ANTHROPIC_API_KEY` | empty | Needed to read a new subcontract, to phrase pay-app review notes, to narrate a payment, and to generate eval contracts. Without it, reading works only for the three seeded sample contracts (from their answer keys), review notes are skipped, and explanations use a deterministic text. |
| `SESSION_SECRET` | none | Signs the session cookie. Required when `NODE_ENV=production`; the app throws without it. In development a fixed fallback is used. The placeholder in `.env.example` must be replaced with a long random string before any shared use. |
| `PAYMENT_RAIL` | `simulated` | `ramp` selects the Ramp adapter, but only if `RAMP_CLIENT_ID` is also set. Anything else uses the simulated rail. |
| `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET` | empty | Ramp OAuth client credentials. |
| `RAMP_API_BASE` | `https://demo-api.ramp.com` | Ramp API host. |
| `RAMP_ENTITY_ID` | empty | The Ramp entity bills are created under. |
| `RAMP_VENDOR_MAP` | `{}` | JSON object mapping a subcontractor's organization id to its Ramp vendor id. A release to an unmapped subcontractor fails. |
| `RAMP_PAYMENT_METHOD` | `ACH` | Payment method sent on each bill. |
| `RAMP_WEBHOOK_SECRET` | empty | Verifies Ramp webhook signatures. While empty, every Ramp webhook is rejected. |
| `DEMO_RESET_TOKEN` | empty | In production, `POST /api/demo/reset` is refused unless this is set and sent as the `x-demo-token` header. In development no token is needed unless one is set. |
| `DEMO_NOW` | empty | An ISO timestamp that freezes the application clock (`src/server/clock.ts`), so countdowns hold still for a demo. |
| `DEMO_PRECOMPILED` | empty | `1` makes `POST /api/extract/:contractId` replay the seeded answer key instead of calling the model, even when a key is set. |

Read by code but not in `.env.example`:

| Variable | Effect |
|---|---|
| `PGLITE_DIR` | Directory for the embedded database instead of `./.data/pglite`. |
| `PGLITE_MEMORY` | `1` keeps the embedded database in memory. Set by the test config. |
| `GROUNDWORK_URL` | Base URL `pnpm demo:reset` and the dev scripts call. Default `http://localhost:3000`. |
| `EVAL_CACHE_DIR` | Where `pnpm eval` reads and writes cached extractions. Default `evals/cache`. |

## The local database is single-process

A file-backed PGlite database can be open in one process at a time. `pnpm dev` holds it for as long as it runs. A second process opening `./.data/pglite` can fail or corrupt the data directory.

| Task | While `pnpm dev` is running | With nothing running |
|---|---|---|
| Reset sample data | `curl -X POST "localhost:3000/api/demo/reset?to=demo"`, or `pnpm demo:reset --to=demo` (which calls the same endpoint) | `pnpm demo:reset --to=demo` runs in-process |
| `pnpm test` | Safe. Tests use an in-memory database. | Safe |
| `pnpm eval`, `pnpm render:contracts`, `pnpm typecheck`, `pnpm lint` | Safe. They do not open the database. | Safe |
| `pnpm build` | **Stop `pnpm dev` first.** | Safe |
| `pnpm db:migrate`, `pnpm db:seed` | Do not run against the embedded database. The app migrates itself on connect. | Safe |
| `pnpm ramp:webhook` | Requires `DATABASE_URL`; never touches the embedded database. | |

`pnpm demo:reset` tries the running app first and falls back to in-process only when the connection is refused, so it is safe in both columns. If the app is running on another port or host, set `GROUNDWORK_URL`.

### Starting over

To discard the local database entirely, stop `pnpm dev` and delete the directory:

```bash
rm -rf .data/pglite
```

The next `pnpm dev` recreates and migrates it. This deletes real accounts created locally as well as sample data.

## Sample data and checkpoints

The sample workspace is every organization with `is_demo` set, and everything that hangs off one. A reset deletes exactly that (`deleteSampleData` in `src/db/seed.ts`), re-seeds the baseline, and then replays the real actions up to the chosen checkpoint (`src/server/demo/reset.ts`). Real companies, their people, projects, contracts, documents, events and ledger are left as they were; `src/server/demo/reset-preserves.test.ts` asserts this.

```bash
curl -X POST "localhost:3000/api/demo/reset?to=<checkpoint>"
# or
pnpm demo:reset --to=<checkpoint>
```

An unknown checkpoint returns 400 with the list. With no `to` the endpoint uses `fresh`.

| Checkpoint | State of the Bayview Clinic TI project |
|---|---|
| `fresh` | Parties, the project, three subcontracts with PDFs and schedules of values. Nothing read yet. |
| `compiled` | Ironline's rules approved (v1). Pacific's rules extracted and waiting on review. Summit not read. |
| `paid1` | All three approved. Pay App #1 approved for each. Owner Payment #1 ($200,000) recorded, waivers signed, payments settled on the simulated rail. |
| `intake` | `paid1`, plus Pay App #2 approved for Ironline and Pacific, and Summit's #2 submitted with retainage billed at 5% instead of 10%. |
| `paid2` | `intake`, plus Summit corrected and approved, and Owner Payment #2 ($125,000, partial) recorded. Three releases await waivers with 7-day clocks running. |
| `closeout` | `paid2` settled, then: an approved change order on Ironline and a pending one on Pacific, a backcharge against Summit, Bay Rebar Supply added under Ironline, Owner Payment #3 ($175,000) with the backcharge set off and the supplier's share planned, Ironline's release waiting on its supplier's waiver, and half of Ironline's retainage certified and waiting on the owner. |
| `demo` | The state the sample workspace is meant to be shown in, with something for every role to do. Built from `intake`, not from `closeout`: Owner Payment #2 ($100,000) is recorded before Summit's pay app is approved. Ironline and Pacific each have a waiver to sign and a 7-day clock running, Summit's pay app waits on the controller, Summit still has to confirm its first payment arrived, and Pacific has a change order pending. |

The Texas project (Congress Avenue Office TI) is part of the baseline at every checkpoint. From `compiled` onward its subcontract is also compiled, from a cached model extraction (`seed/states/cache/lonestar-mechanical.json`), and left in review.

Notes:

- Sample ids are deterministic (`stableId` in `src/lib/ids.ts`), so URLs into the sample workspace survive a reset.
- `paid2`, `closeout` and `demo` record their latest owner payment at the current time, so their clocks are live. Set `DEMO_NOW` to hold them still.
- A reset takes a few seconds. The response is `{ "checkpoint": "...", "ms": ... }`.

## Common tasks

### Settle a payment on the simulated rail

On a release page (`/gc/releases/:id`) as the contractor, use the settle action. It posts a synthetic `bill.paid` through the same handler a real webhook reaches (`settleSimulated` in `src/server/actions/payments.ts`). Only payments on the simulated rail can be settled this way.

### Retry a failed payment

A release whose payment failed is `blocked`. The retry action on the release page calls `retryRelease`, which reuses the existing payment row and sends it again once the gates clear.

### Change the database schema

1. Edit `src/db/schema.ts`.
2. `pnpm db:generate` writes a new SQL migration and snapshot into `drizzle/`.
3. Review and commit the generated files. Do not edit a migration that has been committed.
4. Locally, restart `pnpm dev`; the embedded database applies it on connect. Against Neon, run `pnpm db:migrate` with `DATABASE_URL` set.

### Re-read a sample contract with the model

`scripts/compile-seed.ts` calls the model and writes a cached extraction next to the contract (used for the Texas project). It needs `ANTHROPIC_API_KEY` and costs money.

### Inspect the read API

Sign in through the browser, then request `/api/v1` for the list of endpoints. Responses are scoped to the signed-in organization. `scripts/api-peek.mjs <path> [persona]` prints a summary for a sample persona against a local dev server; it signs a cookie with the development fallback secret, so it works only when `SESSION_SECRET` is unset.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Database errors or a hang right after starting a second command | Two processes opened `./.data/pglite` | Stop everything, start only `pnpm dev`. If the data directory is damaged, delete it (see Starting over). |
| `/sample` says the sample workspace has not been set up | The sample workspace has not been loaded | `curl -X POST "localhost:3000/api/demo/reset?to=demo"` |
| Reading a subcontract returns 409 `no_api_key` | No `ANTHROPIC_API_KEY`, and the PDF is not one of the three seeded contracts | Set the key in `.env.local` and restart |
| Reading returns 422 `scanned_pdf` | The PDF has no text layer | Use a text PDF. Scanned documents are not supported. |
| Reading returns 502 `extraction_failed` | The model call failed, was cut off, or returned a value that did not parse | The message says which. Retry; nothing was stored. |
| `contract ... has no document; run render:contracts` during a reset | Sample PDFs are missing | `pnpm render:contracts`, then reset again |
| `SESSION_SECRET is required in production` | Production mode without the variable | Set it |
| Reset returns 403 | Production without `DEMO_RESET_TOKEN`, or the `x-demo-token` header does not match | Set the variable and send the header |
| Ramp webhook returns 401 | `RAMP_WEBHOOK_SECRET` is empty or wrong | Run `pnpm ramp:webhook https://<app-host>` and set the secret it prints |
| A release stays `waiver_signed` | It is waiting on its payer being paid, or on lower-tier waivers | See the release page. `sweepReadyReleases` runs automatically after each settlement. |
| Upload refused | Over 4 MB, not a PDF, or no text layer | See the message |

## Secrets

- Keep secrets in `.env.local` locally and in the host's environment settings when deployed. Never commit them. `.gitignore` excludes `.env*` except `.env.example`.
- `.env.example` contains names and placeholders only. Keep it that way.
- Do not paste keys into issues, pull requests, commit messages or chat transcripts. A key that has appeared anywhere outside its secret store should be rotated.
- `ANTHROPIC_API_KEY` spends money. `pnpm eval --fresh` and `pnpm gen:contracts` make many calls.
- `SESSION_SECRET`: rotating it signs every user out. There is no other way to revoke a session.
- `RAMP_WEBHOOK_SECRET` is printed once by `pnpm ramp:webhook`. Store it immediately.
- The development fallback for `SESSION_SECRET` is in the source and in the dev scripts. Anything reachable by other people must set a real one. See [SECURITY.md](../SECURITY.md).

## What is not deployed or not in place

- There is no production deployment. The code is written for Vercel with Neon (`next.config.ts` traces the seed files and migrations into the functions; uploads are capped at 4 MB to fit Vercel's body limit), but no environment exists and nothing here has been run there.
- Migrations are not applied automatically against Neon. Run `pnpm db:migrate`.
- The Ramp rail has not been exercised against Ramp's sandbox. No real money moves.
- No email is sent. Invitation links are shown for the inviter to copy.
- No monitoring, error reporting, structured logging, backups or alerting are configured. Server errors go to the process's console.
- No background worker. Releases advance when a waiver is signed or a webhook arrives. A payment left in `created` or `held` after a crash mid-call is not reconciled automatically.
- No rate limiting.

### If it is deployed

A minimal checklist from what the code requires:

1. Create the Postgres database, set `DATABASE_URL`, run `pnpm db:migrate`.
2. Set `SESSION_SECRET` to a long random value.
3. Decide whether the sample workspace should be resettable over HTTP. If yes, set `DEMO_RESET_TOKEN`; if no, leave it empty and the endpoint returns 403.
4. Set `ANTHROPIC_API_KEY`.
5. Leave `PAYMENT_RAIL=simulated` unless the Ramp adapter has first been verified against the sandbox.
6. Load the sample workspace once with the reset endpoint and its token.
