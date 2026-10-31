/**
 * Payment provider boundary.
 *
 * The payment domain does not know which provider it is talking to. A provider
 * does exactly one thing from the browser's side: take the customer through an
 * authorisation step and hand back a provider-side reference.
 *
 * It deliberately cannot settle a payment. Settlement arrives only as a signed
 * webhook, processed by process_payment_event() under the service role — so no
 * provider adapter, and no amount of tampering with one, can mark a payment as
 * paid. See docs/OCASIO_PAYMENTS.md.
 */

export interface AuthorizeRequest {
  paymentId: string;
  /** Integer minor units, from the server. Display and provider handoff only. */
  amountMinor: number;
  currency: string;
  bookingReference: string;
  /**
   * The order the server created, for providers that settle against one
   * (Razorpay). The browser opens Checkout with it; it never creates one.
   */
  order?: { id: string; publicKey: string };
  /** Shown in the provider's form so the customer does not retype it. */
  prefill?: { email?: string };
}

/**
 * How the customer left the provider's checkout. None of these means "paid":
 *
 *   submitted  the provider says the customer completed it. The payment is
 *              confirmed only when the provider's webhook says so.
 *   dismissed  closed before finishing.
 *   failed     the provider reported a failed attempt, with its reason.
 */
export type AuthorizeResult =
  | { outcome: 'submitted'; providerPaymentId?: string }
  | { outcome: 'dismissed' }
  | { outcome: 'failed'; reason: string };

export interface PaymentProvider {
  readonly name: string;
  /**
   * True when the server creates the payment and the provider's order
   * (payments-create-order) before authorize() runs. False when the browser
   * creates the payment itself, then hands it over with start_payment() — the
   * test adapter's flow.
   */
  readonly usesServerOrder: boolean;
  /**
   * Begins authorisation. Resolving means the customer is done with the
   * provider's form, never "paid" — only a webhook can settle a payment.
   */
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
}

/**
 * Providers register themselves here; VITE_PAYMENT_PROVIDER picks the one that
 * starts new payments. An existing payment always continues with the provider
 * it was started with.
 *
 * Razorpay: ./razorpayProvider.ts in the browser, and the payments-create-order,
 * payments-webhook and payments-refund edge functions on the server. See
 * docs/OCASIO_PAYMENTS.md.
 */
const registry = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

export function getProvider(name: string): PaymentProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(
      `No payment provider registered under "${name}". Check VITE_PAYMENT_PROVIDER.`,
    );
  }
  return provider;
}

/** The configured provider name. Defaults to the test provider locally. */
export function configuredProviderName(): string {
  return (import.meta.env.VITE_PAYMENT_PROVIDER as string | undefined)?.trim() || 'test';
}
