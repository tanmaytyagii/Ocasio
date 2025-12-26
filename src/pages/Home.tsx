import React from 'react';
import Hero from '../components/Hero';
import PopularCategories from '../components/PopularCategories';
import FeaturedVendors from '../components/FeaturedVendors';

const Home = () => {
  return (
    <div>
      <Hero />
      <PopularCategories />
      <FeaturedVendors />
    </div>
  );
}

export default Home;