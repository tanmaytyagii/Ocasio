# Foundation architecture decisions

Status: initial implementation foundation. These decisions do not settle the unresolved commercial or operational policies in the product blueprint.

## Application boundaries

The platform uses npm workspaces. The Next.js frontend serves the website on local port 3000. The NestJS API runs on local port 4100. PostgreSQL owns relational persistence. The local Compose database is available on port 55432 so that the usual PostgreSQL port can remain available to other local projects.

The frontend presents published information and user intent. The API is responsible for validation, authorisation once identity is implemented, domain transitions and database access. A browser control, hidden page or frontend role check is never sufficient authorisation.

## PostgreSQL access: explicit `pg` for the foundation

Use the `pg` driver and explicit SQL initially so transaction boundaries, SQL constraints and locking behaviour can be inspected directly. This is a deliberate foundation choice, not a permanent prohibition on an ORM. An ORM has not been selected. Any later selection needs a documented migration, query, transaction and locking strategy rather than silently replacing the integrity model.

Future booking acceptance must recheck vendor eligibility, exact offer version and resource availability transactionally. The founder-confirmed business rule is vendor acceptance confirms without a deposit. Service payment schedules are separate, follow disclosed vendor terms and cannot quietly reintroduce a deposit prerequisite.

## Operational dimensions remain separate

Do not collapse vendor admission, fee acceptance, publication, capacity and eligibility into a single approved flag. Do not collapse customer requests, vendor confirmation, fulfilment, payment, refunds and settlement into one booking status. Paid assistance needs its own accepted scope, assignment and task/approval history.

Multi-vendor packages retain their accepted services when another vendor declines; a customer-selected replacement needs fresh scope, price and acceptance checks. The foundation is not evidence that those workflows are implemented.

## Configuration and environments

Local credentials are for isolated development only: database `ocasio_dev`, user `ocasio`, password `local_dev_only`. They are not production secrets. Configure separate credentials, database instances, provider accounts and access policies for staging and production. Do not expose database connection strings to the frontend or print them in diagnostic output.

## Current non-decisions

Customer email/password plus Google is confirmed; production session/TLS deployment policy, supporting providers, public launch coverage, provider commercial eligibility, approved cancellation policy, tax/invoicing treatment and legal sign-off remain open. Anonymous server sessions now use express-session with a PostgreSQL store; CSRF checks guard routed unsafe commands. Same-origin Next.js forwarding preserves NestJS authority. See [security details](SECURITY.md). No live payment collection or vendor settlement capability is implied.
