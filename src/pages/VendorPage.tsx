import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star, MapPin, Phone, Mail, Globe, Clock, Send, Calendar, CreditCard } from 'lucide-react';
import { vendorData } from '../data/vendors';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'vendor';
  timestamp: Date;
}

interface BookingDetails {
  eventType: string;
  date: string;
  guestCount: number;
  additionalNotes: string;
}

const VendorPage = () => {
  const { vendorId } = useParams();
  const vendor = vendorData.find(v => v.id === vendorId);
  const [showContact, setShowContact] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: 'Hello! How can I help you today?',
      sender: 'vendor',
      timestamp: new Date()
    }
  ]);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails>({
    eventType: '',
    date: '',
    guestCount: 0,
    additionalNotes: ''
  });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  if (!vendor) {
    return <div className="pt-20 text-center">Vendor not found</div>;
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: message,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');

    setTimeout(() => {
      const vendorMessage: Message = {
        id: messages.length + 2,
        text: "Thank you for your message. I'll get back to you shortly with more details.",
        sender: 'vendor',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, vendorMessage]);
    }, 1000);
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowPayment(true);
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setBookingConfirmed(true);
  };

  if (bookingConfirmed) {
    return (
      <div className="pt-16 bg-gray-50 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Booking Confirmed!</h2>
            <p className="text-gray-600 mb-6">
              Your booking with {vendor.name} has been confirmed. You will receive a confirmation email shortly with all the details.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="relative h-96">
            <img
              src={vendor.image}
              alt={vendor.name}
              className="h-full w-full object-cover"
            />
          </div>
          
          <div className="p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{vendor.name}</h1>
                <p className="text-gray-600 mt-2">{vendor.category}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center">
                  <Star className="h-6 w-6 text-yellow-400 fill-current" />
                  <span className="ml-2 text-2xl font-bold text-gray-900">{vendor.rating}</span>
                </div>
                <p className="text-gray-600">{vendor.reviews} reviews</p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-xl font-semibold mb-4">About Us</h2>
                <p className="text-gray-600">{vendor.description}</p>
                
                <div className="mt-6 space-y-3">
                  <div className="flex items-center">
                    <MapPin className="h-5 w-5 text-gray-400" />
                    <span className="ml-2 text-gray-600">{vendor.location}</span>
                  </div>
                  <div className="flex items-center">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <span className="ml-2 text-gray-600">{vendor.phone}</span>
                  </div>
                  <div className="flex items-center">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <span className="ml-2 text-gray-600">{vendor.email}</span>
                  </div>
                  <div className="flex items-center">
                    <Globe className="h-5 w-5 text-gray-400" />
                    <span className="ml-2 text-gray-600">{vendor.website}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <span className="ml-2 text-gray-600">{vendor.businessHours}</span>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Services</h2>
                <ul className="space-y-2">
                  {vendor.services.map((service, index) => (
                    <li key={index} className="flex items-center">
                      <span className="w-2 h-2 bg-purple-600 rounded-full mr-2"></span>
                      {service}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <h2 className="text-xl font-semibold mb-4">Pricing</h2>
                  <p className="text-gray-600">{vendor.pricing}</p>
                </div>

                <div className="mt-8 space-y-4">
                  <button 
                    onClick={() => setShowContact(true)}
                    className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition duration-300"
                  >
                    Contact Vendor
                  </button>
                  <button 
                    onClick={() => setShowBooking(true)}
                    className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition duration-300"
                  >
                    Book Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Modal */}
        {showContact && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{vendor.name}</h2>
                    <div className="mt-2 space-y-1">
                      <p className="text-gray-600 flex items-center">
                        <Phone className="h-4 w-4 mr-2" />
                        {vendor.phone}
                      </p>
                      <p className="text-gray-600 flex items-center">
                        <Mail className="h-4 w-4 mr-2" />
                        {vendor.email}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowContact(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="h-[60vh] overflow-y-auto p-6">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-4 ${
                          msg.sender === 'user'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p>{msg.text}</p>
                        <p className={`text-xs mt-1 ${
                          msg.sender === 'user' ? 'text-purple-100' : 'text-gray-500'
                        }`}>
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-4">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                  <button
                    type="submit"
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 flex items-center"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Booking Modal */}
        {showBooking && !showPayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">Book {vendor.name}</h2>
                  <button
                    onClick={() => setShowBooking(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleBookingSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Type
                  </label>
                  <select
                    value={bookingDetails.eventType}
                    onChange={(e) => setBookingDetails({ ...bookingDetails, eventType: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
                  >
                    <option value="">Select Event Type</option>
                    <option value="Wedding">Wedding</option>
                    <option value="Corporate">Corporate Event</option>
                    <option value="Birthday">Birthday Party</option>
                    <option value="Religious">Religious Ceremony</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={bookingDetails.date}
                    onChange={(e) => setBookingDetails({ ...bookingDetails, date: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Guests
                  </label>
                  <input
                    type="number"
                    value={bookingDetails.guestCount}
                    onChange={(e) => setBookingDetails({ ...bookingDetails, guestCount: parseInt(e.target.value) })}
                    className="w-full p-2 border rounded-lg"
                    required
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Notes
                  </label>
                  <textarea
                    value={bookingDetails.additionalNotes}
                    onChange={(e) => setBookingDetails({ ...bookingDetails, additionalNotes: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    rows={4}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700"
                >
                  Proceed to Payment
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">Payment Details</h2>
                  <button
                    onClick={() => setShowPayment(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4">Booking Summary</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Event Type</p>
                        <p className="font-medium">{bookingDetails.eventType}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Date</p>
                        <p className="font-medium">{bookingDetails.date}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Guests</p>
                        <p className="font-medium">{bookingDetails.guestCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Amount</p>
                        <p className="font-medium">₹25,000</p>
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handlePayment} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Payment Method
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {['Credit Card', 'UPI', 'Net Banking'].map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`p-4 border rounded-lg flex items-center justify-center ${
                            paymentMethod === method ? 'border-purple-600 bg-purple-50' : 'border-gray-200'
                          }`}
                        >
                          <CreditCard className="h-5 w-5 mr-2" />
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentMethod === 'Credit Card' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Card Number
                        </label>
                        <input
                          type="text"
                          className="w-full p-2 border rounded-lg"
                          placeholder="1234 5678 9012 3456"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Expiry Date
                          </label>
                          <input
                            type="text"
                            className="w-full p-2 border rounded-lg"
                            placeholder="MM/YY"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            CVV
                          </label>
                          <input
                            type="text"
                            className="w-full p-2 border rounded-lg"
                            placeholder="123"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'UPI' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        UPI ID
                      </label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded-lg"
                        placeholder="username@upi"
                      />
                    </div>
                  )}

                  {paymentMethod === 'Net Banking' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Bank
                      </label>
                      <select className="w-full p-2 border rounded-lg">
                        <option value="">Select your bank</option>
                        <option value="sbi">State Bank of India</option>
                        <option value="hdfc">HDFC Bank</option>
                        <option value="icici">ICICI Bank</option>
                        <option value="axis">Axis Bank</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!paymentMethod}
                    className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    Pay ₹25,000
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VendorPage;