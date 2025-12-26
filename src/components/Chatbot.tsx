import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';

interface Message {
  type: 'user' | 'bot';
  content: string;
}

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'bot',
      content: 'Hi! I\'m your Occasio assistant. How can I help you plan your event today?'
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateResponse = async (userInput: string) => {
    const input = userInput.toLowerCase();
    
    // Basic response logic based on keywords
    if (input.includes('venue') || input.includes('location')) {
      return "We have various venues available across major Indian cities including Mumbai, Delhi, Bangalore, and more. Would you like to search for venues in a specific city?";
    }
    
    if (input.includes('catering') || input.includes('food')) {
      return "Our catering vendors offer diverse cuisine options from traditional Indian to international dishes. They can accommodate various dietary requirements and event sizes.";
    }
    
    if (input.includes('photography') || input.includes('photographer')) {
      return "We have professional photographers specializing in different event types. They offer services like pre-event shoots, candid photography, and videography.";
    }
    
    if (input.includes('price') || input.includes('cost') || input.includes('budget')) {
      return "Prices vary based on your requirements. Most of our vendors provide customizable packages. Would you like to know the starting price for a specific service?";
    }
    
    if (input.includes('book') || input.includes('booking')) {
      return "To book a vendor, you can visit their profile and click on 'Contact Vendor'. They will get back to you within 24 hours to discuss your requirements.";
    }
    
    if (input.includes('wedding')) {
      return "For weddings, we offer comprehensive services including venues, catering, decoration, photography, and more. Would you like to explore our wedding-specific vendors?";
    }
    
    if (input.includes('corporate') || input.includes('business')) {
      return "We have vendors experienced in handling corporate events of all sizes. This includes conference venues, business catering, and professional event management.";
    }

    return "I can help you find the perfect vendors for your event. Could you please specify what type of service you're looking for (venue, catering, photography, decoration)?";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = { type: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Generate and add bot response
    const response = await generateResponse(input);
    const botMessage: Message = { type: 'bot', content: response };
    setMessages(prev => [...prev, botMessage]);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-purple-600 text-white p-4 rounded-full shadow-lg hover:bg-purple-700 transition-colors"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="bg-white rounded-lg shadow-xl w-96 max-w-full">
          <div className="p-4 bg-purple-600 text-white rounded-t-lg flex justify-between items-center">
            <h3 className="font-semibold">Occasio Assistant</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="h-96 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-4 ${
                  message.type === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                <div
                  className={`inline-block p-3 rounded-lg ${
                    message.type === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <button
                type="submit"
                className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Chatbot;