/**
 * Marketplace search, filtering, sorting and pagination (Phase 2).
 *
 * Exercises search_vendors() through PostgREST as an anonymous visitor, which
 * is the same path the browser takes. Assertions are about behaviour — that a
 * filter actually narrows the set, that pages do not overlap — not about
 * whether a function exists.
 */
import { describe, expect, it } from 'vitest';
import { anonClient, stackIsRunning, PUBLIC_VENDOR_COLUMNS } from './helpers/supabase';

const running = await stackIsRunning();

interface Row {
  id: string;
  slug: string;
  business_name: string;
  category: string;
  location: string;
  rating: number;
  review_count: number;
  starting_price: number | null;
  relevance: number;
  total_count: number;
}

async function search(params: Record<string, unknown>): Promise<Row[]> {
  const { data, error } = await anonClient().rpc('search_vendors', params);
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

describe.runIf(running)('search', () => {
  it('returns every active vendor when unfiltered', async () => {
    const rows = await search({ p_limit: 50 });
    expect(rows.length).toBe(40);
    expect(Number(rows[0].total_count)).toBe(40);
  });

  it('matches a category term', async () => {
    const rows = await search({ p_query: 'photography', p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.category === 'Photography')).toBe(true);
  });

  it('matches a city name', async () => {
    const rows = await search({ p_query: 'Mumbai', p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.location === 'Mumbai')).toBe(true);
  });

  it('matches on service name, not just vendor fields', async () => {
    // "drone" appears only in vendor_services, never in a vendor row.
    const rows = await search({ p_query: 'drone', p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.category === 'Photography')).toBe(true);
  });

  it('tolerates a typo via trigram similarity', async () => {
    const rows = await search({ p_query: 'Capture Momets', p_limit: 5 });
    expect(rows.some((r) => r.business_name === 'Capture Moments')).toBe(true);
  });

  it('returns nothing for a term that matches no vendor', async () => {
    const rows = await search({ p_query: 'zzzzznotathing', p_limit: 10 });
    expect(rows).toEqual([]);
  });

  it('ranks a name match above a description-only match', async () => {
    const rows = await search({ p_query: 'Royal Caterers', p_limit: 5 });
    expect(rows[0].business_name).toBe('Royal Caterers');
  });
});

describe.runIf(running)('filters', () => {
  it('filters by category', async () => {
    const rows = await search({ p_category: 'Venues', p_limit: 50 });
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.category === 'Venues')).toBe(true);
  });

  it('filters by location', async () => {
    const rows = await search({ p_location: 'Delhi', p_limit: 50 });
    expect(rows.every((r) => r.location === 'Delhi')).toBe(true);
  });

  it('filters by minimum price', async () => {
    const rows = await search({ p_min_price: 200000, p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => (r.starting_price ?? 0) >= 200000)).toBe(true);
  });

  it('filters by maximum price', async () => {
    const rows = await search({ p_max_price: 100000, p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => (r.starting_price ?? 0) <= 100000)).toBe(true);
  });

  it('filters by a price range', async () => {
    const rows = await search({ p_min_price: 100000, p_max_price: 200000, p_limit: 50 });
    expect(rows.every((r) => (r.starting_price ?? 0) >= 100000 && (r.starting_price ?? 0) <= 200000)).toBe(true);
  });

  it('filters by minimum rating', async () => {
    const rows = await search({ p_min_rating: 4.8, p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.rating >= 4.8)).toBe(true);
  });

  it('filters by service name', async () => {
    const rows = await search({ p_service: 'Live Counters', p_limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.category === 'Catering')).toBe(true);
  });

  it('composes several filters together', async () => {
    const rows = await search({
      p_category: 'Photography',
      p_min_rating: 4.5,
      p_max_price: 400000,
      p_limit: 50,
    });
    expect(
      rows.every(
        (r) => r.category === 'Photography' && r.rating >= 4.5 && (r.starting_price ?? 0) <= 400000,
      ),
    ).toBe(true);
  });

  it('narrows the result set rather than returning everything', async () => {
    const all = await search({ p_limit: 50 });
    const filtered = await search({ p_category: 'Catering', p_limit: 50 });
    expect(filtered.length).toBeLessThan(all.length);
  });
});

