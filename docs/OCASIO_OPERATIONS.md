# Ocasio — Operations

**Audience:** Whoever runs Ocasio in production.
**Status:** Phase 5.1.

---

## 1. Scheduled payment reconciliation

A payment strands in `processing` when a provider webhook is never delivered.
The sweep rescues those. Phase 5 built it; Phase 5.1 schedules it.

```
pg_cron (*/15 * * * *)
   └─► public.invoke_payment_reconciliation()        [service_role only]
          └─► pg_net POST  ──►  payments-reconcile   [edge function]
                                   └─► reconcile_payment()  [service_role only]
```

There is **one** reconciliation implementation. The scheduler only invokes it;
every rule — idempotency, replay protection, "an inconclusive answer changes
nothing" — lives where it did before, in `reconcile_payment()`.

### Required setup

The sweep **fails closed**. Until both secrets exist it does nothing, logs a
warning, and writes a `reconciliation.sweep_skipped` audit row. A silent no-op
would let payments strand exactly the way this is meant to prevent.

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/payments-reconcile',
  'ocasio_reconcile_url'
);
select vault.create_secret('<service-role key>', 'ocasio_reconcile_service_key');
```

They live in Vault, never in a migration, a cron command, `.env`, or any table a
client can read. Only the queued `net_request_id` is audited — never the key.

Edge-function environment (`supabase secrets set`):

| Variable | Default | Meaning |
|---|---|---|
| `PAYMENT_PROVIDER` | `test` | Which reconciliation adapter to use |
| `RECONCILE_STALE_MINUTES` | `30` | How long counts as stranded |

### Cadence

Every 15 minutes, against a 30-minute staleness threshold. That bounds how long
a stranded payment waits without polling the provider excessively. Re-running
within the same hour is harmless: the event id is derived from the sweep
reference and `UNIQUE (provider, provider_event_id)` makes a repeat apply once.

### Checking it

```sql
-- Is the job registered?
select jobname, schedule, active from cron.job
where jobname = 'ocasio-reconcile-stale-payments';

-- Recent runs
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'ocasio-reconcile-stale-payments')
order by start_time desc limit 10;

-- What the sweep did
select action, metadata, created_at from public.audit_log
where action like 'reconciliation.%' or action like 'payment.reconcil%'
order by created_at desc limit 20;

-- What is currently stranded
select * from public.find_stale_payments(30);

-- Trigger one by hand
select public.invoke_payment_reconciliation();
```

### Audit actions

| Action | Meaning |
|---|---|
| `reconciliation.sweep_invoked` | Request queued to the edge function |
| `reconciliation.sweep_skipped` | Vault not configured — **investigate** |
| `payment.reconciled` | A stranded payment was settled from a provider answer |
| `payment.reconciliation_inconclusive` | Provider said `pending`/`unknown`; nothing changed |
| `payment.reconciliation_skipped` | Already settled; left alone |

### Limitation

`cron.job` is not exposed through PostgREST, so the schedule itself is not
covered by the automated suite — the function the job runs is, along with its
fail-closed path and its authorization. The registration is verified with the
query above. The edge function likewise runs on Deno and is not exercised in CI;
the database function it calls is.

---

## 2. Demo catalogue

The 40 seeded vendors carry fabricated ratings, flagged `rating_is_demo = true`.
The UI labels them as sample data. The flag clears permanently the first time a
real review lands, and the aggregate becomes the real average.

Identify demo rows:

```sql
select count(*) from public.vendors where rating_is_demo;
select count(*) from public.profiles where full_name = 'Ocasio Demo Vendor';
```

Before real vendors onboard, demo data can be removed — but note that a demo
vendor with real bookings or payments will not delete (see
[`OCASIO_DATA_RETENTION.md`](./OCASIO_DATA_RETENTION.md)).

---

## 3. Account deletion

Not supported for users with payment or review history. See
[`OCASIO_DATA_RETENTION.md`](./OCASIO_DATA_RETENTION.md) — it needs a product
decision, not a code change.
