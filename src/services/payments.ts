/**
 * Payment data access.
 *
 * Mirrors the booking service: reads go through RLS-protected selects, writes
 * go through SECURITY DEFINER functions, and there is no client-side
 * authorization logic. The database decides; this module reports.
 *
 * What the browser can do: create a payment for its own accepted booking, hand
 * it to the provider, cancel it before settlement. What it cannot do: set an
 * amount, set a status, settle a payment, or refund one. Settlement arrives
 * only as a signed webhook processed under the service role.
 *
 * Razorpay payments and refunds go through edge functions (payments-create-order,
 * payments-refund), because they need the server-held Razorpay secret.
 */
import { supabase } from '../lib/supabase';
import type { Payment, PaymentStatus, Refund } from '../types/database';
import { configuredProviderName, getProvider, type AuthorizeResult } from './payments/provider';
// Each adapter registers itself; VITE_PAYMENT_PROVIDER picks one. See
// docs/OCASIO_PAYMENTS.md.
import './payments/testProvider';
import './payments/razorpayProvider';

const PAYMENT_COLUMNS =
  'id, booking_id, customer_id, vendor_id, amount_minor, currency, amount_refunded_minor, status, provider, provider_payment_id, processing_since, idempotency_key, metadata, created_at, updated_at';

const REFUND_COLUMNS =
  'id, payment_id, amount_minor, reason, status, provider_refund_id, idempotency_key, initiated_by, created_at, updated_at';

function fail(error: { message: string; code?: string }, fallback: string): never {
  if (error.code === '23505') {
    console.error('[ocasio] payment:', error.code, error.message);
    throw new Error('A payment is already in progress for this booking.');
  }
  const looksInternal =
    !error.message ||
    /violates|constraint|relation|column|permission denied|JWT|row-level/i.test(error.message);
  console.error('[ocasio] payment:', error.code ?? '', error.message);
  throw new Error(looksInternal ? fallback : error.message);
}

/** Rupees for display. Amounts are stored in paise. */
export function minorToRupees(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

export function formatMinor(amountMinor: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${minorToRupees(amountMinor).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Creates a payment for a booking, or returns the existing one for this key.
 *
 * The amount is not a parameter. The server reads it from the booking, so a
 * tampered client cannot change what is charged.
 */
export async function createPaymentForBooking(
  bookingId: string,
  idempotencyKey: string,
): Promise<Payment> {
  const { data, error } = await supabase.rpc('create_payment_for_booking', {
    p_booking_id: bookingId,
    p_idempotency_key: idempotencyKey,
    p_provider: configuredProviderName(),
  });
  if (error) fail(error, 'Could not start a payment for this booking.');
  return data as Payment;
}

/**
 * Hands the payment to the provider and records the reference — the flow for
 * providers that do not need a server-created order (the test adapter).
 *
 * Resolving means the payment is `processing` — handed over, not paid. Only a
 * webhook can settle it.
 */
export async function authorizeAndStartPayment(payment: Payment): Promise<AuthorizeResult> {
  const provider = getProvider(payment.provider);

  const result = await provider.authorize({
    paymentId: payment.id,
    amountMinor: payment.amount_minor,
    currency: payment.currency,
    bookingReference: payment.booking_id,
  });
  if (result.outcome !== 'submitted') return result;

  const { error } = await supabase.rpc('start_payment', {
    p_payment_id: payment.id,
    p_provider_payment_id: result.providerPaymentId ?? null,
  });
  if (error) fail(error, 'Could not hand this payment to the provider.');
  return result;
}

/**
 * Calls a payment edge function and surfaces its own message on failure. The
 * functions write their errors for people; anything unreadable becomes
 * `fallback`.
 */
async function invokePaymentFunction<T>(
  name: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return data as T;

  let message = fallback;
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const parsed = (await context.clone().json()) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error) message = parsed.error;
    } catch {
      // Not JSON; keep the fallback.
    }
  }
  console.error(`[ocasio] ${name}:`, error.message);
  throw new Error(message);
}

interface ServerOrder {
  payment_id: string;
  order_id: string;
  amount_minor: number;
  currency: string;
  key_id: string;
}

/**
 * True when the configured provider confirms payments later, by webhook, after
 * its own checkout closes (Razorpay). The panel then waits for that verdict.
 */
export function startsWithServerOrder(): boolean {
  return getProvider(configuredProviderName()).usesServerOrder;
}

/**
 * Starts — or resumes — paying for a booking with the configured provider.
 *
 * For Razorpay, the server creates the payment and the order from the booking
 * (the browser sends only the booking id), then Checkout opens on that order.
 * Calling it again for the same booking reopens the same order.
 *
 * Whatever it resolves with, nothing here marks a payment paid: that is the
 * webhook's job alone.
 */