describe.runIf(running)('sorting', () => {
  it('sorts by rating, highest first', async () => {
    const rows = await search({ p_sort: 'rating', p_limit: 50 });
    const ratings = rows.map((r) => r.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  it('sorts by price ascending', async () => {
    const rows = await search({ p_sort: 'price_asc', p_limit: 50 });
    const prices = rows.map((r) => r.starting_price ?? 0);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('sorts by price descending', async () => {
    const rows = await search({ p_sort: 'price_desc', p_limit: 50 });
    const prices = rows.map((r) => r.starting_price ?? 0);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it('sorts by review count', async () => {
    const rows = await search({ p_sort: 'reviews', p_limit: 50 });
    const counts = rows.map((r) => r.review_count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('falls back to rating for relevance when there is no query', async () => {
    const rows = await search({ p_sort: 'relevance', p_limit: 50 });
    const ratings = rows.map((r) => r.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });
});

describe.runIf(running)('pagination', () => {
  it('returns one page at a time with a total count', async () => {
    const page1 = await search({ p_limit: 12, p_offset: 0 });
    expect(page1.length).toBe(12);
    expect(Number(page1[0].total_count)).toBe(40);
  });

  it('pages do not overlap', async () => {
    const page1 = await search({ p_sort: 'rating', p_limit: 12, p_offset: 0 });
    const page2 = await search({ p_sort: 'rating', p_limit: 12, p_offset: 12 });
    const overlap = page1.filter((a) => page2.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
  });

  it('paginating covers every vendor exactly once', async () => {
    const seen = new Set<string>();
    for (let offset = 0; offset < 40; offset += 12) {
      const rows = await search({ p_sort: 'rating', p_limit: 12, p_offset: offset });
      rows.forEach((r) => seen.add(r.id));
    }
    expect(seen.size).toBe(40);
  });

  it('returns an empty final page past the end', async () => {
    const rows = await search({ p_limit: 12, p_offset: 500 });
    expect(rows).toEqual([]);
  });

  it('pagination respects filters', async () => {
    const rows = await search({ p_category: 'Venues', p_limit: 5, p_offset: 0 });
    expect(rows.length).toBe(5);
    expect(Number(rows[0].total_count)).toBe(10);
  });
});

describe.runIf(running)('security of the public surface', () => {
  it('never returns owner_id in search results', async () => {
    const rows = await search({ p_limit: 1 });
    expect('owner_id' in rows[0]).toBe(false);
  });

  it('denies an anonymous attempt to read owner_id directly', async () => {
    const { error } = await anonClient().from('vendors').select('owner_id').limit(1);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('denies an anonymous select(*) on vendors, since that would include owner_id', async () => {
    const { error } = await anonClient().from('vendors').select('*').limit(1);
    expect(error).not.toBeNull();
  });

  it('still allows the public column set', async () => {
    const { data, error } = await anonClient()
      .from('vendors')
      .select(PUBLIC_VENDOR_COLUMNS)
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it('search never surfaces an inactive vendor', async () => {
    const rows = await search({ p_limit: 50 });
    const { count } = await anonClient()
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    expect(rows.length).toBe(count);
  });
});

describe.runIf(running)('supporting functions', () => {
  it('category_counts reflects the catalogue', async () => {
    const { data, error } = await anonClient().rpc('category_counts');
    expect(error).toBeNull();
    const counts = data as { category: string; vendor_count: number }[];
    expect(counts.length).toBe(4);
    expect(counts.reduce((sum, c) => sum + Number(c.vendor_count), 0)).toBe(40);
  });

  it('filter_options returns real option lists and price bounds', async () => {
    const { data, error } = await anonClient().rpc('filter_options');
    expect(error).toBeNull();
    const opts = data as {
      categories: string[];
      locations: string[];
      min_price: number;
      max_price: number;
    };
    expect(opts.categories.length).toBe(4);
    expect(opts.locations.length).toBe(10);
    expect(opts.min_price).toBeLessThan(opts.max_price);
  });
});
