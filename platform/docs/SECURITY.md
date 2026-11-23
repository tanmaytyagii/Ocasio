# Identity and browser security

Implemented locally, 23 November 2026. This is not a production security audit or a legal compliance certificate.

## Two separate sessions

Better Auth 1.7.27 owns authenticated user identity, password hashing, verification/recovery tokens, OAuth state and authenticated cookies. Email/password requires email verification. Passwords use a 12–128 character engineering policy. Password reset revokes existing identity sessions; logout removes the captured session's authority. The founder selected email/password plus Google; Google is disabled unless both credentials exist. Automatic provider account linking is disabled. No registration field grants vendor/staff/admin privileges.

`GET /api/v1/security/session` establishes a PostgreSQL-backed browser CSRF context and returns `{authenticated:boolean,csrfToken}` after consulting Better Auth. This express-session cookie is **not** user identity. `DELETE` revokes the current Better Auth identity session, destroys the CSRF context and clears cookies. Business code must use verified library identity and explicit resource authorisation, never infer identity from a CSRF session ID.

`GET /api/v1/me` exposes only the current verified account's id/name/email/verification state. Business resource ownership, organisation membership, staff roles and privileged workflows are not implemented. There is no test login shortcut.

## Browser boundary

Both routed NestJS mutations and the mounted native auth handler require exact configured Origin, non-cross-site Fetch Metadata and a constant-time comparison of the per-session CSRF header token. Missing/malformed/other-session tokens fail. The auth handler is mounted before JSON parsing, as required by the library. OAuth callback GET requests use the library's state/PKCE boundary; they are not a general unsafe-method exemption. Invalid/missing state cannot establish identity.

Next.js forwards `/api/v1/*` to a trusted fixed internal API origin. Direct API access must meet the same checks. WEB_ORIGIN must exactly match the actual browser origin; localhost and127.0.0.1 are different. Cookie identity belongs to the configured browser origin, not an internal hostname.

Cookies are HttpOnly and host-only with SameSite and production Secure controls. The CSRF cookie additionally uses a production __Host- prefix. Production TLS/proxy trust and actual library cookie issuance need deployment validation; local HTTP is intentionally different. Do not broadly trust arbitrary forwarded headers. Library database-backed rate limits remain enabled and are tested to return429.

## Secrets, mail and logs

SESSION_SECRET is mandatory and private. Local setup creates it without printing it. This implementation uses the same secret for library signing, express-session signing and domain-separated authentication-mail encryption. Rotation must coordinate all three: invalidated sessions and undecryptable pending mail require deliberate handling. Do not rotate casually with pending messages.

Mail payloads (including recipient and token links) are AES-256-GCM encrypted in the private queue. Worker SMTP handoff clears ciphertext. Dead rows retain encrypted payload pending a retention policy. Leased retries are at least once: a crash after SMTP acceptance can duplicate delivery. SMTP acceptance is not proof of inbox placement. Production uses implicit TLS or required STARTTLS; local Mailpit is only development capture. See [setup/runbook](AUTH-SETUP.md).

Request logs contain method/status/duration/request ID, not paths/query strings, tokens, passwords, recipients or bodies. Never enable verbose auth/SMTP logging against real accounts. No external production message delivery is configured or claimed.

## Evidence and remaining gates

PostgreSQL/API tests cover verification-required registration, hashed credentials, login, logout/captured-cookie revocation, reset/replay/session revocation, role injection, callback-origin rejection, rate limiting, CSRF/origin/cross-session checks, durable session restart, expiry, tampering and storage outage. Google tests validate configured initiation and missing-state rejection with fake credentials, without external calls; **real Google login is untested**. Mail tests use synthetic addresses and local Mailpit for delivery, retries, corrupt payload, stale leases and concurrent claims.

Before production: resource authorisation/organisation/staff permissions, real OAuth/provider and mail validation, token expiry and recovery threat review, explicit production session/retention policies, transactional reliability of account-change versus mail enqueue, secrets/TLS/proxy deployment, consent/privacy lifecycle, privileged audit events, broader abuse controls and security/accessibility review. Native library endpoint errors are not yet unified with the Nest request-ID error contract. No payment webhook boundary exists.

Primary implementation references: [Better Auth Express](https://www.better-auth.com/docs/integrations/express), [email/password](https://www.better-auth.com/docs/authentication/email-password), [Google](https://www.better-auth.com/docs/authentication/google), [session management](https://www.better-auth.com/docs/concepts/session-management), [Express sessions](https://expressjs.com/en/resources/middleware/session/), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
