import React, { useState } from 'react';
import { Calendar } from 'react-big-calendar';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { User, Settings, Bell, Heart, Calendar as CalendarIcon, MessageSquare, Clock } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { dateFnsLocalizer } from 'react-big-calendar';
import { parse, startOfWeek, getDay } from 'date-fns';
import enUS from 'date-fns/locale/en-US';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const events = [
  {
    title: 'Meeting with Royal Caterers',
    start: new Date(2025, 2, 20, 10, 0),
    end: new Date(2025, 2, 20, 11, 0),
  },
  {
    title: 'Venue Visit - Taj Palace',
    start: new Date(2025, 2, 22, 14, 0),
    end: new Date(2025, 2, 22, 16, 0),
  },
];

const Profile = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const stats = {
    pendingConfirmations: 3,
    vendorsContacted: 8,
    upcomingMeetings: 2,
    savedVendors: 5
  };

  const recentActivity = [
    {
      type: 'message',
      vendor: 'Royal Caterers',
      time: '2 hours ago'
    },
    {
      type: 'booking',
      vendor: 'Dream Decorators',
      time: '1 day ago'
    },
    {
      type: 'meeting',
      vendor: 'Taj Palace',
      time: 'Tomorrow at 2 PM'
    }
  ];

  return (
    <div className="pt-16 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="md:flex">
            {/* Sidebar */}
            <div className="md:w-64 bg-gray-50 p-6 border-r">
              <div className="text-center mb-8">
                <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-12 h-12 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold">{user?.email}</h2>
              </div>
              
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'dashboard' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <CalendarIcon className="w-5 h-5 mr-3" />
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'profile' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <User className="w-5 h-5 mr-3" />
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'settings' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-5 h-5 mr-3" />
                  Settings
                </button>
                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'notifications' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Bell className="w-5 h-5 mr-3" />
                  Notifications
                </button>
                <button
                  onClick={() => setActiveTab('favorites')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'favorites' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Heart className="w-5 h-5 mr-3" />
                  Favorites
                </button>
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8">
              {activeTab === 'dashboard' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Dashboard</h3>
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Pending Confirmations</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.pendingConfirmations}</p>
                        </div>
                        <Clock className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Vendors Contacted</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.vendorsContacted}</p>
                        </div>
                        <MessageSquare className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Upcoming Meetings</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.upcomingMeetings}</p>
                        </div>
                        <CalendarIcon className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Saved Vendors</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.savedVendors}</p>
                        </div>
                        <Heart className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                  </div>

                  {/* Calendar */}
                  <div className="mb-8">
                    <h4 className="text-lg font-semibold mb-4">Booking Calendar</h4>
                    <div className="bg-white p-4 rounded-lg shadow border">
                      <Calendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: 500 }}
                      />
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div>
                    <h4 className="text-lg font-semibold mb-4">Recent Activity</h4>
                    <div className="bg-white rounded-lg shadow border">
                      {recentActivity.map((activity, index) => (
                        <div
                          key={index}
                          className={`p-4 flex items-center justify-between ${
                            index !== recentActivity.length - 1 ? 'border-b' : ''
                          }`}
                        >
                          <div className="flex items-center">
                            {activity.type === 'message' && <MessageSquare className="h-5 w-5 text-blue-500 mr-3" />}
                            {activity.type === 'booking' && <CalendarIcon className="h-5 w-5 text-green-500 mr-3" />}
                            {activity.type === 'meeting' && <Clock className="h-5 w-5 text-purple-500 mr-3" />}
                            <div>
                              <p className="font-medium">{activity.vendor}</p>
                              <p className="text-sm text-gray-500">{activity.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'profile' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Profile Information</h3>
                  <form className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded-lg"
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full p-2 border rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        className="w-full p-2 border rounded-lg"
                        placeholder="Enter your phone number"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
                    >
                      Save Changes
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'settings' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Account Settings</h3>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-lg font-semibold mb-4">Notifications</h4>
                      <div className="space-y-4">
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Email notifications for new messages
                        </label>
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Email notifications for vendor updates
                        </label>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold mb-4">Privacy</h4>
                      <div className="space-y-4">
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Show my profile to vendors
                        </label>
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Allow vendors to contact me
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Notifications</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="font-semibold">New message from Royal Caterers</p>
                      <p className="text-gray-600">2 hours ago</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="font-semibold">Booking confirmed with Dream Decorators</p>
                      <p className="text-gray-600">1 day ago</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'favorites' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Favorite Vendors</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold">Royal Caterers</h4>
                      <p className="text-gray-600">Mumbai</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold">Dream Decorators</h4>
                      <p className="text-gray-600">Delhi</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;