import React, { useEffect, useState } from 'react';
import { Calendar } from 'react-big-calendar';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import VendorBookingRequests from '../components/VendorBookingRequests';
import { getVendorBookingStats, type VendorBookingStats } from '../services/bookings';
import { 
  User, Settings, MessageSquare, Package, Calendar as CalendarIcon,
  DollarSign, Users, Clock, Send
, Info} from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { dateFnsLocalizer } from 'react-big-calendar';
import { parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';

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
    title: 'Client Meeting - Wedding Planning',
    start: new Date(2025, 2, 20, 10, 0),
    end: new Date(2025, 2, 20, 11, 0),
  },
  {
    title: 'Event Setup - Corporate Conference',
    start: new Date(2025, 2, 22, 14, 0),
    end: new Date(2025, 2, 22, 16, 0),
  },
];

interface Message {
  id: number;
  from: string;
  content: string;
  timestamp: Date;
  unread: boolean;
}

const initialMessages: Message[] = [
  {
    id: 1,
    from: 'Priya Sharma',
    content: 'Hi, I\'m interested in your services for my wedding in June.',
    timestamp: new Date(2025, 2, 15, 14, 30),
    unread: true,
  },
  {
    id: 2,
    from: 'Rahul Verma',
    content: 'Can you share your corporate event packages?',
    timestamp: new Date(2025, 2, 14, 11, 15),
    unread: false,
  },
];

const VendorDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [businessHours, setBusinessHours] = useState({
    monday: '9:00 AM - 6:00 PM',
    tuesday: '9:00 AM - 6:00 PM',
    wednesday: '9:00 AM - 6:00 PM',
    thursday: '9:00 AM - 6:00 PM',
    friday: '9:00 AM - 6:00 PM',
    saturday: '10:00 AM - 4:00 PM',
    sunday: 'Closed'
  });

  // Real counts from the database. There is no revenue tile: no payment has
  // ever been taken, so a rupee total would be fabricated. Quoted prices are
  // indicative figures, not income.
  const [stats, setStats] = useState<VendorBookingStats | null>(null);

  useEffect(() => {
    let active = true;
    getVendorBookingStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {
        if (active) setStats(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const statTile = (value: number | undefined) => (value === undefined ? '—' : String(value));

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedMessage) return;

    const response: Message = {
      id: messages.length + 1,
      from: 'You',
      content: newMessage,
      timestamp: new Date(),
      unread: false,
    };

    setMessages(prev => [...prev, response]);
    setNewMessage('');
  };

  return (
    <div className="pt-16 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="note">
          <Info className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Demonstration data</p>
            <p className="mt-1">
              The figures, bookings and messages on this page are placeholders, not your real
              business data. Vendor and customer workspaces move to live data when the booking
              and messaging systems are built.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="md:flex">
            {/* Sidebar */}
            <div className="md:w-64 bg-gray-50 p-6 border-r">
              <div className="text-center mb-8">
                <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-12 h-12 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold">{user?.email}</h2>
                <p className="text-sm text-gray-600">Vendor Dashboard</p>
              </div>
              
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'dashboard' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Package className="w-5 h-5 mr-3" />
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('bookings')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'bookings' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <CalendarIcon className="w-5 h-5 mr-3" />
                  Bookings
                </button>
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`w-full flex items-center px-4 py-2 rounded-lg ${
                    activeTab === 'messages' ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <MessageSquare className="w-5 h-5 mr-3" />
                  Messages
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
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8">
              {activeTab === 'dashboard' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Vendor Dashboard</h3>
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Total bookings</p>
                          <p className="text-2xl font-bold text-gray-900">{statTile(stats?.total)}</p>
                        </div>
                        <CalendarIcon className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Pending requests</p>
                          <p className="text-2xl font-bold text-gray-900">{statTile(stats?.pending)}</p>
                        </div>
                        <Clock className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Accepted</p>
                          <p className="text-2xl font-bold text-gray-900">{statTile(stats?.accepted)}</p>
                        </div>
                        <DollarSign className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Completed</p>
                          <p className="text-2xl font-bold text-gray-900">{statTile(stats?.completed)}</p>
                        </div>
                        <Users className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                  </div>

                  {/* Calendar */}
                  <div className="mb-8">
                    <h4 className="text-lg font-semibold mb-4">Upcoming Events</h4>
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

                  {/* Recent requests live on the Booking requests tab, which
                      reads them from the database. Duplicating them here would
                      mean two views that can disagree. */}
                  <div>
                    <h4 className="text-lg font-semibold mb-4">Booking requests</h4>
                    <div className="bg-white rounded-lg shadow border p-6">
                      <p className="text-gray-600">
                        Accept, decline and complete requests from the{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('bookings')}
                          className="font-medium text-purple-600 hover:underline"
                        >
                          Booking requests
                        </button>{' '}
                        tab.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'bookings' && <VendorBookingRequests />}

              {activeTab === 'messages' && (
                <div className="h-[calc(100vh-12rem)]">
                  <h3 className="text-2xl font-bold mb-6">Messages</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                    {/* Message List */}
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                      <div className="p-4 border-b">
                        <h4 className="font-semibold">Conversations</h4>
                      </div>
                      <div className="overflow-y-auto h-[calc(100vh-16rem)]">
                        {messages.map((message) => (
                          <div
                            key={message.id}
                            onClick={() => setSelectedMessage(message)}
                            className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                              selectedMessage?.id === message.id ? 'bg-purple-50' : ''
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h5 className="font-medium">{message.from}</h5>
                              <span className="text-xs text-gray-500">
                                {format(message.timestamp, 'MMM d, h:mm a')}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 truncate">{message.content}</p>
                            {message.unread && (
                              <span className="inline-block w-2 h-2 bg-purple-600 rounded-full mt-1"></span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden md:col-span-2">
                      {selectedMessage ? (
                        <div className="h-full flex flex-col">
                          <div className="p-4 border-b">
                            <h4 className="font-semibold">{selectedMessage.from}</h4>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4">
                            <div className="space-y-4">
                              <div className="bg-gray-100 rounded-lg p-4 max-w-[80%]">
                                <p className="text-gray-800">{selectedMessage.content}</p>
                                <span className="text-xs text-gray-500 mt-1 block">
                                  {format(selectedMessage.timestamp, 'MMM d, h:mm a')}
                                </span>
                              </div>
                              {messages
                                .filter(
                                  (m) =>
                                    m.from === 'You' &&
                                    m.timestamp > selectedMessage.timestamp
                                )
                                .map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="bg-purple-100 rounded-lg p-4 max-w-[80%] ml-auto"
                                  >
                                    <p className="text-gray-800">{reply.content}</p>
                                    <span className="text-xs text-gray-500 mt-1 block">
                                      {format(reply.timestamp, 'MMM d, h:mm a')}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="p-4 border-t">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                              <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type your message..."
                                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                              />
                              <button
                                type="submit"
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                              >
                                <Send className="h-5 w-5" />
                              </button>
                            </form>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">
                          Select a conversation to start messaging
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Settings</h3>
                  <div className="space-y-8">
                    {/* Profile Settings */}
                    <div className="bg-white rounded-lg shadow p-6">
                      <h4 className="text-lg font-semibold mb-4">Profile Settings</h4>
                      <form className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Business Name
                          </label>
                          <input
                            type="text"
                            className="w-full p-2 border rounded-lg"
                            placeholder="Your business name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Contact Email
                          </label>
                          <input
                            type="email"
                            className="w-full p-2 border rounded-lg"
                            placeholder="contact@business.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            className="w-full p-2 border rounded-lg"
                            placeholder="+91 XXXXX XXXXX"
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

                    {/* Business Hours */}
                    <div className="bg-white rounded-lg shadow p-6">
                      <h4 className="text-lg font-semibold mb-4">Business Hours</h4>
                      <div className="space-y-4">
                        {Object.entries(businessHours).map(([day, hours]) => (
                          <div key={day} className="flex items-center justify-between">
                            <span className="capitalize">{day}</span>
                            <input
                              type="text"
                              value={hours}
                              onChange={(e) =>
                                setBusinessHours((prev) => ({
                                  ...prev,
                                  [day]: e.target.value,
                                }))
                              }
                              className="p-2 border rounded-lg w-48"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
                        >
                          Update Hours
                        </button>
                      </div>
                    </div>

                    {/* Notification Settings */}
                    <div className="bg-white rounded-lg shadow p-6">
                      <h4 className="text-lg font-semibold mb-4">Notification Settings</h4>
                      <div className="space-y-4">
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Email notifications for new bookings
                        </label>
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          SMS notifications for urgent messages
                        </label>
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          Daily booking summary
                        </label>
                        <button
                          type="button"
                          className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
                        >
                          Save Preferences
                        </button>
                      </div>
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

export default VendorDashboard;