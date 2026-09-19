import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getFilterOptions } from '../services/vendors';
import { Button } from './ui';
import type { FilterOptions } from '../types/database';

/**
 * Homepage hero.
 *
 * The city list is read from the database rather than hardcoded, so the search
 * cannot offer a city with no vendors behind it. The category list likewise.
 * If that lookup fails the form still works — it degrades to free-text search
 * instead of disappearing.
 */
const Hero = () => {
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getFilterOptions()
      .then((o) => {
        if (active) setOptions(o);
      })
      .catch(() => {
        // Non-fatal: the selects render empty and search still works.
        if (active) setOptions(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (city) params.set('location', city);
    navigate(`/search?${params.toString()}`);
  };

  const selectClass =
    'h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand-500';

  return (
    <section className="relative isolate overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=2000&q=80"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      {/* Directional scrim rather than a flat 40% black: keeps the image
          readable while guaranteeing contrast behind the text. */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/85 via-ink/70 to-ink/40"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-200">
            Event vendor marketplace
          </p>
          <h1 className="mt-4 text-display-sm text-white sm:text-display lg:text-display-lg">
            Book the people who make your event work
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">
            Compare venues, caterers, photographers and decorators across India. Send a booking
            request, track it from request to completion, and review the work afterwards.
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="mt-10 max-w-3xl rounded-panel bg-surface p-4 shadow-overlay"
          role="search"
          aria-label="Find vendors"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label htmlFor="hero-category" className="sr-only">
                Service category
              </label>
              <select
                id="hero-category"
                className={selectClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All services</option>
                {options?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label htmlFor="hero-city" className="sr-only">
                City
              </label>
              <select
                id="hero-city"
                className={selectClass}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">All cities</option>
                {options?.locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="lg" className="md:w-auto">
              <Search className="h-4 w-4" aria-hidden="true" />
              Search vendors
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Hero;
