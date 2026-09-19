import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import PopularCategories from '../components/PopularCategories';
import FeaturedVendors from '../components/FeaturedVendors';

const Home = () => {
  usePageMeta(
    'Ocasio — Find and book event vendors across India',
    'Discover top-rated venues, catering, photography and decoration vendors for weddings, corporate events and parties across India.',
  );

  return (
    <div>
      <Hero />
      <PopularCategories />
      <FeaturedVendors />
    </div>
  );
}

export default Home;