export async function startPayment(bookingId: string, prefillEmail?: string | null): Promise<AuthorizeResult> {
  const provider = getProvider(configuredProviderName());

  if (provider.usesServerOrder) {
    const order = await invokePaymentFunction<ServerOrder>(
      'payments-create-order',
      { booking_id: bookingId },
      'Could not start the payment. Please try again.',
    );
    return provider.authorize({
      paymentId: order.payment_id,
      amountMinor: order.amount_minor,
      currency: order.currency,
      bookingReference: bookingId,
      order: { id: order.order_id, publicKey: order.key_id },
      prefill: { email: prefillEmail ?? undefined },
    });
  }

  // Scoped to the booking so a double submit reuses the same payment instead
  // of opening a second one.
  const payment = await createPaymentForBooking(bookingId, `booking:${bookingId}:payment`);
  return authorizeAndStartPayment(payment);
}

export async function cancelPayment(paymentId: string): Promise<Payment> {
  const { data, error } = await supabase.rpc('cancel_payment', { p_payment_id: paymentId });
  if (error) fail(error, 'Could not cancel this payment.');
  return data as Payment;
}

/** The payment for a booking, if one exists. RLS scopes this to the parties. */
export async function getPaymentForBooking(bookingId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail(error, 'Could not load payment details.');
  return (data as unknown as Payment) ?? null;
}

export async function getRefundsForPayment(paymentId: string): Promise<Refund[]> {
  const { data, error } = await supabase
    .from('refunds')
    .select(REFUND_COLUMNS)
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });

  if (error) fail(error, 'Could not load refunds.');
  return (data ?? []) as unknown as Refund[];
}

/**
 * Initiates a refund. Vendor owner or admin only — enforced in the database,
 * not here.
 *
 * Razorpay payments are refunded through payments-refund, which sends the
 * request to Razorpay; the refund stays "requested" until Razorpay's webhook
 * confirms it. Calling again with the same key resends the same refund — it
 * never creates a second one.
 */
export async function refundPayment(
  payment: Pick<Payment, 'id' | 'provider'>,
  amountMinor: number,
  idempotencyKey: string,
  reason?: string | null,
): Promise<void> {
  if (payment.provider === 'razorpay') {
    await invokePaymentFunction(
      'payments-refund',
      {
        payment_id: payment.id,
        amount_minor: amountMinor,
        idempotency_key: idempotencyKey,
        reason: reason?.trim() || null,
      },
      'Could not start a refund.',
    );
    return;
  }

  const { error } = await supabase.rpc('refund_payment', {
    p_payment_id: payment.id,
    p_amount_minor: amountMinor,
    p_idempotency_key: idempotencyKey,
    p_reason: reason?.trim() || null,
  });
  if (error) fail(error, 'Could not start a refund.');
}

// ---------------------------------------------------------------------------
// Presentation hints
//
// These mirror the lifecycle in migration 20260919000005 so the UI can hide
// impossible actions. They are not a security boundary.
// ---------------------------------------------------------------------------

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Payment not started',
  processing: 'Awaiting payment confirmation',
  succeeded: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Payment cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

/**
 * A booking is payable only once the vendor has accepted it. A Razorpay
 * payment still awaiting confirmation can be resumed: it reopens the same
 * order, so it cannot charge twice.
 */
export function isBookingPayable(bookingStatus: string, payment: Payment | null): boolean {
  if (bookingStatus !== 'accepted') return false;
  if (!payment) return true;
  if (payment.status === 'failed' || payment.status === 'cancelled') return true;
  return payment.provider === 'razorpay' && payment.status === 'processing';
}

/**
 * What can still be refunded. Requested refunds count against it, exactly as
 * the database counts them, so the form never offers more than it will accept.
 */
export function refundableBalanceMinor(payment: Payment, refunds: Refund[]): number {
  const reserved = refunds
    .filter((r) => r.status === 'pending' || r.status === 'succeeded')
    .reduce((sum, r) => sum + r.amount_minor, 0);
  return Math.max(0, payment.amount_minor - Math.max(reserved, payment.amount_refunded_minor));
}

export function canVendorRefund(payment: Payment, refunds: Refund[]): boolean {
  return (
    (payment.status === 'succeeded' || payment.status === 'partially_refunded') &&
    refundableBalanceMinor(payment, refunds) > 0
  );
}

/**
 * A Razorpay refund that was saved but never reached Razorpay — the request
 * timed out or Razorpay was unavailable. Sending it again is safe: Razorpay
 * treats the refund's id as an idempotency key.
 */
export function canResendRefund(payment: Payment, refund: Refund): boolean {
  return payment.provider === 'razorpay' && refund.status === 'pending' && !refund.provider_refund_id;
}
