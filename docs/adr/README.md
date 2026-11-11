# Architecture decision records

Each record states the context, the decision and its consequences for one decision that is evidenced in the code. They were written on 2026-11-10 from the repository and `docs/DECISIONS.md`, after the decisions were made. The date on each record is the date of the commit that first shows the decision, not the date the record was written.

`docs/DECISIONS.md` remains the maintainer's own running list, including look-and-feel choices not covered here. Where the two disagree, check the code.

| No. | Decision | Status |
|---|---|---|
| [0001](0001-ai-proposes-code-decides.md) | AI proposes, code verifies, a person approves, a deterministic engine executes | Accepted |
| [0002](0002-verbatim-quotes-verified-against-pdf.md) | Every extracted value carries a verbatim quote that code verifies against the PDF | Accepted |
| [0003](0003-flat-wire-schema-for-structured-output.md) | The model fills a flat wire schema; code parses it into the typed rule set | Accepted |
| [0004](0004-fixed-rule-schema-frozen-versions.md) | A fixed 21-field rule schema; approved versions are frozen and hashed | Accepted |
| [0005](0005-statutory-overlay-as-data.md) | State payment law is data plus code, never the model | Accepted |
| [0006](0006-pure-planner-integer-cents.md) | The money math is a pure function over integer cents | Accepted |
| [0007](0007-append-only-events-ledger-idempotency.md) | Append-only events and ledger; funding events are idempotent and replayable | Accepted |
| [0008](0008-groundwork-is-the-hold-rail-adapter.md) | Groundwork holds the payment; the rail is an adapter with a simulated implementation | Accepted |
| [0009](0009-pglite-locally-postgres-in-production.md) | File-backed PGlite locally and in tests, Postgres when DATABASE_URL is set | Accepted |
| [0010](0010-spec-first-synthetic-eval-contracts.md) | Evaluate extraction on spec-first synthetic contracts, with artifacts committed | Accepted |
| [0011](0011-org-scoped-reads-signed-cookie-token-links.md) | Authorization by org-scoped query helpers, a signed session cookie, and token links for parties without accounts | Accepted |
| [0012](0012-allocate-on-gross-retention-on-certification.md) | Allocate on gross; release retention on a person's certification | Accepted, open to overrule |

## Adding a record

1. Copy the structure of an existing file: title, status, date, evidence, then Context, Decision, Consequences.
2. Use the next number and a short kebab-case slug: `NNNN-what-was-decided.md`.
3. State consequences that cost something, not only the benefits.
4. Do not edit an accepted record to reverse it. Add a new record and mark the old one `Superseded by NNNN`.
5. Add a row to the table above.
