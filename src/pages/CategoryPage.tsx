import React from 'react';
import { useParams } from 'react-router-dom';
import { vendorData } from '../data/vendors';
import { Star } from 'lucide-react';

const CategoryPage = () => {
  const { categoryName } = useParams();
  const vendors = vendorData.filter(vendor => 
    vendor.category.toLowerCase() === categoryName?.toLowerCase()
  );

  return (
    <div className="pt-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8 capitalize">
          {categoryName} Vendors
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="relative h-48">
                <img
                  src={vendor.image}
                  alt={vendor.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900">{vendor.name}</h3>
                <p className="text-gray-600">{vendor.location}</p>
                <div className="mt-2 flex items-center">
                  <Star className="h-5 w-5 text-yellow-400 fill-current" />
                  <span className="ml-1 text-gray-700">{vendor.rating}</span>
                  <span className="mx-1 text-gray-400">•</span>
                  <span className="text-gray-600">{vendor.reviews} reviews</span>
                </div>
                <p className="mt-2 text-gray-600 line-clamp-2">{vendor.description}</p>
                <a
                  href={`/vendor/${vendor.id}`}
                  className="mt-4 block w-full bg-purple-600 text-white text-center py-2 rounded hover:bg-purple-700 transition duration-300"
                >
                  View Details
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CategoryPage;