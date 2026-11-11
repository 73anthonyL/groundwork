# Security

Groundwork is a hackathon project maintained by one person. It is not deployed, has no customers, and moves no real money. This file says how to report a problem and describes the current security posture as it is, including what is missing.

## Reporting a vulnerability

Report privately. Do not open a public issue with details.

1. Use GitHub's private vulnerability reporting on this repository: the **Security** tab, then **Report a vulnerability**.
2. If that option is not shown, open an issue that says only that you have a security report and asks the maintainer for a private channel. Put no details in it.

Include what you did, what you expected, what happened, the commit you tested, and whether sample or real-account data was involved. If the report involves a secret (a key, a session cookie, a token), say which kind and where you found it, but do not paste the value.

There is no bounty and no guaranteed response time. The maintainer will acknowledge a report when it is read and say whether and when it will be fixed.

## Supported versions

Only the tip of `main` is maintained. There are no released versions.

## Scope

In scope:

- Reading or changing another organization's data: contracts, pay applications, releases, waivers, ledger entries, documents. The intended boundary is in `src/server/scoped.ts` and `src/server/read`.
- A subcontractor learning another subcontractor's amounts, or the size or bank reference of the owner's payments.
- Forging or replaying a session, signing in as another user, or entering a real account through the sample workspace.
- Obtaining or guessing an invitation link or a waiver signing link, or a payer obtaining its own claimant's signing link.
- Signing a waiver, approving payment rules or a pay application, recording an owner payment, or advancing a release without the authority to do so.
- Making the engine pay twice, pay the wrong amount, or release a payment before its waiver gates are met.
- Getting model output treated as an amount, a deadline or an approval. See the trust boundary in `docs/ARCHITECTURE.md`.
- Webhook forgery against `POST /api/webhooks/ramp`.
- A demo reset that deletes or alters data belonging to a real (non-sample) organization.
- Secrets committed to the repository or its history.

Out of scope:

- Anything inside the sample workspace by someone who entered it through `/sample`. It is open by design: anyone can become any sample persona and act as them.
- The fixed development session secret being known (see below), on an instance that is not exposed to other people.
- Accuracy of the statute data or of contract extraction. These are product limits documented in the README and `docs/adr/`, not vulnerabilities. Report them as ordinary issues.
- Denial of service by volume. There is no rate limiting; that is a known gap.
- Vulnerabilities in dependencies with no demonstrated impact here.

## Current posture

### No real money moves

The default payment rail is `SimulatedRail` (`src/server/rails/simulated.ts`), which makes no network calls. Settlement on it is a synthetic event raised by a signed-in contractor. The Ramp adapter is selected only when `PAYMENT_RAIL=ramp` and `RAMP_CLIENT_ID` are both set, and it has never been run against Ramp, sandbox or production. Treat any use of it with real credentials as untested.

### Sessions

