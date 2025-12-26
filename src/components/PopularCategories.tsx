import React from 'react';
import { Link } from 'react-router-dom';

const categories = [
  {
    title: 'Wedding Venues',
    image: 'https://images.unsplash.com/photo-1604016552404-22e1e27441ce?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    link: '/category/venues'
  },
  {
    title: 'Catering',
    image: 'https://images.unsplash.com/photo-1555244162-803834f70033?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    link: '/category/catering'
  },
  {
    title: 'Photographers',
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    link: '/category/photography'
  },
  {
    title: 'Decorators',
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    link: '/category/decoration'
  },
];

const PopularCategories = () => {
  return (
    <div className="bg-gray-50 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Popular Categories
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {categories.map((category, index) => (
            <Link to={category.link} key={index} className="relative group cursor-pointer">
              <div className="relative h-64 w-full overflow-hidden rounded-lg">
                <img
                  src={category.image}
                  alt={category.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <h3 className="absolute bottom-4 left-4 text-xl font-semibold text-white">
                  {category.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PopularCategories;