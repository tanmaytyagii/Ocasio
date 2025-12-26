import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  author: string;
  date: string;
  category: string;
}

const initialBlogs: BlogPost[] = [
  {
    id: 1,
    title: 'Top Wedding Trends for 2025',
    excerpt: 'Discover the latest trends shaping Indian weddings, from sustainable decorations to AI-powered planning tools.',
    content: `The wedding industry is witnessing a remarkable transformation in 2025, with couples embracing both tradition and innovation. Sustainable decorations are taking center stage, with couples opting for eco-friendly materials and reusable décor elements. Living walls, potted plants, and locally sourced flowers are replacing traditional floral arrangements.

AI-powered planning tools have revolutionized the wedding planning process. From virtual venue tours to AI-assisted guest list management and seating arrangements, technology is making wedding planning more efficient and personalized than ever before.

Personalization continues to be a key trend, with couples incorporating their unique stories and cultural elements into every aspect of their celebration. Interactive food stations, personalized wedding websites, and custom wedding apps are becoming standard features.

The rise of intimate weddings continues, with couples prioritizing meaningful experiences with their closest friends and family over large-scale celebrations. This trend has led to more elaborate pre-wedding events and multi-day celebrations.`,
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    author: 'Khushi Saroha',
    date: 'March 15, 2025',
    category: 'Wedding Planning'
  },
  {
    id: 2,
    title: 'How to Choose the Perfect Venue',
    excerpt: 'A comprehensive guide to selecting the ideal venue for your event, considering budget, capacity, and amenities.',
    content: `Selecting the perfect venue is one of the most crucial decisions in event planning. This comprehensive guide will help you navigate the process with confidence.

First, establish your budget and guest count. These two factors will immediately narrow down your options and help you focus on venues that are truly viable for your event.

Consider the location's accessibility. Is it easy to reach? Is there adequate parking? For destination events, check the proximity to hotels and transportation hubs.

Evaluate the venue's amenities. Does it have built-in audio-visual equipment? What about kitchen facilities? Understanding what's included can help you better estimate the total cost.

Don't forget to consider the season and weather. If you're planning an outdoor event, what's the backup plan? Indoor venues should have proper climate control for all seasons.

Finally, read reviews and ask for references. Speaking with past clients can provide valuable insights into how the venue operates during actual events.`,
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    author: 'Tanmay Tyagi',
    date: 'March 10, 2025',
    category: 'Venues'
  },
  {
    id: 3,
    title: 'Essential Tips for Corporate Event Planning',
    excerpt: 'Learn how to organize successful corporate events, from conferences to team building activities.',
    content: `Corporate events require a unique approach to planning and execution. Here's your guide to organizing successful business events.

Start with clear objectives. Whether it's team building, client appreciation, or product launch, your event's purpose should drive all decisions.

Timeline management is crucial. Create a detailed timeline working backward from the event date, including key milestones and deadlines for various aspects of planning.

Technology integration is essential in 2025. Consider using event apps for registration, networking, and schedule management. Virtual components can increase reach and engagement.

Catering should be professional and accommodate various dietary restrictions. Consider the timing of meals and breaks to maintain energy levels throughout the event.

For team building events, focus on activities that align with company values and promote genuine connection. Avoid generic activities that might feel forced or uncomfortable.

Remember to measure success. Set clear KPIs before the event and gather feedback through surveys and analytics to improve future events.`,
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    author: 'Rohan Sharma',
    date: 'March 5, 2025',
    category: 'Corporate Events'
  },
  {
    id: 4,
    title: 'The Art of Event Photography',
    excerpt: 'Professional tips for capturing memorable moments at events, from equipment selection to post-processing.',
    content: `Event photography requires a unique blend of technical skill, artistic vision, and the ability to anticipate moments before they happen.

Equipment selection is crucial. A full-frame camera with good low-light performance is essential. Always carry backup equipment and multiple lenses to capture both wide shots and intimate moments.

Understanding lighting is key. Master the use of both natural and artificial light. Know when to use flash and when to rely on ambient lighting for more natural results.

Composition techniques specific to events include:
- Using leading lines to draw attention to key subjects
- Capturing candid moments without being intrusive
- Finding unique angles to tell the story
- Creating depth in crowded spaces

Post-processing workflow is equally important. Develop a consistent editing style that enhances the photos while maintaining natural skin tones and accurate colors.

Finally, delivery is crucial. Use a reliable online gallery system and ensure timely delivery of both preview images and final edits.`,
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
    author: 'Ayush Anand',
    date: 'March 1, 2025',
    category: 'Photography'
  }
];

