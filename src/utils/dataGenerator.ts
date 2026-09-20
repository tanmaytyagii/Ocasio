export interface Vendor {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviews: number;
  image: string;
  location: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  businessHours: string;
  services: string[];
  pricing: string;
  eventTypes?: string[];
}

const categories = {
  venues: {
    names: [
      'Taj Palace', 'The Leela Palace', 'ITC Grand', 'The Oberoi', 'Ritz-Carlton',
      'JW Marriott', 'Grand Hyatt', 'The Lalit', 'Radisson Blu', 'Shangri-La',
    ],
    services: [
      'Banquet Halls', 'Outdoor Gardens', 'Poolside Venue', 'Rooftop Terrace',
      'Beach Weddings', 'Lawn Setup', 'Indoor Halls', 'Theme Decoration',
    ],
    images: [
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af',
      'https://images.unsplash.com/photo-1562653439-49c2c40441ec',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1527529482837-4698179dc6ce',
      'https://images.unsplash.com/photo-1505236858219-8359eb29e329',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af',
      'https://images.unsplash.com/photo-1515002246390-7bf7e8f87b54',
    ]
  },
  catering: {
    names: [
      'Royal Caterers', 'Flavor Fusion', 'Spice Route', 'Grand Feast', 'Culinary Masters',
      'Taste of India', 'Food Affairs', 'Divine Delicacies', 'Gourmet Solutions', 'Perfect Platter',
    ],
    services: [
      'Multi-Cuisine Menu', 'Live Counters', 'Theme-based Setup', 'International Cuisine',
      'Traditional Indian', 'Dessert Specialties', 'Beverage Service', 'Butler Service',
    ],
    images: [
      'https://images.unsplash.com/photo-1555244162-803834f70033',
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba',
      'https://images.unsplash.com/photo-1521917441209-e886f0404a7b',
      'https://images.unsplash.com/photo-1467003909585-2f8a72700288',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
      'https://images.unsplash.com/photo-1555244162-803834f70033',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      'https://images.unsplash.com/photo-1555244162-803834f70033',
      'https://images.unsplash.com/photo-1521917441209-e886f0404a7b',
    ]
  },
  photography: {
    names: [
      'Capture Moments', 'Light & Shadows', 'Perfect Frame', 'Wedding Stories', 'Candid Chronicles',
      'Memory Makers', 'Pixel Perfect', 'Dream Shots', 'Visual Tales', 'Artistic Angles',
    ],
    services: [
      'Pre-wedding Shoots', 'Candid Photography', 'Drone Shots', 'Cinematography',
      'Same Day Editing', 'Photo Albums', 'Video Highlights', 'Live Streaming',
    ],
    images: [
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32',
      'https://images.unsplash.com/photo-1605774337664-7a846e9cdf17',
      'https://images.unsplash.com/photo-1554941829-202a0b2403b8',
      'https://images.unsplash.com/photo-1472393365320-db77a5abbecc',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
      'https://images.unsplash.com/photo-1519741497674-611481863552',
    ]
  },
  decoration: {
    names: [
      'Dream Decorators', 'Floral Fantasy', 'Royal Decor', 'Theme Creators', 'Elegant Events',
      'Creative Corner', 'Decor Dynamics', 'Style Statements', 'Artistic Affairs', 'Design Dreams',
    ],
    services: [
      'Theme Decoration', 'Floral Arrangements', 'Lighting Setup', 'Stage Design',
      'Entry Decoration', 'Mandap Design', 'Table Settings', 'Props & Accessories',
    ],
    images: [
      'https://images.unsplash.com/photo-1478146896981-b80fe463b330',
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      'https://images.unsplash.com/photo-1470319149473-af271634cecf',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      'https://images.unsplash.com/photo-1470319149473-af271634cecf',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      'https://images.unsplash.com/photo-1470319149473-af271634cecf',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
    ]
  },
};

const cities = [
  'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad',
  'Kolkata', 'Pune', 'Jaipur', 'Ahmedabad', 'Goa',
];

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The catalogue was previously built with Math.random() at module scope, so a
 * vendor's rating, review count, city, price and phone number changed on every
 * page load — and because CategoryPage/SearchResults navigated with <a href>,
 * a full reload meant the vendor you landed on was not the one you clicked.
 *
 * Seeding per vendor makes the catalogue stable across reloads, machines and
 * CI runs, which is a precondition for testing anything.
 *
 * This is demo data. Phase 1 moves it to supabase/seed.sql with fixed UUIDs.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, so each vendor's seed derives from its id. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function generateVendorData(): Vendor[] {
  const vendors: Vendor[] = [];

  Object.entries(categories).forEach(([category, data]) => {
    data.names.forEach((name, index) => {
      // Numbered within the category, not across all of them. The previous
      // counter ran 1..40 globally, so catering started at 11 and the homepage's
      // links to catering-1 / decoration-1 / photography-1 all 404'd.
      const id = `${category}-${index + 1}`;
      const rng = createRng(hashString(id));

      const rating = Math.round((rng() * 1.0 + 4.0) * 10) / 10;
      const reviews = randomInt(rng, 50, 500);
      const cityIndex = randomInt(rng, 0, cities.length - 1);

      const eventTypes = ['Wedding'];
      if (rng() > 0.5) eventTypes.push('Corporate');
      if (rng() > 0.5) eventTypes.push('Birthday');
      if (rng() > 0.5) eventTypes.push('Religious');

      const slug = name.toLowerCase().replace(/\s+/g, '');

      vendors.push({
        id,
        name,
        category: category.charAt(0).toUpperCase() + category.slice(1),
        rating,
        reviews,
        image: `${data.images[index]}?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80`,
        location: cities[cityIndex],
        description: `Premier ${category} service provider specializing in ${eventTypes.join(', ')} events. Known for exceptional service and attention to detail.`,
        phone: `+91 ${randomInt(rng, 70000, 99999)} ${randomInt(rng, 10000, 99999)}`,
        email: `contact@${slug}.com`,
        website: `www.${slug}.com`,
        businessHours: '10:00 AM - 8:00 PM',
        services: data.services,
        pricing: `Starting from ₹${randomInt(rng, 25000, 500000).toLocaleString('en-IN')} onwards`,
        eventTypes,
      });
    });
  });

  return vendors;
}
