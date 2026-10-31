import { registerProvider, type AuthorizeRequest, type AuthorizeResult, type PaymentProvider } from './provider';

/**
 * Razorpay Standard Checkout.
 *
 * Opens Razorpay's own payment form for an order the server created
 * (payments-create-order). The form runs in Razorpay's frame: card, UPI and
 * bank details are entered there and never touch Ocasio's page or servers.
 *
 * The success callback is NOT treated as payment. It reports that the customer
 * finished the form, and the panel then waits for the database, which marks a
 * payment paid only when Razorpay's signed payment.captured webhook arrives.
 *
 * checkout.js is loaded the first time someone pays, not on every page.
 */
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface CheckoutFailure {
  error?: { description?: string; reason?: string; code?: string };
}

interface CheckoutInstance {
  open(): void;
  on(event: 'payment.failed', listener: (response: CheckoutFailure) => void): void;
}

type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;

declare global {
  interface Window {
    Razorpay?: CheckoutConstructor;
  }
}

let loading: Promise<CheckoutConstructor> | null = null;

function loadCheckout(): Promise<CheckoutConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise<CheckoutConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Razorpay Checkout did not load. Please try again.'));
    };
    script.onerror = () => {
      // Allow a later attempt to load it again.
      loading = null;
      script.remove();
      reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const razorpayPaymentProvider: PaymentProvider = {
  name: 'razorpay',
  usesServerOrder: true,

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    if (!request.order) {
      throw new Error('A Razorpay order is required to open Checkout.');
    }
    const Checkout = await loadCheckout();

    return new Promise<AuthorizeResult>((resolve) => {
      let lastFailure: string | null = null;
      let done = false;
      const finish = (result: AuthorizeResult) => {
        if (!done) {
          done = true;
          resolve(result);
        }
      };

      const checkout = new Checkout({
        key: request.order!.publicKey,
        order_id: request.order!.id,
        // Checkout requires these; they are the server's figures, and Razorpay
        // charges the order's own amount regardless.
        amount: request.amountMinor,
        currency: request.currency,
        name: 'Ocasio',
        description: 'Booking payment',
        prefill: request.prefill?.email ? { email: request.prefill.email } : undefined,
        notes: { ocasio_payment_id: request.paymentId },
        theme: { color: '#9333ea' },
        handler: (response: CheckoutSuccess) =>
          finish({ outcome: 'submitted', providerPaymentId: response.razorpay_payment_id }),
        modal: {
          // After a failed attempt Razorpay keeps the form open for a retry, so
          // a failure is reported only once the customer closes it.
          ondismiss: () =>
            finish(lastFailure ? { outcome: 'failed', reason: lastFailure } : { outcome: 'dismissed' }),
        },
      });

      checkout.on('payment.failed', (response) => {
        lastFailure = response.error?.description || 'The payment did not go through.';
      });

      checkout.open();
    });
  },
};

registerProvider(razorpayPaymentProvider);
