/**
 * Security invariants (audit 2026-10-31, docs/SECURITY_AUDIT.md).
 *
 * Two kinds of test:
 *
 *   - regression tests for what the audit fixed (migration
 *     20261031000001_security_hardening.sql, the payments-reconcile caller
 *     check, the password minimum);
 *   - invariants every FUTURE migration must keep — RLS on every table, no
 *     client write policies on money or trust tables, pinned search_path on
 *     every application function. A new table or function that breaks one of
 *     them fails here, before it ships.
 *
 * Catalog checks read Postgres directly (`pg`); behaviour checks go through
 * PostgREST and Auth exactly as a browser would.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { anonClient, serviceClient, stackIsRunning } from './helpers/supabase';
import { constantTimeEqual, hasServiceRoleKey } from '../supabase/functions/_shared/http.ts';
import { MIN_PASSWORD_LENGTH } from '../src/lib/authErrors';

const running = await stackIsRunning();
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let db: pg.Client;
beforeAll(async () => {
  if (!running) return;
  db = new pg.Client(DB_URL);
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});

/** Functions Ocasio wrote — not those an extension installed into public. */
const APP_FUNCTIONS = `
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;

describe.runIf(running)('database invariants', () => {
  it('every table in public has row-level security enabled', async () => {
    const { rows } = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('money and trust tables have no INSERT, UPDATE or DELETE policy for any client', async () => {
    // Writes to these go through functions that re-derive authorization. A
    // write policy here would be a second door.
    const { rows } = await db.query(`
      select tablename, policyname, cmd from pg_policies
      where schemaname = 'public'
        and tablename in ('bookings', 'booking_status_history', 'payments', 'payment_events',
                          'refunds', 'reviews', 'audit_log')
        and cmd <> 'SELECT'`);
    expect(rows).toEqual([]);
  });

  it('every application function pins its search_path', async () => {
    const { rows } = await db.query(`
      select p.oid::regprocedure::text as fn ${APP_FUNCTIONS}
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it('anon and authenticated cannot TRUNCATE, or add triggers or references to, any table', async () => {
    const { rows } = await db.query(`
      select c.relname, r.role, priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['anon', 'authenticated']) as r(role)
      cross join unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES']) as priv
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege(r.role, c.oid, priv)`);
    expect(rows).toEqual([]);
  });

  it('anon cannot execute any function that writes, except through a policy-checked path', async () => {
    // Every SECURITY DEFINER function anon can still execute is listed here on
    // purpose: RLS helpers that public reads depend on, trigger functions, and
    // current_user_role(), which answers null for anon. Adding to this list is
    // a decision, not an accident.
    const { rows } = await db.query(`
      select p.proname ${APP_FUNCTIONS}
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(rows.map((r) => r.proname)).toEqual([
      'current_user_role',
      'is_active_vendor',
      'is_admin',
      'owns_vendor',
      'owns_vendor_object',
    ]);
  });
});

describe.runIf(running)('signed-in entry points refuse the anon key outright', () => {
  const calls: Array<[string, Record<string, unknown>]> = [
    ['create_booking', { p_vendor_service_id: '00000000-0000-4000-8000-000000000000', p_event_date: '2030-01-01', p_event_location: 'x' }],
    ['create_payment_for_booking', { p_booking_id: '00000000-0000-4000-8000-000000000000', p_idempotency_key: 'k' }],
    ['cancel_payment', { p_payment_id: '00000000-0000-4000-8000-000000000000' }],
    ['create_review', { p_booking_id: '00000000-0000-4000-8000-000000000000', p_rating: 5 }],
    ['request_vendor_onboarding', { p_business_name: 'x', p_category: 'Venues', p_location: 'Pune' }],
    ['moderate_vendor', { p_vendor_id: '00000000-0000-4000-8000-000000000000', p_action: 'approve' }],
    ['admin_list_vendors', {}],
  ];

  for (const [fn, args] of calls) {
    it(`${fn}: permission denied before the function body runs`, async () => {
      const { error } = await anonClient().rpc(fn, args);
      expect(error?.message).toMatch(/permission denied/i);
    });
  }
});

describe.runIf(running)('password policy', () => {
  it(`the auth server rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: `short-pw-${Date.now()}@ocasio.test`,
      password: 'Ab1'.padEnd(MIN_PASSWORD_LENGTH - 1, 'x'),
    });
    // If the policy is not in force, do not leave the account behind.
    if (data.user) await serviceClient().auth.admin.deleteUser(data.user.id);
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe('scheduler-only edge functions (payments-reconcile)', () => {
  const SERVICE = 'service-role-key-value-0123456789';
  const request = (authorization?: string) =>
    new Request('http://localhost/payments-reconcile', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    });

  it('accept only the service-role key itself', () => {
    expect(hasServiceRoleKey(request(`Bearer ${SERVICE}`), SERVICE)).toBe(true);
    expect(hasServiceRoleKey(request(`bearer ${SERVICE}`), SERVICE)).toBe(true);
  });

  it('refuse the anon key, a user token, a near miss, or nothing', () => {
    // The anon key is a valid JWT, which is exactly why a gateway JWT check
    // alone let anyone call this function.
    expect(hasServiceRoleKey(request('Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln'), SERVICE)).toBe(false);
    expect(hasServiceRoleKey(request(`Bearer ${SERVICE}x`), SERVICE)).toBe(false);
    expect(hasServiceRoleKey(request(`Bearer ${SERVICE.slice(0, -1)}`), SERVICE)).toBe(false);
    expect(hasServiceRoleKey(request(SERVICE), SERVICE)).toBe(false);
    expect(hasServiceRoleKey(request(), SERVICE)).toBe(false);
  });

  it('fail closed when the function has no service-role key configured', () => {
    expect(hasServiceRoleKey(request(`Bearer ${SERVICE}`), undefined)).toBe(false);
    expect(hasServiceRoleKey(request('Bearer '), '')).toBe(false);
  });

  it('compare in constant time over equal-length input', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
