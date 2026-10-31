/**
 * Creates (or reopens) the Razorpay order for a booking. See
 * ../_shared/createOrder.ts for the steps and the rules.
 *
 * Environment (set with `supabase secrets set`, never in .env or VITE_*):
 *   RAZORPAY_KEY_ID            rzp_test_… or rzp_live_…; returned to Checkout
 *   RAZORPAY_KEY_SECRET        server-only; never leaves this function
 *   RAZORPAY_API_BASE          development only — a local stand-in for Razorpay
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *                              injected by the platform
 *
 * Called by signed-in customers, so Supabase's JWT check stays on.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { supabaseDb } from '../_shared/db.ts';
import { createRazorpayApi } from '../_shared/razorpay.ts';
import { handleCreateOrder } from '../_shared/createOrder.ts';

const keyId = Deno.env.get('RAZORPAY_KEY_ID') || null;
const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || null;

const deps = {
  db: supabaseDb((url, key, options) => createClient(url, key, options), {
    url: Deno.env.get('SUPABASE_URL')!,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }),
  razorpay: keyId && keySecret
    ? createRazorpayApi({ keyId, keySecret, baseUrl: Deno.env.get('RAZORPAY_API_BASE') || undefined })
    : null,
  keyId,
};

Deno.serve((req) => handleCreateOrder(req, deps));
