import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Hero = () => {
  const [eventType, setEventType] = useState('');
  const [city, setCity] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const searchParams = new URLSearchParams();
    if (eventType) searchParams.append('type', eventType);
    if (city) searchParams.append('city', city);
    navigate(`/search?${searchParams.toString()}`);
  };

  return (
    <div className="relative pt-16">
      <div className="absolute inset-0">
        <img
          className="w-full h-[600px] object-cover"
          src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2000&q=80"
          alt="Indian wedding celebration"
        />
        <div className="absolute inset-0 bg-black opacity-40"></div>
      </div>
      
      <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Find the Perfect Vendors for Your Special Day
        </h1>
        <p className="mt-6 text-xl text-white max-w-3xl">
          Discover top-rated vendors for weddings, corporate events, parties, and more across India
        </p>
        
        <div className="mt-10">
          <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg shadow-lg max-w-2xl mx-auto">
            <div className="flex flex-col md:flex-row gap-4">
              <select 
                className="flex-1 p-2 border rounded"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="">Select Event Type</option>
                <option value="Wedding">Wedding</option>
                <option value="Corporate">Corporate Event</option>
                <option value="Birthday">Birthday Party</option>
                <option value="Religious">Religious Ceremony</option>
              </select>
              <select 
                className="flex-1 p-2 border rounded"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Select City</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Delhi">Delhi</option>
                <option value="Bangalore">Bangalore</option>
                <option value="Chennai">Chennai</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Kolkata">Kolkata</option>
              </select>
              <button type="submit" className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700">
                Search
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Hero;