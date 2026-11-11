# Changelog

All notable changes to Groundwork are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project has no numbered releases. `package.json` says `0.1.0` and has never been changed or tagged. The only tag is `v1-satisfactory`, which marks a state of the product rather than a version, so entries are grouped under that tag and, within it, by the pass of work they came from. Dates are commit dates. Short hashes refer to commits in this repository.

## [Unreleased]

Changes after the `v1-satisfactory` tag.

### Added

- A `demo` checkpoint for the sample workspace in which every role on the Bayview project has something to do: two waivers to sign with clocks running, a pay app and the Texas rules waiting on the controller, a first payment for Summit to confirm, and a pending change order (`3afb060`).
- "Switch role" in the sidebar and in the tour guide, which offers "Try another role" once a tour is finished (`f777456`).
- Company monograms, a money summary with a split bar, and activity tracks (`ebfea04`).
- Lifecycle documentation: `docs/ARCHITECTURE.md`, `docs/adr/`, `docs/TESTING.md`, `docs/OPERATIONS.md`, `CONTRIBUTING.md`, `SECURITY.md`, this changelog, and `.editorconfig`.

- CI split into four jobs (typecheck and lint, tests, cached eval, production build), with CodeQL, dependency review on pull requests, Dependabot, and pull request and issue templates.
- Eval tooling: `eval:check` (the cache reproduces the committed results), `eval:gate` (thresholds in `evals/thresholds.json`) and `eval:report` (`evals/results/REPORT.md`), with `evals/README.md` holding the data card and model card.
- 110 tests for the money path: allocation conserves cents, retainage stays within statutory caps, statutory deadlines win where the statute overrides the contract, and one company cannot read another's records.
- A README with screenshots and diagrams.

### Fixed

- A subcontract read again after approval was dropped from funding and broke replay.
- Submitting the owner payment form twice recorded the payment twice; the same project, bank reference and amount is now recorded once.
- Rule overrides are range-checked before they are stored (retainage percent, day counts, state code).
- Two pending pay apps could together overbill one schedule-of-values line.
- Owner payments and pay apps refuse a zero amount and a date that is not on the calendar; dollar fields refuse hex and exponent notation.
- An eval run no longer overwrites the committed results, and a cached extraction made with a different prompt or model is refused.

### Removed

- Unused components: the old landing hero and fragments, the page-hero shim, and three eval charts.

### Changed

- New G mark and icon; tables framed as paper panels; filled status pills; a smoothed, labelled balance chart (`ebfea04`).
- The landing page line no longer quotes the accuracy figure (`ebfea04`).
- Owner pages play the money flow through the owner payments on load (`ce5b694`).
- The sample owner-payment form is prefilled to cover the three open pay apps (`3afb060`).

## v1-satisfactory - 2026-11-10

Tag on commit `b28a0a2`. Everything from the first commit to that point.

### Product pass (2026-11-10, afternoon)

Commits `ac8f25d` to `b28a0a2`. The demo-only application became one with real accounts, with the seeded data moved into a sample workspace.

#### Added

- Real accounts: sign-up, password sign-in with scrypt hashing, project creation, and invitations by copyable link (`ac8f25d`, `d41ff7b`).
- The sample workspace at `/sample`: a picker with drawn faces for each seeded person, and a spotlight tour that follows each person's job across pages (`d41ff7b`, `0f706af`, `b28a0a2`).
- Rebuilt contractor, review, payment, subcontractor and owner pages, and a new landing page (`d41ff7b`, `b4a7a7d`).
- A shared visual foundation: sidebar shell, page header, and table, form and status primitives (`0a25480`).
- Not-found and error pages (`d1c46c2`).
- Motion: an animated three-steps sequence, scroll reveals and count-ups on the landing page, and arrival, hover, press and focus feedback in the app (`446daea`).
- One read per contract at a time: a second request waits for the first instead of calling the model again (`4b61cb2`).

#### Changed

- A demo reset now rebuilds only the sample workspace and leaves real companies' data alone (`ac8f25d`).
- One name per concept in the interface (retainage, work through, waiting on you), plain words for internal terms, clearer form help and errors (`d1c46c2`).
- Less text on the landing page and in the app (`389159a`, `5ef8aa3`).
- Typography moved to Libre Franklin for text and figures; monospace dropped from amounts; card frames replaced by ruled sections (`d09354d`).
- The palette was replaced several times during the pass (`c2f2735`, `2487c92`, `808d5af`, `45084f5`, `24072f8`). The state at the tag is the pigment palette: vellum page, Prussian ink, vermilion for money, verdigris for paid, lapis for held, madder for set off, ochre for waiting (`9e4e499`).

