import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4">Occasio</h3>
            <p className="text-gray-400">
              Your trusted partner for finding the perfect vendors for all your special occasions.
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link to="/about" className="text-gray-400 hover:text-white">About Us</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-white">Contact</Link></li>
              <li><Link to="/become-vendor" className="text-gray-400 hover:text-white">Become a Vendor</Link></li>
              <li><Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Popular Cities</h4>
            <ul className="space-y-2">
              <li><Link to="/search?city=Mumbai" className="text-gray-400 hover:text-white">Mumbai</Link></li>
              <li><Link to="/search?city=Delhi" className="text-gray-400 hover:text-white">Delhi</Link></li>
              <li><Link to="/search?city=Bangalore" className="text-gray-400 hover:text-white">Bangalore</Link></li>
              <li><Link to="/search?city=Chennai" className="text-gray-400 hover:text-white">Chennai</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Connect With Us</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-400 hover:text-white">Facebook</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">Instagram</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">Twitter</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">LinkedIn</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} Occasio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;