- The session is an HS256 JWT in the `gw_session` cookie: `httpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, 30-day lifetime. It carries only the user id. The user and organization are loaded from the database on every request.
- **Development fallback secret.** When `SESSION_SECRET` is unset and `NODE_ENV` is not `production`, cookies are signed with the fixed string `groundwork-dev-only-secret` (`src/server/auth.ts`). The same string is hard-coded in the dev scripts under `scripts/` so they can sign in as sample personas. Anyone who can reach such an instance can forge a session for any user id they know. In production the code throws instead of falling back.
- `.env.example` ships a readable placeholder for `SESSION_SECRET`. The code does not reject it. An instance started with the placeholder is as forgeable as one with the fallback.
- A session cannot be revoked on its own. Rotating `SESSION_SECRET` signs everyone out; deleting the user invalidates that user's sessions.

### Accounts

- Passwords are hashed with scrypt (N=32768, r=8, p=1, 16-byte random salt, 64-byte key) and compared in constant time (`src/server/passwords.ts`). Minimum length is 10 characters.
- Sign-in answers the same way for a wrong password and an unknown email, and burns the same hashing work for both.
- Sample personas have no password and cannot sign in through the password form. `createSampleSession` refuses any user outside the sample workspace.
- Missing: rate limiting or lockout on sign-in, email verification, password reset, multi-factor authentication.

### Authorization

- Every read of business data takes the caller's organization and filters by it. Tests assert cross-organization reads return nothing (`src/server/scoped.test.ts`, `src/server/read/project.test.ts`).
- This depends on every query using the helpers. There is no row-level security in the database.
- User roles (`admin`, `ap`, `pm`, `viewer`) are stored but not used for authorization. Any member of a contractor's organization can do anything that organization can do, including approving rules and recording owner payments.
- Server actions and route handlers have no automated tests of their own; the functions they call do.

### Links that act as credentials

- **Invitations**: a 32-byte random token, single use, expiring after 14 days.
- **Waiver signing links** (`/w/:token`): a 24-byte random token per lower-tier waiver. Possession authorizes viewing and signing that one waiver. These tokens do not expire. The paying party is never shown its claimant's link.
- Both are stored in the database in plain form.
- A typed-name signature is recorded with a SHA-256 hash over the waiver id, its fields, the signer's name and the time. It is evidence of what was signed, not proof of who signed.

### Endpoints without a session

| Endpoint | Protection |
|---|---|
| `POST /api/webhooks/ramp` | HMAC-SHA256 over the raw body with `RAMP_WEBHOOK_SECRET`, constant-time comparison. With no secret configured every event is rejected. Ramp's registration challenge is accepted unsigned and only stored. Deliveries are deduplicated by event id. |
| `POST /api/demo/reset` | In production: refused unless `DEMO_RESET_TOKEN` is set and matches the `x-demo-token` header. Outside production with no token set: open. It rebuilds the sample workspace only. |
| `GET /api/v1/statutes`, `GET /api/v1/eval`, `GET /api/v1` | Public by intent. They return reference data and the committed eval run. |
| `/w/:token` | The token. |

### Data sent to a third party

With `ANTHROPIC_API_KEY` set, the following goes to the Claude API: the full subcontract PDF when it is read; the subcontractor's name and the failing check results when a pay application is submitted; and the parties' names, amounts, quoted clauses and bank reference of a payment when an explanation is requested. Without a key none of this is sent.

### Stored data

Uploaded PDFs are stored in the database as base64, with their extracted text. Nothing is encrypted at the application level. Uploads are limited to 4 MB, must begin with the PDF signature, and must have a text layer. Documents are served only to an organization that can see the contract they belong to, with `X-Content-Type-Options: nosniff`.

### Not in place

- No security headers are configured (no Content-Security-Policy, no HSTS beyond what a host adds).
- No rate limiting anywhere.
- No audit of who read what. The `events` table records writes, with the actor.
- No monitoring or alerting.
- Append-only tables are a code convention; the database does not enforce it.
- The code has had no independent security review.

Automated checks configured under `.github/`: Dependabot version updates, CodeQL analysis, and dependency review on pull requests. They report through GitHub; nobody is on call for them.

## Secrets policy

- Secrets live in `.env.local` on a developer's machine and in the hosting provider's environment settings. `.gitignore` excludes every `.env*` file except `.env.example`.
- `.env.example` holds names, defaults and placeholders only.
- Never commit a secret, and never paste one into an issue, pull request, commit message, log line, test fixture or a conversation with an AI assistant. A secret that has appeared in any of those places must be rotated, not just removed.
- The secrets this project uses: `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `RAMP_CLIENT_ID` and `RAMP_CLIENT_SECRET`, `RAMP_WEBHOOK_SECRET`, `DEMO_RESET_TOKEN`.
- Test fixtures use made-up values. CI needs no secrets: the test suite and the cached eval never call an external service.
- Password hashes never leave the server. The only user shape passed to a page is `PublicUser`, which omits the hash.
- If you find a secret in the repository or its history, report it as a vulnerability.
