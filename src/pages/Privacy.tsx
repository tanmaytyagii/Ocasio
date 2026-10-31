import LegalDocument, {
  Pending,
  ReviewNote,
  SupportContact,
  type LegalSection,
} from '../components/legal/LegalDocument';
import { SITE } from '../lib/site';

/**
 * Privacy Policy.
 *
 * Every category of data below maps to a table in supabase/migrations, and
 * every "who can see it" statement maps to an RLS policy or column grant. If a
 * migration adds personal data or widens who can read it, update this page in
 * the same change. Account deletion follows docs/OCASIO_DATA_RETENTION.md.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <p>
        Ocasio is operated by <Pending value={SITE.legal.entityName} label="registered entity name" />{' '}
        (“Ocasio”, “we”, “us”), which decides how and why the personal data described here is
        processed. You can contact us about privacy at <SupportContact />.
      </p>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <p>
          <strong>Your account.</strong> Your email address and password, and the display name if
          you add one. Passwords are handled by our authentication provider and stored only in
          hashed form; we never see them in plain text. We also record whether your account is a
          customer, vendor or administrator account.
        </p>
        <p>
          <strong>Business listings.</strong> If you apply to list a business: its name, category,
          city, description, business hours, and the business phone number, email address and
          website you provide, plus any photographs you upload.
        </p>
        <p>
          <strong>Bookings.</strong> The service requested, event date, event location, any notes
          you add, the quoted price, and each change in the booking’s status with who made it and
          when.
        </p>
        <p>
          <strong>Payments</strong> (once online payment is enabled). The amount, currency and
          status of each payment and refund, and the references the payment provider issues. We
          never collect card numbers, CVVs, card expiry dates, UPI PINs or banking credentials, and
          our systems are built to reject them.
        </p>
        <p>
          <strong>Reviews and saved vendors.</strong> Reviews you write, and the vendors you save
          to your favourites.
        </p>
        <p>
          <strong>Technical data.</strong> When you sign in, your browser stores a session token in
          local storage so you stay signed in. Our hosting and infrastructure providers process
          technical data such as IP addresses and request logs to run and secure the service.
          Ocasio does not use advertising or analytics cookies or trackers.
        </p>
        <ReviewNote>
          Confirm how long infrastructure providers retain request logs, and whether a cookie or
          local-storage notice is required.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'How we use it',
    body: (
      <>
        <ul>
          <li>to create and secure your account and keep you signed in;</li>
          <li>to publish business listings and let customers search them;</li>
          <li>to deliver booking requests to vendors and let both sides manage them;</li>
          <li>to process payments and refunds, once online payment is enabled;</li>
          <li>to publish reviews and calculate vendor ratings;</li>
          <li>to review vendor applications and moderate listings;</li>
          <li>
            to keep an audit record of booking and payment changes, to prevent fraud and resolve
            disputes;
          </li>
          <li>to send emails needed to operate your account, and to meet legal obligations.</li>
        </ul>
        <p>
          We do not sell personal data, and we do not currently send marketing emails.
        </p>
        <ReviewNote>
          Confirm the lawful basis (consent or legitimate use) for each purpose and the form of
          notice and consent required under the Digital Personal Data Protection Act, 2023 and its
          Rules.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'who-can-see-it',
    title: 'Who can see it',
    body: (
      <>
        <ul>
          <li>
            <strong>Everyone:</strong> active business listings, including the business phone
            number, email address, website and photographs; and reviews and ratings. Reviews are
            shown without the reviewer’s name.
          </li>
          <li>
            <strong>The vendor you send a request to:</strong> the service, event date, event
            location, your notes, and the booking’s status history. Ocasio does not currently share
            your name, email address or phone number with the vendor — include contact details in
            your notes only if you want the vendor to have them.
          </li>
          <li>
            <strong>Ocasio staff:</strong> administrators see vendor applications, including the
            applicant’s account email address, so that they can be reviewed. Staff who operate the
            service can access stored data where that is needed to run it, investigate a problem or
            respond to a request.
          </li>
          <li>
            <strong>Service providers</strong> who process data on our behalf: Supabase (database,
            authentication, file storage and server functions) and Vercel (website hosting), and,
            once online payment is enabled, our payment provider.
          </li>
          <li>
            <strong>Authorities</strong>, where the law requires us to disclose information.
          </li>
        </ul>
        <p>Other customers cannot see your bookings, payments or saved vendors.</p>
        <ReviewNote>
          Confirm data-processing terms with each provider, the region where the Supabase project
          stores data, and the position on transfers outside India.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <>
        <p>
          Access rules are enforced inside the database itself, not only in the website: a customer
          can read only their own bookings and payments, and a vendor only the bookings made with
          their own business. A payment’s status can be changed only by a verified notification
          from the payment provider. No system is perfectly secure, and we cannot guarantee that
          data will never be accessed without authorisation.
        </p>
        <ReviewNote>
          Document the personal-data breach response, including notice to affected users and to the
          Data Protection Board of India.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it, and deleting your account',
    body: (
      <>
        <p>
          We keep your data while your account is open. Booking, payment, refund and review records
          form part of the marketplace’s financial and trust records and are kept after the booking
          ends.
        </p>
        <p>
          There is no self-service account deletion yet. To close your account, contact{' '}
          <SupportContact />:
        </p>
        <ul>
          <li>
            if you have never paid for a booking or written a review, we can delete your account
            together with your bookings and saved vendors;
          </li>
          <li>
            if you have paid for a booking or written a review — or, for a vendor, if your business
            has received payments or reviews — we cannot currently delete the account completely,
            because those records are retained. We will tell you what we can remove.
          </li>
        </ul>
        <ReviewNote>
          Set retention periods (including for tax and accounting records) and decide how erasure
          requests are handled for accounts with payment or review history. The current constraint
          is described in docs/OCASIO_DATA_RETENTION.md.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>Subject to applicable law, you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and how it is used;</li>
          <li>
            correct or update it — you can change your display name in your profile, and vendors
            can edit their listing in the vendor dashboard;
          </li>
          <li>erase it, subject to the retention described above;</li>
          <li>
            let a person you nominate exercise these rights if you die or become unable to do so.
          </li>
        </ul>
        <p>
          You can also withdraw consent, which may mean closing your account. Send requests to{' '}
          <SupportContact />. If you are not satisfied with our response, you may be able to
          complain to the Data Protection Board of India.
        </p>
        <ReviewNote>
          Confirm which rights and timelines under the DPDP Act, 2023 and its Rules are in force at
          launch, and how requests are verified.
        </ReviewNote>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <>
        <p>
          Ocasio is not intended for anyone under 18, and we do not knowingly collect their
          personal data.
        </p>
        <ReviewNote>Confirm the approach to verifiable parental consent under the DPDP Act.</ReviewNote>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    body: (
      <p>
        We may update this policy. The date at the top shows when it last changed. Questions,
        requests and complaints go to <SupportContact />; our grievance officer is{' '}
        <Pending value={SITE.legal.grievanceOfficer} label="grievance officer" />.
      </p>
    ),
  },
];

const Privacy = () => (
  <LegalDocument
    title="Privacy Policy"
    description="What personal data Ocasio collects, how it is used and shared, and the choices you have."
    intro={
      <p>
        This policy explains what personal data Ocasio collects when you browse vendors, request
        bookings or list a business, what we do with it, who can see it, and the choices you have.
      </p>
    }
    sections={SECTIONS}
  />
);

export default Privacy;