const Blog = () => {
  const [blogs, setBlogs] = useState<BlogPost[]>(initialBlogs);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);
  const [showNewBlogForm, setShowNewBlogForm] = useState(false);
  const [newBlog, setNewBlog] = useState({
    title: '',
    excerpt: '',
    content: '',
    image: '',
    category: ''
  });

  const handleNewBlogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const blogPost: BlogPost = {
      id: blogs.length + 1,
      ...newBlog,
      author: 'Guest Author',
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };
    setBlogs([blogPost, ...blogs]);
    setShowNewBlogForm(false);
    setNewBlog({
      title: '',
      excerpt: '',
      content: '',
      image: '',
      category: ''
    });
  };

  return (
    <div className="pt-16 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Occasio Blog</h1>
          <button
            onClick={() => setShowNewBlogForm(true)}
            className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Write Blog
          </button>
        </div>

        {/* New Blog Form Modal */}
        {showNewBlogForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-4xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Write New Blog</h2>
                <button
                  onClick={() => setShowNewBlogForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleNewBlogSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newBlog.title}
                    onChange={(e) => setNewBlog({ ...newBlog, title: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Excerpt
                  </label>
                  <textarea
                    value={newBlog.excerpt}
                    onChange={(e) => setNewBlog({ ...newBlog, excerpt: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Content
                  </label>
                  <textarea
                    value={newBlog.content}
                    onChange={(e) => setNewBlog({ ...newBlog, content: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    rows={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={newBlog.image}
                    onChange={(e) => setNewBlog({ ...newBlog, image: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={newBlog.category}
                    onChange={(e) => setNewBlog({ ...newBlog, category: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
                  >
                    <option value="">Select Category</option>
                    <option value="Wedding Planning">Wedding Planning</option>
                    <option value="Venues">Venues</option>
                    <option value="Corporate Events">Corporate Events</option>
                    <option value="Photography">Photography</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
                >
                  Publish Blog
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Blog Post Modal */}
        {selectedBlog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="relative">
                <img
                  src={selectedBlog.image}
                  alt={selectedBlog.title}
                  className="w-full h-64 object-cover rounded-t-lg"
                />
                <button
                  onClick={() => setSelectedBlog(null)}
                  className="absolute top-4 right-4 bg-white rounded-full p-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex items-center text-sm text-gray-500 mb-2">
                  <span>{selectedBlog.author}</span>
                  <span className="mx-2">•</span>
                  <span>{selectedBlog.date}</span>
                  <span className="mx-2">•</span>
                  <span>{selectedBlog.category}</span>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  {selectedBlog.title}
                </h2>
                <div className="prose max-w-none">
                  {selectedBlog.content.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="mb-4 text-gray-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {blogs.map((blog) => (
            <article key={blog.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="relative h-64">
                <img
                  src={blog.image}
                  alt={blog.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm">
                    {blog.category}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center text-sm text-gray-500 mb-2">
                  <span>{blog.author}</span>
                  <span className="mx-2">•</span>
                  <span>{blog.date}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {blog.title}
                </h2>
                <p className="text-gray-600 mb-4">{blog.excerpt}</p>
                <button
                  onClick={() => setSelectedBlog(blog)}
                  className="text-purple-600 font-semibold hover:text-purple-700"
                >
                  Read More →
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Blog;