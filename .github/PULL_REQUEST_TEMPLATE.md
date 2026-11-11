## What and why

<!-- What changes for a GC, a sub or the owner, and why. Link the issue if there is one. -->

## How it was checked

- [ ] `pnpm typecheck && pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm eval --cache-only`

## Only if it applies

- [ ] **Money engine or ledger** (`src/domain`, release planning, retainage, waivers): a golden case or replay test covers the new behaviour, and cents still reconcile.
- [ ] **Schema** (`src/db/schema.ts`): the migration from `pnpm db:generate` is committed in `drizzle/`.
- [ ] **Extraction prompt, schema or scoring**: the eval was re-run with `pnpm eval --fresh`, and the updated `evals/cache` and `evals/results/latest.json` are committed.
- [ ] **Who can see what**: an authorization test covers the new read or action.
- [ ] **UI**: before and after screenshots are below.
- [ ] **New environment variable**: added to `.env.example` with a comment.
