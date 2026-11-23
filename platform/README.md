# Ocasio · fresh platform

Independent Next.js + NestJS + PostgreSQL implementation. The application at the repository root is historical reference only and is unchanged.

## Local development

Use Node 22 and Docker. From this directory:

```sh
npm ci
npm run setup:local
npm run db:up
docker compose up -d mailpit
npm run db:migrate
npm run db:seed
npm run dev
```

Local setup preserves existing settings and generates a missing session signing secret without printing it. Database is local-only at port 55432. Website: [localhost:3000](http://127.0.0.1:3000). API: [localhost:4100](http://127.0.0.1:4100/api/v1/health/ready). Development API docs: [OpenAPI](http://127.0.0.1:4100/api/docs). Use the configured canonical web origin (default `http://127.0.0.1:3000`) for CSRF-protected requests.

Markets are research-only records, not bookable supply. No fake vendors, reviews, bookings or successful payments are seeded. The initial public design is provisional, not an approved final brand kit.

## Checks and operations

```sh
npm run doctor
npm run typecheck
npm test
npm run test:integration
npm run build
npm run preview
```

Integration tests create and remove only their own newly named test database. The configured application database is never reset. `preview` serves the compiled local build; it is not a hosted production deployment.

`npm run db:probe -- unique-key` atomically writes a local-only diagnostic event plus audit record. The worker produces a deduplicated receipt; it does not invoke financial providers. The worker separately delivers authentication mail to local Mailpit. `npm run db:backup` writes a private ignored SQL backup. See [runbook](docs/LOCAL-RUNBOOK.md), [architecture](docs/ARCHITECTURE.md), [implementation status](docs/IMPLEMENTATION-STATUS.md) and [verification evidence](docs/VERIFICATION.md).

PostgreSQL-backed anonymous sessions and CSRF verification now exist; see [security scope](docs/SECURITY.md). Email/password identity is implemented, with optional Google configuration; authenticated business resource permissions remain gated work, along with vendor admission, booking/payment/assistance functionality and legal approvals. No live transaction endpoint is exposed by this foundation.

Continue from [session handoff](../SESSION-HANDOFF.md). Account setup and local email: [authentication setup](docs/AUTH-SETUP.md).
