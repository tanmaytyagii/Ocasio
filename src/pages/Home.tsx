import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import PopularCategories from '../components/PopularCategories';
import FeaturedVendors from '../components/FeaturedVendors';
import HowItWorks from '../components/HowItWorks';
import VendorCta from '../components/VendorCta';

const Home = () => {
  usePageMeta(
    'Ocasio — Find and book event vendors across India',
    'Compare venues, catering, photography and decoration vendors across India. Send a booking request, track it to completion, and review the work.',
  );

  return (
    <>
      <Hero />
      <PopularCategories />
      <FeaturedVendors />
      <HowItWorks />
      <VendorCta />
    </>
  );
};

export default Home;
