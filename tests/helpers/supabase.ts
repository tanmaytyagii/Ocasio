/**
 * Test harness for the local Supabase stack.
 *
 * These are INTEGRATION tests: they exercise real Row Level Security inside
 * Postgres. Mocking Supabase here would prove nothing about RLS, which is the
 * only thing actually enforcing authorization.
 *
 * Requires `npx supabase start`. See docs/OCASIO_DATABASE.md for setup.
 *
 * The keys below are Supabase's published, well-known local development keys.
 * They are identical on every developer machine, grant access only to a
 * throwaway container on 127.0.0.1, and are not secrets.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** Signed-out client: exactly what a search engine or logged-out visitor gets. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Bypasses RLS. Used only to arrange fixtures, never as the system under test. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

let counter = 0;

/** Creates a confirmed user and returns a client authenticated as them. */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = serviceClient();
  const email = `test-${label}-${Date.now()}-${counter++}@ocasio.test`;
  const password = 'test-password-12345';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create test user: ${error.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`could not sign in test user: ${signInError.message}`);

  return { id: data.user!.id, email, password, client };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  await serviceClient().auth.admin.deleteUser(user.id);
}

/** True when the local stack is reachable, so tests can skip with a clear reason. */
export async function stackIsRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Columns anon may read from vendors.
 *
 * owner_id is excluded: migration 20260919000003 drops the table-level SELECT
 * grant for anon and re-grants these columns individually, so `select('*')`
 * is denied. Tests query the way the application does.
 */
export const PUBLIC_VENDOR_COLUMNS =
  'id, slug, business_name, description, category, location, status, phone, email, website, business_hours, hero_image_url, rating, review_count, starting_price, created_at, updated_at';
