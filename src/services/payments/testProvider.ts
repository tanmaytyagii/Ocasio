import { registerProvider, type AuthorizeRequest, type AuthorizeResult, type PaymentProvider } from './provider';

/**
 * Deterministic provider for local development and automated tests.
 *
 * It mints a stable reference derived from the payment id and returns. That is
 * the whole of its behaviour.
 *
 * It has no way to mark anything paid. Settlement still requires a signed
 * webhook processed under the service role, exactly as it would with a real
 * provider — which is what makes the end-to-end test meaningful rather than a
 * simulation of itself. Tests drive the settlement step through the webhook,
 * not through this adapter.
 */
export const testPaymentProvider: PaymentProvider = {
  name: 'test',

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    if (!request.paymentId) {
      throw new Error('A payment id is required to authorize.');
    }
    // Deterministic: the same payment always yields the same reference, so a
    // retried authorisation does not orphan the previous one.
    return { providerPaymentId: `test_${request.paymentId}` };
  },
};

registerProvider(testPaymentProvider);
