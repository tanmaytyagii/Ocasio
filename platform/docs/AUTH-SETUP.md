# Authentication setup and mail delivery

This describes the current authentication implementation work: Better Auth's native Node handler and durable SMTP authentication mail. It does not establish production identity-provider approval or complete vendor/customer admission. Selecting a provider and authorising its real account remain separate decisions.

## Local mail

The local Compose environment provides Mailpit: SMTP `127.0.0.1:1025`, inbox UI `http://127.0.0.1:8035`. Local mail is captured for development; it is not a production delivery service. Do not send actual customer information through local test fixtures.

Local SMTP settings use `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false` and `MAIL_FROM=hello@ocasio.test`. SMTP authentication is optional; if used, supply both `SMTP_USER` and `SMTP_PASSWORD`. Credentials and generated authentication links must never be printed in application logs or copied into public reports.

Apply the authentication/mail migrations before starting the API and worker. Run the worker alongside the application so queued verification/recovery messages are delivered to the local inbox. A successful enqueue is not proof of delivery: inspect queue state and the development inbox without exposing message contents in diagnostic logs.

## Google sign-in: optional configured integration

Google sign-in remains disabled when the required Google credentials are missing. Configure the actual approved Google client using the environment keys provided by the application's `.env.example`; do not create fictitious credentials.

The local callback is:

```text
http://127.0.0.1:3000/api/v1/auth/callback/google
```

Register that exact callback for the development client. `localhost` and `127.0.0.1` are different origins; do not interchange them in the browser, configured origin or provider callback. The intended Google scopes are `openid`, `email` and `profile`. Production needs its own exact HTTPS callback/origin configuration and a deliberate review of the provider account, scopes, consent screen, privacy disclosures and credential handling.

## Production SMTP requirements

Supply an explicit SMTP host, port, sender and any required credentials. No remote production provider is selected implicitly. Configure implicit TLS using `SMTP_SECURE=true` where required; otherwise the worker requires STARTTLS in production. Certificate validation must remain enabled. The development sender domain is not a production sender identity.

Before real customer use, verify sender ownership, deliverability, rate limits, mail templates, correct public link origin, account verification/recovery behaviour and incident ownership. Configure required DNS/authentication records with the approved mail provider. No production SMTP onboarding or real-mail delivery is claimed by local Mailpit testing.

## Queue and recovery behaviour

Authentication messages are stored as encrypted payloads in `auth_mail_queue`. The API and worker must use the same `SESSION_SECRET` to encrypt/decrypt them; treat secret rotation as a coordinated change because old pending messages otherwise become undecryptable. Encryption reduces plaintext exposure in database records; it does not replace database permissions, backup protection or host security.

The worker claims a due pending message or expired processing lease with a short, locked database transaction using `SKIP LOCKED`. It grants a two-minute lease and increments the attempt count, then performs SMTP outside the transaction. Finalisation compares the claim token so a stale worker cannot rewrite a newer claim. SMTP connection and greeting timeouts are ten seconds each; the socket timeout is twenty seconds.

Delivery failures retry with exponential delays, starting at 30 seconds, for at most five claimed attempts. An expired lease after the fifth attempt becomes dead. Invalid/undecryptable payloads become dead immediately. Raw SMTP errors and decrypted payloads are not persisted as error messages; only fixed error codes are stored.

Successful SMTP handoff marks the row sent and removes its encrypted payload. SMTP acceptance does not prove inbox placement or that the recipient used the link. The deterministic message ID helps identify repeated sends but does **not** guarantee deduplication: if SMTP succeeds and the process fails before database finalisation, a later retry can deliver a duplicate.

Dead rows retain ciphertext for restricted investigation pending an approved retention/replay policy. There is no automatic dead-message replay or unlimited retry. Operators must not export plaintext links or make ad-hoc queue edits that bypass the attempt/lease rules. A customer's next verification/recovery request should follow the authentication library's approved token lifecycle, not assume an old queued link is still valid.

## Verification scope and remaining checks

Local automated checks now cover sign-up, verification, password recovery/revocation, missing Google configuration, configured OAuth initiation/missing state, mail handoff, retries, corruption, expired leases and concurrent claims. See [verification evidence](VERIFICATION.md). Still exercise real provider sign-in and production mail; missing/disabled Google configuration; exact callback origins; duplicate/out-of-order requests; closed browser; expired/reused tokens; SMTP outage/recovery; worker crash after send; concurrent claims; fifth-attempt termination; private queue access; payload deletion on success; and no secrets/recipients/links in logs. These are acceptance requirements, not a claim that all checks have run.
