# 0009. File-backed PGlite locally and in tests, Postgres when DATABASE_URL is set

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `1c9a240`; `src/db/client.ts`

## Context

Money needs transactions, so the store is Postgres. The project also had to run for a reviewer with `pnpm install && pnpm dev` and no Docker, and tests had to run in CI without a database service. Alternatives considered (`docs/DECISIONS.md`): Docker Postgres (setup cost) and SQLite (different SQL).

## Decision

`getDb()` in `src/db/client.ts` returns one Drizzle client:

- `DATABASE_URL` set: Neon's serverless driver over WebSocket (`drizzle-orm/neon-serverless`), chosen because it supports interactive transactions. Migrations are applied with `pnpm db:migrate`.
- `DATABASE_URL` empty: embedded PGlite (Postgres compiled to WASM) at `./.data/pglite`, or `PGLITE_DIR`. It applies the migrations in `drizzle/` on first connect.
- `NODE_ENV=test` or `PGLITE_MEMORY=1`: PGlite in memory. Each test file gets a fresh database.

Application code never branches on the driver.

## Consequences

- No setup locally or in CI, and the same SQL migrations run everywhere.
- A file-backed PGlite database can be opened by one process at a time. Anything that touches the database while `pnpm dev` is running must go through the running app; `pnpm build` must not run alongside `pnpm dev`. See `docs/OPERATIONS.md`.
- The Neon path is not exercised by the test suite or CI. It has been written for deployment, and the application is not currently deployed.
- PGlite is not a multi-user server; it is for development, the demo and tests only.
