import LegalDocument, {
  ReviewNote,
  SupportContact,
  type LegalSection,
} from '../components/legal/LegalDocument';

/**
 * Cancellation and Refund Policy.
 *
 * States the rules the database enforces (docs/OCASIO_BOOKINGS.md §3,
 * docs/OCASIO_PAYMENTS.md §6 and §10) and nothing it does not. In particular
 * there is no automatic refund, no cancellation window and no fee, so this page
 * promises none. Where a policy decision is still open, it says so.
 */
const STATUSES = [
  ['Pending', 'Sent to the vendor and waiting for them to accept or decline.'],
  ['Accepted', 'Confirmed by the vendor. Payment, once enabled, becomes available.'],
  ['Declined', 'The vendor turned the request down.'],
  ['Cancelled', 'Withdrawn by the customer, or cancelled by the vendor after accepting.'],
  ['Completed', 'The vendor has marked the event as delivered.'],
] as const;

const SECTIONS: LegalSection[] = [
  {
    id: 'statuses',
    title: 'Booking statuses',
    body: (
      <>
        <p>Every booking on Ocasio has one of these statuses, shown on its booking page:</p>
        <dl className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {STATUSES.map(([status, meaning]) => (
            <div key={status} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
              <dt className="font-semibold text-ink">{status}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4">
          Declined, cancelled and completed are final. A final booking cannot be reopened; to go
          ahead after one, send a new request.
        </p>
      </>
    ),
  },
  {
    id: 'customer-cancellation',
    title: 'Cancelling as a customer',
    body: (
      <>
        <p>
          You can cancel a booking from its booking page while it is <strong>pending</strong> or{' '}
          <strong>accepted</strong>. Cancelling a pending request simply withdraws it. A completed
          booking cannot be cancelled.
        </p>
        <p>
          Ocasio does not charge a cancellation fee and does not set a cancellation deadline. If you
          have agreed cancellation terms directly with the vendor, those terms are between you and
          the vendor.
        </p>
        <ReviewNote>
          Decide, before payments go live, whether Ocasio sets a platform-wide cancellation window
          and charges or requires each vendor to publish one. Check the Consumer Protection
          (E-Commerce) Rules, 2020 on cancellation charges before introducing any.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'vendor-cancellation',
    title: 'When a vendor declines or cancels',
    body: (
      <>
        <p>
          A vendor can decline a pending request, or cancel a booking they have already accepted if
          they can no longer provide the service. The booking’s history records who cancelled it
          and when.
        </p>
        <p>
          If a vendor cancels a booking you have paid for, the payment remains refundable; see the
          next section. Cancellation does not refund a payment automatically.
        </p>
        <ReviewNote>
          State the customer’s refund entitlement when a vendor cancels a paid booking. Today the
          platform does not refund automatically: the vendor or Ocasio must issue the refund.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'Refunds',
    body: (
      <>
        <p>
          <strong>Online payment through Ocasio is not live yet</strong>, so no payment can
          currently be refunded through Ocasio. Once it is enabled, refunds work as follows:
        </p>
        <ul>
          <li>
            Only a payment that the payment provider has confirmed as successful can be refunded.
          </li>
          <li>
            Refunds are issued by the vendor for that booking, or by Ocasio. Customers cannot issue
            a refund themselves: ask the vendor, and contact us at <SupportContact /> if you cannot
            reach an agreement.
          </li>
          <li>
            A refund can be for the full amount or part of it. Refunds on one payment can never add
            up to more than was paid.
          </li>
          <li>
            A refund is complete only when the payment provider confirms it. Until then, the
            booking page shows it as requested.
          </li>
          <li>
            Refunds are returned to the original payment method. How long they take to appear
            depends on the payment provider and your bank.
          </li>
        </ul>
        <ReviewNote>
          Once a payment provider is connected, state its usual refund timeline and confirm how
          refunds are funded when payment is collected on a vendor’s behalf.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'failed-payments',
    title: 'Failed or abandoned payments',
    body: (
      <p>
        If a payment fails, the booking stays accepted and you can try again. You can also abandon
        a payment that has not completed. If your account was debited for a payment that shows as
        failed, contact <SupportContact /> with the booking details so we can check it with the
        payment provider.
      </p>
    ),
  },
  {
    id: 'disputes',
    title: 'Disputes',
    body: (
      <>
        <p>
          If something goes wrong with a booking — a no-show, or a service very different from what
          was agreed — contact the vendor first, then us at <SupportContact />. Ocasio does not yet
          operate a formal dispute-resolution process, but we will look into every complaint.
        </p>
        <ReviewNote>
          Define a dispute and chargeback process, including who decides and on what timeline.
        </ReviewNote>
      </>
    ),
  },
];

const CancellationRefunds = () => (
  <LegalDocument
    title="Cancellation and Refund Policy"
    description="How cancelling a booking request works on Ocasio, and how refunds are issued."
    intro={
      <p>
        This policy explains how customers and vendors can cancel bookings on Ocasio, and how
        refunds are handled for bookings paid for through Ocasio.
      </p>
    }
    sections={SECTIONS}
  />
);

export default CancellationRefunds;
