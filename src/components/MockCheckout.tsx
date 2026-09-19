import { useState } from 'react';
import { CreditCard, ShieldAlert } from 'lucide-react';

/**
 * Development-only checkout placeholder.
 *
 * Ocasio has no payment provider integration yet. This component deliberately
 * collects NO payment credentials — no card number, no CVV, no expiry, no UPI
 * ID, no bank login. Those fields previously existed here but were discarded on
 * submit, which put real card data at risk for zero functional benefit.
 *
 * When Razorpay lands in Phase 4, this component is replaced by their hosted
 * checkout. Raw card data must never reach Ocasio's own code or database, and a
 * booking must only be marked paid by a signature-verified webhook — never by
 * the frontend callback this component stands in for.
 *
 * See docs/OCASIO_PRODUCT_ROADMAP.md, Phase 4.
 */

interface MockCheckoutProps {
  /** Rupee amount shown to the user. Display only — never authoritative. */
  amount: number;
  /** What is being paid for, e.g. "Professional plan" or the vendor's name. */
  description: string;
  submitLabel?: string;
  onConfirm: () => void;
}

const PAYMENT_METHODS = ['Credit Card', 'UPI', 'Net Banking'] as const;

const formatRupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

const MockCheckout = ({
  amount,
  description,
  submitLabel = 'Simulate payment',
  onConfirm,
}: MockCheckoutProps) => {
  const [paymentMethod, setPaymentMethod] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div
        role="note"
        className="flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Demo checkout — no payment is taken</p>
          <p className="mt-1">
            Ocasio is not yet connected to a payment provider. Nothing is charged and no
            card or bank details are requested or stored. Continuing records a simulated
            booking for demonstration only.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-canvas p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Paying for</p>
            <p className="font-medium text-ink">{description}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Amount</p>
            <p className="text-xl font-semibold text-ink">{formatRupees(amount)}</p>
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-ink-soft">
          Preferred payment method
        </legend>
        <p className="mb-3 text-sm text-muted">
          Recorded as a preference only. You will not be asked for any credentials.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={paymentMethod === method}
              onClick={() => setPaymentMethod(method)}
              className={`flex items-center justify-center rounded-lg border p-4 transition-colors ${
                paymentMethod === method
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-line hover:border-purple-400'
              }`}
            >
              <CreditCard className="mr-2 h-5 w-5" aria-hidden="true" />
              {method}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!paymentMethod}
        className="w-full rounded-lg bg-brand-600 py-3 text-white transition-colors hover:bg-brand-700 disabled:bg-gray-400"
      >
        {submitLabel}
      </button>
    </form>
  );
};

export default MockCheckout;
