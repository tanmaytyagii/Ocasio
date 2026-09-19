import React, { useState } from 'react';
import { Check } from 'lucide-react';
import MockCheckout from '../components/MockCheckout';

interface SubscriptionPlan {
  name: string;
  price: number;
  features: string[];
  recommended?: boolean;
}

const plans: SubscriptionPlan[] = [
  {
    name: 'Basic',
    price: 999,
    features: [
      'Basic listing profile',
      'Up to 5 photos',
      'Email support',
      'Monthly performance reports',
      'Listed in 1 category'
    ]
  },
  {
    name: 'Professional',
    price: 2499,
    features: [
      'Enhanced listing profile',
      'Up to 15 photos',
      'Priority email & phone support',
      'Weekly performance reports',
      'Listed in 3 categories',
      'Featured in search results',
      'Social media promotion'
    ],
    recommended: true
  },
  {
    name: 'Premium',
    price: 4999,
    features: [
      'Premium listing profile',
      'Unlimited photos',
      '24/7 priority support',
      'Real-time performance analytics',
      'Listed in all categories',
      'Top placement in search',
      'Dedicated account manager',
      'Custom promotional campaigns'
    ]
  }
];

const BecomeVendor = () => {
  const [selectedPlan, setSelectedPlan] = useState<string>('Professional');
  const [showPayment, setShowPayment] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    category: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    description: '',
    priceRange: '',
    website: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const selectedPlanPrice = plans.find((p) => p.name === selectedPlan)?.price ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowPayment(true);
  };

  const handlePayment = () => {
    setShowConfirmation(true);
  };

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Demo application received</h2>
            <p className="text-gray-600 mb-6">
              This is a simulated submission. No payment was taken and your details have not
              been stored or sent anywhere. Vendor applications will be reviewed for real once
              Ocasio is connected to its database.
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

  if (showPayment) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-6">Confirm your application</h2>
            <MockCheckout
              amount={selectedPlanPrice}
              description={`${selectedPlan} plan — vendor subscription`}
              submitLabel="Submit application"
              onConfirm={handlePayment}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Join Ocasio as a Vendor</h1>
          <p className="text-xl text-gray-600">
            Reach thousands of potential customers and grow your business
          </p>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Choose Your Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-lg shadow-lg overflow-hidden ${
                  plan.recommended ? 'ring-2 ring-purple-600' : ''
                }`}
              >
                {plan.recommended && (
                  <div className="bg-purple-600 text-white text-center py-2">
                    Recommended
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">₹{plan.price}</span>
                    <span className="text-gray-600">/month</span>
                  </div>
                  <ul className="mt-6 space-y-4">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center">
                        <Check className="h-5 w-5 text-green-500 mr-2" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setSelectedPlan(plan.name)}
                    className={`mt-8 w-full py-3 px-4 rounded-lg font-semibold ${
                      selectedPlan === plan.name
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {selectedPlan === plan.name ? 'Selected' : 'Select Plan'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Business Information</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Venue">Venue</option>
                  <option value="Catering">Catering</option>
                  <option value="Photography">Photography</option>
                  <option value="Decoration">Decoration</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City
                </label>
                <select
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                >
                  <option value="">Select City</option>
                  <option value="Mumbai">Mumbai</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Bangalore">Bangalore</option>
                  <option value="Chennai">Chennai</option>
                  <option value="Hyderabad">Hyderabad</option>
                  <option value="Kolkata">Kolkata</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Business Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                required
              ></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price Range
                </label>
                <input
                  type="text"
                  name="priceRange"
                  value={formData.priceRange}
                  onChange={handleInputChange}
                  placeholder="e.g., ₹10,000 - ₹50,000"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website (Optional)
                </label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Submit Application
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default BecomeVendor;