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
}

export interface AuthorizeResult {
  /** The provider's own identifier for this attempt. */
  providerPaymentId: string;
  /** Where to send the customer, when the provider uses a hosted page. */
  redirectUrl?: string;
}

export interface PaymentProvider {
  readonly name: string;
  /**
   * Begins authorisation. Returning successfully means "handed to the
   * provider", never "paid" — the payment moves to `processing`, and only a
   * webhook can take it further.
   */
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
}

/**
 * Where a real provider plugs in.
 *
 * Adding Razorpay means: implement PaymentProvider with their checkout SDK,
 * register it here, and set VITE_PAYMENT_PROVIDER=razorpay. Nothing in the
 * payment domain, the database functions or the webhook processor changes —
 * only the signature-verification block in the edge function, which is
 * provider-specific by nature.
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
