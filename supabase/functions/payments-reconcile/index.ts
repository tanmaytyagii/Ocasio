/**
 * Payment reconciliation sweep.
 *
 * Closes the hole where a payment strands in `processing` because a webhook was
 * never delivered. It does NOT introduce a second way into the payment state
 * machine: it asks the provider what happened and hands the answer to
 * reconcile_payment(), which records a payment_events row and applies the same
 * transitions the webhook path applies. Idempotency and replay protection are
 * therefore the existing ones.
 *
 * Intended to run on a schedule (Supabase cron) or be invoked by an operator.
 * It is authenticated by the service-role key and is not reachable from a
 * browser: both find_stale_payments() and reconcile_payment() are granted to
 * service_role alone.
 *
 * ---------------------------------------------------------------------------
 * WHERE A REAL PROVIDER PLUGS IN
 * ---------------------------------------------------------------------------
 * Implement ReconciliationProvider against the provider's payment-lookup API
 * and register it below. For Razorpay that is GET /payments/{id}, mapping
 * `captured` -> succeeded and `failed` -> failed, with everything else left
 * `pending`. Nothing in the database or the payment domain changes.
 *
 * Required environment (set with `supabase secrets set`, never in .env):
 *   PAYMENT_PROVIDER             provider name; defaults to "test"
 *   RECONCILE_STALE_MINUTES      threshold; defaults to 30
 *   SUPABASE_URL                 injected by the platform
 *   SUPABASE_SERVICE_ROLE_KEY    injected by the platform — server-side only,
 *                                never exposed to Vite or the browser
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** What the provider says about a payment. Deliberately includes "I can't tell". */
export type ProviderPaymentStatus = 'succeeded' | 'failed' | 'pending' | 'unknown';

export interface ReconciliationProvider {
  readonly name: string;
  /**
   * Looks up one payment. Must return 'unknown' rather than guessing when the
   * provider is unreachable or the reference is unrecognised — reconcile_payment
   * treats 'unknown' and 'pending' as "change nothing".
   */
  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatus>;
}

/**
 * Local/test provider.
 *
 * It has no backend to interrogate, so it always answers 'unknown' — the safe
 * answer, and the one that leaves the payment untouched. It exists so the sweep
 * can be exercised end to end without a real provider, not so it can settle
 * anything. Tests drive concrete outcomes by calling reconcile_payment()
 * directly with the status a real provider would have reported.
 */
const testReconciliationProvider: ReconciliationProvider = {
  name: 'test',
  getPaymentStatus: async () => 'unknown',
};

const providers = new Map<string, ReconciliationProvider>([
  [testReconciliationProvider.name, testReconciliationProvider],
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const providerName = Deno.env.get('PAYMENT_PROVIDER') ?? 'test';
  const provider = providers.get(providerName);
  if (!provider) {
    console.error('[payments-reconcile] no provider registered for', providerName);
    return new Response(JSON.stringify({ error: 'provider not configured' }), { status: 500 });
  }

  const staleMinutes = Number(Deno.env.get('RECONCILE_STALE_MINUTES') ?? '30');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: stale, error } = await supabase.rpc('find_stale_payments', {
    p_older_than_minutes: Number.isFinite(staleMinutes) ? staleMinutes : 30,
  });

  if (error) {
    console.error('[payments-reconcile]', error.code, error.message);
    return new Response(JSON.stringify({ error: 'could not list stale payments' }), { status: 500 });
  }

  const summary = { examined: 0, settled: 0, inconclusive: 0, errors: 0 };

  for (const payment of (stale ?? []) as { id: string; provider_payment_id: string | null }[]) {
    summary.examined++;

    // No provider reference means the handoff never completed. There is nothing
    // to ask about, so leave it alone rather than guessing.
    if (!payment.provider_payment_id) {
      summary.inconclusive++;
      continue;
    }

    let status: ProviderPaymentStatus;
    try {
      status = await provider.getPaymentStatus(payment.provider_payment_id);
    } catch (e) {
      // An unreachable provider is not evidence of anything.
      console.error('[payments-reconcile] lookup failed', payment.id, e);
      summary.errors++;
      continue;
    }

    // One reference per payment per sweep window, so a sweep repeated within the
    // same window applies at most once. reconcile_payment() records it in
    // payment_events, where UNIQUE (provider, provider_event_id) enforces that.
    const ref = `${payment.id}:${new Date().toISOString().slice(0, 13)}`;

    const { error: reconcileError } = await supabase.rpc('reconcile_payment', {
      p_payment_id: payment.id,
      p_provider_status: status,
      p_reconciliation_ref: ref,
    });

    if (reconcileError) {
      console.error('[payments-reconcile]', payment.id, reconcileError.message);
      summary.errors++;
    } else if (status === 'succeeded' || status === 'failed') {
      summary.settled++;
    } else {
      summary.inconclusive++;
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
