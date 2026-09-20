import { ButtonLink } from './ui';

/**
 * Vendor acquisition band.
 *
 * Describes the real onboarding path: an application that is reviewed before
 * the listing goes live (vendors.status starts 'pending'). It does not promise
 * reach, revenue or customer volume, because none of those are measured.
 */
const VendorCta = () => (
  <section className="bg-ink py-16 sm:py-20">
    <div className="mx-auto max-w-[96rem] px-6 sm:px-8 lg:px-12 xl:px-16">
      <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-display-sm text-white">Run an events business?</h2>
          <p className="mt-3 text-white/75">
            List your services on Ocasio and receive booking requests you can accept, decline and
            manage in one place. Applications are reviewed before a listing goes live.
          </p>
        </div>
        <ButtonLink to="/become-vendor" size="lg" className="shrink-0">
          List your business
        </ButtonLink>
      </div>
    </div>
  </section>
);

export default VendorCta;
