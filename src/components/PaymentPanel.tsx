import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Info, RotateCcw } from 'lucide-react';
import {
  authorizeAndStartPayment,
  canVendorRefund,
  cancelPayment,
  createPaymentForBooking,
  formatMinor,
  getPaymentForBooking,
  getRefundsForPayment,
  isBookingPayable,
  refundPayment,
  refundableBalanceMinor,
  PAYMENT_STATUS_LABELS,
} from '../services/payments';
import type { BookingWithDetails, Payment, PaymentStatus, Refund } from '../types/database';

/**
 * Payment section of a booking.
 *
 * Shown to both parties, with different actions: the customer can pay or
 * abandon an unsettled attempt; the vendor can refund a settled one. Which
 * buttons appear is a presentation decision — the database re-checks every
 * call, so hiding one stops nothing on its own.
 *
 * The panel never claims a payment succeeded on the strength of a local
 * action. Handing the payment to the provider moves it to "awaiting
 * confirmation", and only a webhook makes it "Paid".
 */
const BADGE: Record<PaymentStatus, string> = {
  pending: 'bg-canvas text-ink-soft border-line',
  processing: 'bg-amber-100 text-amber-800 border-amber-200',
  succeeded: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-canvas text-ink-soft border-line',
  refunded: 'bg-blue-100 text-blue-800 border-blue-200',
  partially_refunded: 'bg-blue-100 text-blue-800 border-blue-200',
};

const REFUND_LABEL: Record<Refund['status'], string> = {
  pending: 'Refund requested',
  succeeded: 'Refunded',
  failed: 'Refund failed',
};

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const PaymentPanel = ({
  booking,
  isCustomer,
  isVendor,
}: {
  booking: BookingWithDetails;
  isCustomer: boolean;
  isVendor: boolean;
}) => {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await getPaymentForBooking(booking.id);
      setPayment(found);
      setRefunds(found ? await getRefundsForPayment(found.id) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment details.');
    } finally {
      setLoading(false);
    }
  }, [booking.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handlePay = () =>
    run(async () => {
      // Scoped to the booking so a double submit reuses the same payment
      // instead of opening a second one.
      const created = await createPaymentForBooking(booking.id, `booking:${booking.id}:payment`);
      await authorizeAndStartPayment(created);
    });

  const handleRefund = () =>
    run(async () => {
      if (!payment) return;
      const rupees = Number(refundAmount);
      if (!Number.isFinite(rupees) || rupees <= 0) {
        throw new Error('Enter a refund amount.');
      }
      const minor = Math.round(rupees * 100);
      await refundPayment(
        payment.id,
        minor,
        `refund:${payment.id}:${minor}:${refunds.length}`,
        refundReason,
      );
      setRefundAmount('');
      setRefundReason('');
    });

  if (loading) {
    return (
      <section className="mt-6 rounded-card border border-line bg-surface p-6 sm:p-8">
        <div className="mb-4 h-6 w-1/4 animate-pulse rounded bg-line" aria-hidden="true" />
        <div className="h-16 w-full animate-pulse rounded bg-line" aria-hidden="true" />
      </section>
    );
  }

  const payable = isCustomer && isBookingPayable(booking.status, payment);
  const showRefundForm = isVendor && payment && canVendorRefund(payment);

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Payment</h2>
        {payment && (
          <span
            data-testid="payment-status"
            className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${BADGE[payment.status]}`}
          >
            {PAYMENT_STATUS_LABELS[payment.status]}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-control border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {!payment && (
        <p className="text-muted">
          {booking.status === 'accepted'
            ? 'No payment has been started for this booking yet.'
            : 'Payment becomes available once the vendor accepts this booking.'}
        </p>
      )}

      {payment && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Amount</dt>
            <dd data-testid="payment-amount" className="mt-1 font-medium text-ink">
              {formatMinor(payment.amount_minor, payment.currency)}
            </dd>
          </div>
          {payment.amount_refunded_minor > 0 && (
            <div>
              <dt className="text-sm text-muted">Refunded</dt>
              <dd className="mt-1 font-medium text-ink">
                {formatMinor(payment.amount_refunded_minor, payment.currency)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted">Started</dt>
            <dd className="mt-1 font-medium text-ink">
              {formatTimestamp(payment.created_at)}
            </dd>
          </div>
        </dl>
      )}

      {payment?.status === 'processing' && (
        <div className="mt-6 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4" role="note">
          <Info className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            This payment has been handed to the provider. It is not confirmed until they tell us it
            settled, which can take a moment.
          </p>
        </div>
      )}

      {payable && (
        <div className="mt-6 border-t pt-6">
          <button
            type="button"
            onClick={handlePay}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-control bg-brand-600 px-5 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? 'Starting payment…' : 'Pay this booking'}
          </button>
          <p className="mt-2 text-xs text-muted">
            You will be taken to the payment provider. Ocasio never sees or stores your card
            details.
          </p>
        </div>
      )}

      {isCustomer && payment && (payment.status === 'pending' || payment.status === 'processing') && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => run(() => cancelPayment(payment.id))}
            disabled={busy}
            className="text-sm text-muted underline hover:text-ink disabled:opacity-60"
          >
            Abandon this payment attempt
          </button>
        </div>
      )}

      {refunds.length > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-3 text-sm font-medium text-muted">Refunds</h3>
          <ul className="space-y-2">
            {refunds.map((refund) => (
              <li key={refund.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {formatMinor(refund.amount_minor)} — {REFUND_LABEL[refund.status]}
                  {refund.reason && <span className="text-muted"> · {refund.reason}</span>}
                </span>
                <span className="text-muted">{formatTimestamp(refund.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showRefundForm && payment && (
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Issue a refund</h3>
          <p className="mb-3 text-xs text-muted">
            Refundable balance: {formatMinor(refundableBalanceMinor(payment), payment.currency)}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-40">
              <label htmlFor="refund-amount" className="mb-1 block text-sm text-ink-soft">
                Amount (₹)
              </label>
              <input
                id="refund-amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="w-full rounded-lg border border-line-strong p-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="refund-reason" className="mb-1 block text-sm text-ink-soft">
                Reason <span className="text-muted">(optional)</span>
              </label>
              <input
                id="refund-reason"
                type="text"
                maxLength={500}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full rounded-lg border border-line-strong p-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefund}
            disabled={busy}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-control border border-red-300 bg-surface px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Issue refund
          </button>
        </div>
      )}
    </section>
  );
};

export default PaymentPanel;
