import React from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';

const vendors = [
  {
    id: 'catering-1',
    name: 'Royal Caterers',
    category: 'Catering',
    rating: 4.8,
    reviews: 156,
    image: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    location: 'Mumbai',
  },
  {
    id: 'decoration-1',
    name: 'Dream Decorators',
    category: 'Decoration',
    rating: 4.9,
    reviews: 203,
    image: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    location: 'Delhi',
  },
  {
    id: 'photography-1',
    name: 'Capture Moments',
    category: 'Photography',
    rating: 4.7,
    reviews: 178,
    image: 'https://images.unsplash.com/photo-1605774337664-7a846e9cdf17?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    location: 'Bangalore',
  },
];

const FeaturedVendors = () => {
  return (
    <div className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Top-Rated Vendors
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vendors.map((vendor) => (
            <Link 
              to={`/vendor/${vendor.id}`} 
              key={vendor.id} 
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              <div className="relative h-48">
                <img
                  src={vendor.image}
                  alt={vendor.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{vendor.name}</h3>
                <p className="text-gray-600">{vendor.category}</p>
                <div className="mt-2 flex items-center">
                  <Star className="h-5 w-5 text-yellow-400 fill-current" />
                  <span className="ml-1 text-gray-700">{vendor.rating}</span>
                  <span className="mx-1 text-gray-400">•</span>
                  <span className="text-gray-600">{vendor.reviews} reviews</span>
                </div>
                <p className="mt-2 text-gray-600">{vendor.location}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FeaturedVendors;