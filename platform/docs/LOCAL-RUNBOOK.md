# Local development runbook

Run the application commands from `platform/`. This is a local development procedure, not a production deployment procedure.

## Prerequisites

- Node.js 22 or later and npm.
- Docker with its daemon running for the supplied Compose database, **or** a separately supplied compatible PostgreSQL database.
- The environment configuration required by the workspace's example files. Keep real credentials out of committed files and screenshots.

Run `npm run doctor` (or `node scripts/doctor.mjs`) to inspect Node, local configuration-file presence and Docker availability. It prints no environment values, starts nothing and does not connect to the database. Docker warnings are advisory when using an external database.

## Configure and start

1. Install the workspace dependencies with `npm install`.
2. Run `npm run setup:local`. It preserves existing settings and creates a missing random `SESSION_SECRET` without printing it. The local database is `ocasio_dev`, user `ocasio`, password `local_dev_only`, host `127.0.0.1`, port `55432`. Do not use these credentials publicly. `.env` supplies database/API/origin/session configuration. Use the exact `WEB_ORIGIN` (default `http://127.0.0.1:3000`) in the browser. `apps/web/.env.local` can configure `INTERNAL_API_URL`; rebuild after changing the proxy upstream for the compiled preview.
3. For the local Compose database, run `npm run db:up`. For an independent database, skip that command and point the backend/migration configuration at the intended database.
4. Verify the configured destination before running `npm run db:migrate`.
5. Run `npm run db:seed` only against an intended local development database. A seed is not vendor onboarding or a production content publishing process.
6. Start local email capture with `docker compose up -d mailpit` (inbox `http://127.0.0.1:8035`); then run `npm run dev`. The frontend is at `http://127.0.0.1:3000`; the API is at `http://127.0.0.1:4100`, with the API bound to `127.0.0.1` by default.

An API response or health endpoint alone does not prove database migrations, authorisation or complete customer journeys work. Use the actual documented checks as they are added. A health response must distinguish its dependency status truthfully.

## Database backup rehearsal

Run backups deliberately; they are not automated by startup. Keep backups private and choose an appropriate retention policy. The root `db:backup` script is the database backup entry point; inspect its documented destination/arguments before use. For the supplied Compose service, a plain-SQL backup can also be written explicitly to a **new** file:

```sh
docker compose exec -T db pg_dump -U ocasio ocasio_dev > ocasio-dev-rehearsal.sql
```

The shell redirection overwrites an existing same-named file; choose a fresh filename before running it. Check the command exit status and resulting file before considering the backup successful.

The separate custom-format example below requires PostgreSQL client tools (`pg_dump`, `createdb`, `pg_restore`, `psql`) compatible with the database server. Its restore command is for the `.dump` file it creates, **not** for the plain-SQL file above. The commands use the isolated local development credentials above.

Create a backup of the local development database:

```sh
PGPASSWORD=local_dev_only pg_dump --host=127.0.0.1 --port=55432 --username=ocasio --dbname=ocasio_dev --format=custom --no-owner --no-acl --file=ocasio-dev-rehearsal.dump
```

Create a **new, empty** rehearsal database. If this name already exists, stop and choose a fresh name rather than deleting or overwriting it:

```sh
PGPASSWORD=local_dev_only createdb --host=127.0.0.1 --port=55432 --username=ocasio ocasio_restore_rehearsal
```

Restore to the rehearsal database, never over the application database:

```sh
PGPASSWORD=local_dev_only pg_restore --host=127.0.0.1 --port=55432 --username=ocasio --dbname=ocasio_restore_rehearsal --no-owner --no-acl --exit-on-error ocasio-dev-rehearsal.dump
```

Inspect restored tables:

```sh
PGPASSWORD=local_dev_only psql --host=127.0.0.1 --port=55432 --username=ocasio --dbname=ocasio_restore_rehearsal --command='\dt'
```

Record backup time, restore duration, command outcomes, table/count comparisons and verification of representative records and constraints. A successful `pg_restore` exit alone is not a full recovery rehearsal. Application integration checks against the restored database should use an isolated process/configuration so the running development application is not silently redirected. The dump excludes external object storage, identity/provider configuration and secrets; those need their own recovery procedures when implemented.

No cleanup/deletion commands are included. Retain or remove rehearsal artifacts through an intentional local decision. Never use volume deletion, schema resets or restore-over-existing-data commands as routine startup steps.

## Troubleshooting boundaries

If Docker is missing or its daemon is stopped, `db:up` cannot start the supplied database. An external database still needs an accessible endpoint and appropriate migration privileges. If port 55432 is already used, inspect the owning service before changing configuration. Keep frontend/API origins and the actual configured ports aligned; changing a port does not resolve an authentication or authorisation error.

Do not share raw environment files, database URLs, provider payloads or private customer/vendor documents when reporting a problem. Give the failed step, a sanitised error and the relevant process/database status instead.
