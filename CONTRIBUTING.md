# Contributing

Groundwork has one maintainer and was built for a hackathon. This file describes how the repository is actually worked on, so a change from someone else fits in.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layers and the trust boundary, and [docs/adr/](docs/adr/README.md) for why they are that way.
- **This is Next.js 16, and it differs from earlier versions.** APIs, conventions and file structure have breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices. This instruction comes from `AGENTS.md`, which `next dev` writes and re-adds; commit it with your work rather than removing it from a diff.
- No license file exists yet. Until the maintainer adds one, do not assume the code may be reused, and expect that contributions cannot be formally accepted under stated terms.

## Setup

Requirements: Node.js 24 or newer, pnpm 10.

```bash
pnpm install
cp .env.example .env.local     # optional
pnpm dev                       # http://localhost:3000
curl -X POST "localhost:3000/api/demo/reset?to=demo"   # load the sample workspace
```

No database server or Docker is needed; the app uses an embedded Postgres at `./.data/pglite`. Two things about it will save you time:

- Only one process may open it. Reset sample data through the running app (the `curl` above), and stop `pnpm dev` before `pnpm build`.
- Tests use a separate in-memory database and are safe to run at any time.

Environment variables, checkpoints and troubleshooting are in [docs/OPERATIONS.md](docs/OPERATIONS.md). An `ANTHROPIC_API_KEY` is needed only to read a subcontract other than the three seeded ones.

## Checks to run before opening a pull request

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm eval --cache-only
```

All four run in CI (`.github/workflows/ci.yml`) and none of them calls the Claude API. The pull request template lists the extra checks that apply to particular kinds of change.

CI also runs `pnpm build`. If you run it locally, stop `pnpm dev` first.

Check `git status` after an eval run. `evals/results/latest.json` and `latest.md` are the committed record of the eval; do not commit a change to them that you did not intend.

What each kind of change needs, beyond the four commands:

| If you change | Also do |
|---|---|
| `src/domain/waterfall`, `src/domain/payapp`, release planning, the ledger | Add a case with exact cents. Flow tests should end with a ledger reconciliation and `replayProject`. |
| `src/db/schema.ts` | `pnpm db:generate` and commit the new files in `drizzle/`. Never edit a committed migration. |
| The extraction prompt or wire schema (`src/lib/ai/extractRuleSet.ts`) | Bump `PROMPT_VERSION`, run `pnpm eval --fresh` (needs a key, costs money), commit the updated `evals/cache` and results. |
| `src/server/rules/review.ts`, `src/lib/verify/quote.ts`, `src/domain/statutes` | Read the eval report afterwards; these change the review-policy numbers. |
| `src/domain/statutes/data/states.json` | Every number needs a citation and source URL; `statutes.test.ts` enforces the citation. |
| Any read of business data | Go through `src/server/scoped.ts` or `src/server/read`, and add a test showing another organization gets nothing. |
| A new environment variable | Add it to `.env.example` with a comment and to the table in `docs/OPERATIONS.md`. |
| UI | Check it at phone width and with reduced motion. There are no automated UI tests; say in the pull request how you checked. |

See [docs/TESTING.md](docs/TESTING.md) for what the suite covers and what it does not.

## Branches

As practised in this repository's history:

- `main` is the default branch and the target for pull requests.
- Work happens on a short-lived branch named for the pass of work in kebab-case, for example `round2-harden`, `design-pass`, `product-pass`.
- History is linear. There are no merge commits; branches are fast-forwarded onto `main`. Rebase rather than merge to bring a branch up to date.
- One tag exists, `v1-satisfactory`, marking a state the maintainer was content with. There is no release process or versioning scheme beyond that.

## Commits

The log does not use Conventional Commits. What it does do:

- The subject is a plain sentence describing the outcome in the product's own words, not the mechanics of the diff. Subjects are long by usual standards (the median is about 90 characters) and are not wrapped.
- Many subjects lead with the area and a colon: `Landing: ...`, `Sample workspace: ...`, `CI: ...`, `README: ...`.
- Fixes say what was fixed: `Fix lint error in RollingNumber (no state update inside the reduced-motion branch)`.
- One commit covers one coherent change, which can be large (a whole feature with its tests).
- Commits made with an AI assistant carry a `Co-Authored-By:` trailer for it. Most commits in the log do.
- Commits should pass the checks above. The history has "fix defects found in review" commits; prefer to fold a fix into the commit it corrects before pushing.

Examples from the log:

```
Backcharges, change orders, retention release, and lower-tier payments in the engine
Read API under /api/v1: project summary, money flow graph, timeline, balance series, clocks, statutes, eval
Owner pages: the money flow plays through the owner payments on load
```

## Code conventions

These are visible in the code; match them.

**Formatting.** Two-space indentation, LF line endings, a final newline, double quotes, semicolons, trailing commas. There is no Prettier configuration and no enforced line length; long single-line statements are common in `src/server`. `.editorconfig` covers the whitespace rules. Files under `src/components/ui` omit semicolons; keep each file's existing style.

**TypeScript.** `strict` is on. Import from `src` through the `@/` alias. Validate external input with Zod.

**Header comments.** Every module and component opens with a block comment that says what it is for and what it must not do. Components also show a usage example and list their props (see `src/components/ui/panel.tsx`, `src/components/money-summary.tsx`). Write the comment for the next reader: constraints and reasons, not a restatement of the code.

**Money.** Integer cents everywhere, basis points for percentages. Never use floating-point dollars in storage or arithmetic. Use `src/lib/money.ts` to parse and format. Split amounts with `allocateProRata`.

**Layers.** `src/domain` is pure: no database, no clock, no network, no imports from `src/server` or `src/lib/ai`. Server code on the money path (waivers, payments, reviews, adjustments) takes the time from `now()` in `src/server/clock.ts`, not `new Date()`, so `DEMO_NOW` can freeze it. Server actions in `src/app/**/actions.ts` authenticate, parse the form and call a plain function in `src/server/actions`; the logic lives in the plain function so tests and scripts share it.

**The model.** Calls to Claude live only in `src/lib/ai`. Model output is never used as an amount, a deadline or a state transition. See the trust boundary in `docs/ARCHITECTURE.md`.

**Events and ledger.** Write to `events` and `ledger_entries` only through `emit` and `post` in `src/server/events.ts`, inside the transaction that makes the change. Do not update or delete rows in those tables.

**Design tokens.** Colors, fonts and state colors are CSS variables defined once in `src/app/globals.css` and exposed to Tailwind in its `@theme inline` block. Use the token classes (`text-money`, `bg-settled-soft`, and so on); do not hard-code color values in components. Motion durations, easings and springs come from `src/lib/motion.ts`. `docs/DESIGN.md` explains what each color means.

**Words.** User-facing copy uses the terms listed in `PRODUCT.md` (subcontract, payment rules, pay application, owner payment, release, retainage, backcharge, lien waiver) in plain sentence case. The interface says "read", not "compile".

**Documentation.** State what is simulated or unverified rather than implying it is real. Do not add customers, testimonials or figures that are not backed by something in the repository.

## Pull requests

- Fill in the template: what changes for a contractor, subcontractor or owner, and how it was checked.
- Keep a pull request to one purpose.
- Update the docs your change makes untrue: `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/TESTING.md`, and an ADR if a recorded decision changes (add a new record; do not rewrite an accepted one).
- Add a line to `CHANGELOG.md` under Unreleased.

## Reporting bugs and security issues

Open an issue for a bug. For anything that could expose another company's data, forge a session, or move or misdirect a payment, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
