/**
 * Razorpay webhook endpoint.
 *
 * This is the ONLY path by which a Razorpay payment or refund reaches a final
 * state. The browser cannot do it: the database functions this calls are
 * granted to service_role alone and are SECURITY INVOKER, so even a mistaken
 * grant to `authenticated` would still be stopped by RLS.
 *
 * See ../_shared/webhook.ts for verification, idempotency and status codes.
 *
 * Environment (set with `supabase secrets set`, never in .env or VITE_*):
 *   RAZORPAY_WEBHOOK_SECRET    the secret entered when creating the webhook in
 *                              the Razorpay Dashboard. Without it, every
 *                              delivery is refused.
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *                              injected by the platform — server-side only
 *
 * Razorpay sends no Supabase JWT, so this function is deployed with JWT
 * verification off (supabase/config.toml). The Razorpay signature is the
 * authentication.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { supabaseDb } from '../_shared/db.ts';
import { handleWebhook } from '../_shared/webhook.ts';

const deps = {
  db: supabaseDb((url, key, options) => createClient(url, key, options), {
    url: Deno.env.get('SUPABASE_URL')!,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }),
  webhookSecret: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || null,
};

Deno.serve((req) => handleWebhook(req, deps));
