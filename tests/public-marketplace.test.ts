/**
 * Public marketplace tests (Phase 1 brief sections 14, 22, 23).
 *
 * Verifies that vendor discovery works for a signed-out visitor and is backed
 * by the database rather than a client-side catalogue.
 */
import { describe, expect, it } from 'vitest';
import { anonClient, stackIsRunning } from './helpers/supabase';

const running = await stackIsRunning();

describe.runIf(running)('public vendor discovery', () => {
  it('lists active vendors without authentication', async () => {
    const { data, error } = await anonClient()
      .from('vendors')
      .select('*')
      .eq('status', 'active')
      .order('rating', { ascending: false });

    expect(error).toBeNull();
    expect(data!.length).toBe(40);
  });

  it('resolves a vendor by stable slug with services and media', async () => {
    const { data, error } = await anonClient()
      .from('vendors')
      .select('*, vendor_services(*), vendor_media(*)')
      .eq('slug', 'royal-caterers')
      .eq('status', 'active')
      .single();

    expect(error).toBeNull();
    expect(data!.business_name).toBe('Royal Caterers');
    expect(data!.vendor_services.length).toBe(8);
    expect(data!.vendor_media.length).toBe(1);
  });

  it('filters by category', async () => {
    const { data } = await anonClient()
      .from('vendors')
      .select('*')
      .eq('status', 'active')
      .ilike('category', 'venues');

    expect(data!.length).toBe(10);
    expect(data!.every((v: { category: string }) => v.category.toLowerCase() === 'venues')).toBe(true);
  });

  it('filters by location', async () => {
    const { data } = await anonClient()
      .from('vendors')
      .select('*')
      .eq('status', 'active')
      .ilike('location', 'Mumbai');

    expect(data!.every((v: { location: string }) => v.location === 'Mumbai')).toBe(true);
  });

  it('every vendor has a URL-safe slug, so vendor pages are shareable', async () => {
    const { data } = await anonClient().from('vendors').select('slug').eq('status', 'active');
    const slugs = data!.map((v: { slug: string }) => v.slug);

    expect(slugs.every((s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length); // unique
  });

  it('vendor data is identical across reads — it is not regenerated per request', async () => {
    const read = async () => {
      const { data } = await anonClient()
        .from('vendors')
        .select('slug, rating, review_count, location, starting_price')
        .eq('status', 'active')
        .order('slug');
      return JSON.stringify(data);
    };

    expect(await read()).toBe(await read());
  });

  it('a search term matches across name, description, category and location', async () => {
    const term = '%photography%';
    const { data } = await anonClient()
      .from('vendors')
      .select('*')
      .eq('status', 'active')
      .or(
        `business_name.ilike.${term},description.ilike.${term},category.ilike.${term},location.ilike.${term}`,
      );

    expect(data!.length).toBeGreaterThan(0);
  });
});
