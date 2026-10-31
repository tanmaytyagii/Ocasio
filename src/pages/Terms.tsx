import { Link } from 'react-router-dom';
import LegalDocument, {
  Pending,
  ReviewNote,
  SupportContact,
  type LegalSection,
} from '../components/legal/LegalDocument';
import { SITE } from '../lib/site';

/**
 * Terms and Conditions.
 *
 * Describes the product as it is built — booking requests that a vendor
 * accepts or declines, no platform fees, reviews that cannot be edited, no
 * live payment provider — not as it might be. When behaviour changes, this
 * page changes with it. See docs/OCASIO_BOOKINGS.md and OCASIO_PAYMENTS.md.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'about',
    title: 'About Ocasio',
    body: (
      <>
        <p>
          Ocasio is an online marketplace that helps people planning events find independent
          event-service businesses — such as venues, caterers, photographers and decorators
          (“vendors”) — and send them booking requests.
        </p>
        <p>
          Ocasio is operated by <Pending value={SITE.legal.entityName} label="registered entity name" />
          , with its registered office at{' '}
          <Pending value={SITE.legal.registeredAddress} label="registered address" />. In these
          Terms, “Ocasio”, “we” and “us” mean that operator.
        </p>
        <p>
          Vendors are independent businesses. They are not Ocasio’s employees, agents or partners.
          The agreement to provide an event service is between the customer and the vendor; Ocasio
          provides the platform through which they find each other and manage the booking.
        </p>
        <ReviewNote>
          Confirm how Ocasio is characterised (intermediary / marketplace e-commerce entity) and
          the obligations that follow under the Information Technology Act, 2000, the IT
          (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and the Consumer
          Protection (E-Commerce) Rules, 2020, including the seller and grievance details a
          marketplace must display.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts',
    body: (
      <>
        <p>
          You can browse vendors without an account. To save vendors, send booking requests, pay
          for bookings, write reviews or list a business, you need to create an account with an
          email address and password.
        </p>
        <ul>
          <li>You must be at least 18 years old and able to enter into a binding contract.</li>
          <li>The information you give us must be accurate and kept up to date.</li>
          <li>
            Keep your password confidential. You are responsible for activity on your account, and
            should tell us promptly at <SupportContact /> if you think someone else has used it.
          </li>
        </ul>
        <ReviewNote>Confirm the minimum age and any verification requirement.</ReviewNote>
      </>
    ),
  },
  {
    id: 'vendors',
    title: 'Listing a business',
    body: (
      <>
        <p>
          Businesses apply to be listed through the vendor application. We review each application
          before its listing goes live, and we may decline an application or suspend a listing —
          for example, if information in it is inaccurate or these Terms are breached.
        </p>
        <p>If you list a business on Ocasio, you agree that:</p>
        <ul>
          <li>
            your listing — services, prices, photographs, contact details and description — is
            accurate and kept current;
          </li>
          <li>
            you hold the licences, permits and registrations your services require, and you comply
            with the laws that apply to your business, including tax laws;
          </li>
          <li>
            you own, or have permission to use, every photograph and piece of content you upload;
          </li>
          <li>
            you respond to booking requests, accept only bookings you are able to fulfil, and
            deliver accepted bookings with reasonable skill and care.
          </li>
        </ul>
        <p>
          Listing a business on Ocasio is currently free. Ocasio does not charge vendors any fee or
          commission today. We will give advance notice before introducing any charge.
        </p>
        <ReviewNote>
          Define the criteria for approving, declining and suspending listings, and confirm GST and
          other tax obligations for vendors and for Ocasio before any fee or payment collection is
          introduced.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'bookings',
    title: 'Booking requests',
    body: (
      <>
        <p>
          A customer sends a booking request for a specific service, event date and event location,
          with optional notes. <strong>A request is not a confirmed booking.</strong> The vendor
          may accept or decline it. A booking is confirmed only once the vendor accepts it.
        </p>
        <p>
          The price shown with a request is calculated by Ocasio from the vendor’s published
          price at the time the request is made. It is a starting figure, not a final invoice: the
          full scope and price of the service may need to be agreed with the vendor.
        </p>
        <p>
          Each vendor sets how many bookings it can accept for one date, and Ocasio will not let it
          accept more than that. A vendor may still receive more requests for a date than it can
          take; a request it cannot take is declined, and a sent request is not a reservation. It is
          the vendor’s responsibility to set that limit accurately and to accept only bookings it
          can fulfil. After the event, the vendor marks the booking as completed.
        </p>
        <p>
          Customers and vendors can cancel bookings as described in our{' '}
          <Link to="/cancellation-and-refunds" className="font-medium text-brand-700 hover:underline">
            Cancellation and Refund Policy
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Payments',
    body: (
      <>
        <p>
          <strong>Online payment through Ocasio is not live yet.</strong> Until it is, Ocasio does
          not take any payment for a booking, and Ocasio is not a party to any payment arrangement
          a customer and vendor make directly.
        </p>
        <p>When online payment is enabled:</p>
        <ul>
          <li>a booking can be paid for only after the vendor has accepted it;</li>
          <li>
            payments are processed by a third-party payment provider. Ocasio does not receive or
            store card numbers, CVVs, UPI PINs or banking credentials;
          </li>
          <li>
            a payment is treated as successful only once the payment provider confirms it to us;
          </li>
          <li>amounts are charged in Indian Rupees (INR).</li>
        </ul>
        <p>Ocasio does not currently charge customers a booking or service fee.</p>
        <ReviewNote>
          Before payments go live, name the payment provider and state whether Ocasio collects
          payment on the vendor’s behalf, how and when vendors are paid, any fees, and who issues
          invoices.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'reviews',
    title: 'Reviews',
    body: (
      <>
        <p>
          Only a customer whose booking the vendor has marked as completed can review that vendor,
          and only once per booking. A review is a rating from 1 to 5 with optional written
          comments. Reviews are published without the reviewer’s name.
        </p>
        <p>
          <strong>Reviews cannot be edited or deleted once submitted</strong>, so please check
          yours before you send it. Reviews must describe your own genuine experience, and must not
          contain abusive or unlawful content or other people’s personal information. Vendors
          cannot write, change or remove reviews of their business.
        </p>
        <p>
          Some listings display sample ratings while the catalogue is being built. These are
          labelled as sample data and are replaced by the average of real reviews once one exists.
        </p>
        <ReviewNote>
          Ocasio has no process yet for removing a review that is unlawful or reported. Define a
          notice-and-takedown process before launch.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You must not use Ocasio to:</p>
        <ul>
          <li>break the law, or help anyone else to;</li>
          <li>create false listings, false booking requests or false reviews;</li>
          <li>impersonate any person or business;</li>
          <li>access, or try to access, accounts or data that are not yours;</li>
          <li>
            interfere with Ocasio’s security or operation, upload malicious code, or collect data
            from Ocasio by automated means;
          </li>
          <li>send spam or unsolicited marketing through booking requests or listings.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Content and intellectual property',
    body: (
      <>
        <p>
          The Ocasio name, brand and website belong to Ocasio. Vendors keep ownership of the
          content they upload, and give Ocasio a non-exclusive, royalty-free licence to host,
          display and reproduce it for operating and promoting the platform for as long as it is on
          Ocasio. Customers give Ocasio the same licence for reviews they submit.
        </p>
        <ReviewNote>Confirm the scope and duration of the content licences.</ReviewNote>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and closing accounts',
    body: (
      <p>
        We may suspend or close an account or listing that breaches these Terms, giving notice
        where it is reasonable to do so. You can stop using Ocasio at any time. To close your
        account, contact us at <SupportContact />; our{' '}
        <Link to="/privacy" className="font-medium text-brand-700 hover:underline">
          Privacy Policy
        </Link>{' '}
        explains what can and cannot be deleted.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimers and liability',
    body: (
      <>
        <p>
          Ocasio provides the platform on an “as is” and “as available” basis. We review vendor
          applications, but we do not guarantee the quality, safety or legality of any vendor’s
          services, or the accuracy of every listing, and we do not guarantee that the platform
          will be available without interruption.
        </p>
        <p>
          To the extent the law allows, Ocasio is not liable for the acts, omissions or services of
          vendors or customers, or for indirect or consequential loss. Nothing in these Terms
          limits any liability that cannot be limited under applicable law, including the Consumer
          Protection Act, 2019.
        </p>
        <ReviewNote>
          Counsel to set the liability cap, carve-outs and any indemnity. No cap is stated here on
          purpose.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'grievances',
    title: 'Grievances and contact',
    body: (
      <>
        <p>
          Questions and complaints can be sent to <SupportContact />. Our grievance officer is{' '}
          <Pending value={SITE.legal.grievanceOfficer} label="grievance officer" />, who can be
          reached at the same address.
        </p>
        <ReviewNote>
          Appoint a grievance officer and publish the acknowledgement and resolution timelines
          required by the IT Rules, 2021 and the Consumer Protection (E-Commerce) Rules, 2020.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and changes',
    body: (
      <>
        <p>
          These Terms are governed by the laws of India. The courts at{' '}
          <Pending value={SITE.legal.jurisdictionCity} label="jurisdiction city" /> have
          jurisdiction over any dispute arising from them.
        </p>
        <p>
          We may update these Terms. The date at the top of the page shows when they last changed,
          and we will give notice of material changes before they take effect.
        </p>
      </>
    ),
  },
];

const Terms = () => (
  <LegalDocument
    title="Terms and Conditions"
    description="The terms for using Ocasio to find event vendors, send booking requests and list an events business in India."
    intro={
      <p>
        These Terms apply to everyone who uses Ocasio — customers planning events and businesses
        listing their services. By creating an account or using Ocasio, you agree to them.
      </p>
    }
    sections={SECTIONS}
  />
);

export default Terms;
