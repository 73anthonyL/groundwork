# 0011. Authorization by org-scoped query helpers, a signed session cookie, and token links for parties without accounts

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `0710def`; real accounts added in `ac8f25d` (2026-11-10)

## Context

Three kinds of organization share one database and must not see each other's figures: a subcontractor must not learn another subcontractor's amounts or the size of the owner's payments. Lower-tier suppliers need to sign a waiver without creating an account. The first version had only seeded personas; real sign-up was added later.

## Decision

- **Session**: an HS256 JWT in the `gw_session` cookie (httpOnly, SameSite=Lax, Secure in production, 30 days), signed with `SESSION_SECRET`. The cookie carries only the user id; `auth()` loads the user and organization on each request.
- **Scope**: every read of business data goes through `src/server/scoped.ts` or `src/server/read`, which take the caller's organization and filter by it. Pages and the JSON read API share these helpers.
- **Accounts**: real users sign up or accept an invitation and sign in with a password hashed with scrypt. Sample personas have no password and are entered through `/sample`; `createSampleSession` refuses any user outside the sample workspace.
- **Token links**: a lower-tier waiver carries a random `sign_token` (24 bytes, base64url). Possession of the link authorizes signing that one waiver at `/w/:token`. The payer of that waiver is never shown the token. Invitations work the same way, once, and expire after 14 days.

## Consequences

- Tests assert cross-organization reads return nothing and that a payer never receives its claimant's signing token (`scoped.test.ts`, `read/project.test.ts`, `review-fixes.test.ts`).
- Scoping depends on every new query using the helpers. There is no row-level security in the database.
- Sessions cannot be revoked individually before they expire, short of rotating `SESSION_SECRET` or deleting the user.
- Without `SESSION_SECRET`, development uses a fixed, public fallback secret; production refuses to start a session without one. See `SECURITY.md`.
- Waiver signing tokens do not expire.
- There is no email service: invitation and signing links are produced for a person to pass on.
- User roles are stored but not used for authorization.
- No rate limiting, email verification or password reset exists yet.
