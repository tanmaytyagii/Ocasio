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
 */
import { supabase } from '../lib/supabase';
import type { Payment, PaymentStatus, Refund } from '../types/database';
import { configuredProviderName, getProvider } from './payments/provider';
// Registers the deterministic local/test adapter. A real provider registers
// itself the same way; see docs/OCASIO_PAYMENTS.md.
import './payments/testProvider';

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
 * Hands the payment to the provider and records the reference.
 *
 * Resolving means the payment is `processing` — handed over, not paid. Only a
 * webhook can settle it.
 */
export async function authorizeAndStartPayment(payment: Payment): Promise<Payment> {
  const provider = getProvider(payment.provider);

  const { providerPaymentId } = await provider.authorize({
    paymentId: payment.id,
    amountMinor: payment.amount_minor,
    currency: payment.currency,
    bookingReference: payment.booking_id,
  });

  const { data, error } = await supabase.rpc('start_payment', {
    p_payment_id: payment.id,
    p_provider_payment_id: providerPaymentId,
  });
  if (error) fail(error, 'Could not hand this payment to the provider.');
  return data as Payment;
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
 */
export async function refundPayment(
  paymentId: string,
  amountMinor: number,
  idempotencyKey: string,
  reason?: string,
): Promise<Refund> {
  const { data, error } = await supabase.rpc('refund_payment', {
    p_payment_id: paymentId,
    p_amount_minor: amountMinor,
    p_idempotency_key: idempotencyKey,
    p_reason: reason?.trim() || null,
  });
  if (error) fail(error, 'Could not start a refund.');
  return data as Refund;
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

/** A booking is payable only once the vendor has accepted it. */
export function isBookingPayable(bookingStatus: string, payment: Payment | null): boolean {
  if (bookingStatus !== 'accepted') return false;
  if (!payment) return true;
  return payment.status === 'failed' || payment.status === 'cancelled';
}

export function refundableBalanceMinor(payment: Payment): number {
  return payment.amount_minor - payment.amount_refunded_minor;
}

export function canVendorRefund(payment: Payment): boolean {
  return (
    (payment.status === 'succeeded' || payment.status === 'partially_refunded') &&
    refundableBalanceMinor(payment) > 0
  );
}