#### Removed

- Developer controls: the `/lab` page, the sample reset and fast-forward page, the theme switcher and alternate themes, the cached-read button, and the dev badge (`a27ca66`, `9b3aea7`).

### Design passes (2026-11-10, morning)

Commits `0f84610` to `a94bcd3`.

#### Added

- `docs/DESIGN.md` (`e2c20a1`) and `PRODUCT.md` (`2c44360`).
- An add-subcontract upload flow and a step guide on the project board (`2625e08`).
- Dark page headers with actions on every main page, an always-on money flow on the board, and reading progress (`a45f289`).
- A colour contrast check script, `scripts/contrast.mjs` (`0edb7ef`).
- A dev tool to render one contract markdown file to a PDF (`a94bcd3`).

#### Changed

- Redesign of the board, sub home, sign-in, landing, contract review, live view, statutes, release and pay application pages (`0f84610`, `e2c20a1`, `ab8c4b9`).
- Waivers are set in the contract's serif (`4118e0b`).
- Projects are shown as a table; one shared navigation list, cut to Projects and Ledger (`ba75212`, `2625e08`).
- Palette rebuilt in OKLCH (`0edb7ef`); drawing-sheet look with Archivo (`9efd6b3`). Both were later superseded in the product pass.

#### Fixed

- The subcontractor's timeline no longer shows the size of the owner's payment (`4118e0b`).
- Operating-system dark mode leaking into the single theme, phone-width tables and navigation, keyboard focus on dark headers, and missing reduced-motion fallbacks (`2c44360`).

### Round 2 build (2026-11-10, overnight)

Commits `17e0def` to `23c7340`.

#### Added

- Backcharges, change orders, retention release on certification, and lower-tier payments one hop down in the engine (`17e0def`), with their screens and account-less waiver signing at `/w/:token` (`4e20190`).
- A statutory overlay for all 50 states and DC, replacing the California-only rules (`c9ed9ba`).
- A read API under `/api/v1`: project summary, money flow graph, timeline, balance series, clocks, statutes and eval (`5c233a4`).
- The first live extraction eval: 28 contracts, 588 fields, 99.1% value accuracy, every quote verified, with results committed (`5bf84be`).
- Charts built on the read model: money flow, clock rings, balance chart, timeline, state map and eval charts (`158b4d5`).
- A second sample project in Texas, compiled by the model and replayed from a cached extraction (`ee5f230`).
- `docs/DECISIONS.md` (`23c7340`).
- A browser click-through script, `scripts/e2e.mjs` (`3709be7`).

#### Changed

- Extraction now fills a flat wire schema that code parses, after the structured-output API rejected the nested nullable schema (`c9ed9ba`).
- CI takes the pnpm version from `package.json`, and its eval step re-scores the committed extractions (`28b861a`).
- The committed eval run is loaded as a static import (`aeff19f`).

#### Fixed

- Defects found in review of the adjustments and lower-tier work (`cb23129`) and of the read API and charts (`ee5f230`).
- A lint error in `RollingNumber` (`b31395d`).
- Production build warnings (`aeff19f`).

### Hardening (2026-11-04)

Commits `51423c0` to `c754f0c`.

#### Added

- Upload of a contractor's own subcontract PDF on the compile page (`ebdccfe`).
- Eval v2: the layered review-policy ablation, adversarial contract specs, and two real California forms as answer keys (`c754f0c`).

#### Changed

- The Ramp rail was aligned with Ramp's documented Bill Pay API, and the app hardened for deployment (`51423c0`).

### Initial build (2026-10-29 to 2026-11-01)

Commits `7088cd3` to `366a949`.

#### Added

- Next.js application scaffold with shadcn/ui, Vitest and CI (`cc586de`).
- The domain core: the waterfall engine, pay-application checks, rule specs, California statutes and waiver forms (`03a8703`).
- The Drizzle schema, migrations, seed data, and contract and waiver PDF rendering (`1c9a240`).
- Rule extraction with Claude, pay-application flagging, payment explanations, and the first eval harness (`75babf6`).
- The server layer: actions, org-scoped authorization, events and replay, payment rails, demo reset, and API routes (`0710def`).
- Contractor, subcontractor, owner and demo interfaces (`ca65ef6`).
- README with setup and architecture (`366a949`).
