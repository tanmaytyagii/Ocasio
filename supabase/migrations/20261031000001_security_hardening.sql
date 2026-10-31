-- ============================================================================
-- Ocasio — security hardening (audit 2026-10-31)
--
-- Defence in depth from the security audit (docs/SECURITY_AUDIT.md). None of
-- these was exploitable through the APIs Ocasio exposes — PostgREST has no verb
-- for TRUNCATE, and every function below already refused an anonymous caller —
-- but each removed a privilege nothing legitimate uses, and each would have
-- turned a future mistake into a hole.
--
-- No behaviour a client relies on changes. The test suite runs unchanged, and
-- tests/security-hardening.test.ts pins every revocation here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table privileges nothing uses
-- ---------------------------------------------------------------------------
--
-- Supabase's defaults grant anon and authenticated every table privilege,
-- leaving RLS to decide. RLS governs SELECT, INSERT, UPDATE and DELETE — not
-- TRUNCATE, which empties a table regardless of policies. TRIGGER and
-- REFERENCES are DDL-level rights no client needs. Reachable today only by a
-- direct database login, never through PostgREST; revoked so that stays true.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Tables created by later migrations (owned by postgres) start without them.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Signed-in entry points are not for anon
-- ---------------------------------------------------------------------------
--
-- Each of these raises "You must be signed in" (or returns nothing) without an
-- auth.uid(), so anon could only ever get an error. Revoking execute means the
-- anon key cannot reach the function body at all.
--
-- Deliberately NOT revoked: functions that row-level security policies call
-- while anon is reading (is_active_vendor, owns_vendor, owns_vendor_object),
-- the trigger functions, search and filter functions used by the public
-- marketplace, and current_user_role(), which answers null for anon.
revoke execute on function public.cancel_payment(uuid) from anon;
revoke execute on function public.create_booking(uuid, date, text, text) from anon;
revoke execute on function public.create_payment_for_booking(uuid, text, text) from anon;
revoke execute on function public.create_review(uuid, smallint, text) from anon;
revoke execute on function public.request_vendor_onboarding(text, text, text, text, text, text, text) from anon;
revoke execute on function public.moderate_vendor(uuid, text, text) from anon;
revoke execute on function public.admin_list_vendors(public.vendor_status, text) from anon;

-- ---------------------------------------------------------------------------
-- 3. Pinned search_path for the remaining functions
-- ---------------------------------------------------------------------------
--
-- Every SECURITY DEFINER function already pins search_path. These four are
-- SECURITY INVOKER, so a mutable search_path is a smaller risk — but it is the
-- class of bug that lets a caller shadow a table or function with their own,
-- and Supabase's linter flags it. All four schema-qualify their tables.
--
-- search_vendors() uses pg_trgm's % operator and similarity(), which live in
-- public, so it keeps public on its path; pg_temp comes last so a temporary
-- table can never shadow a real one.
alter function public.category_counts() set search_path = '';
alter function public.filter_options() set search_path = '';
alter function public.find_stale_payments(integer) set search_path = '';
alter function public.search_vendors(text, text, text, integer, integer, numeric, text, text, integer, integer)
  set search_path = public, pg_temp;
