/**
 * The demo catalogue (src/utils/dataGenerator.ts → supabase/seed.sql).
 *
 * Sample data is published with the repository, so it must not point at real
 * people or businesses. The audit (docs/SECURITY_AUDIT.md, F-08) found real
 * hotel brands listed as Ocasio vendors with invented ratings, and contact
 * details drawn from realistic ranges — a random Indian mobile number can be a
 * real person's, a .com domain a real company's. These keep it from coming back.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateVendorData } from '../src/utils/dataGenerator';

const vendors = generateVendorData();
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');

/** National and international hotel chains operating in India. */
const REAL_BRANDS = [
  'Taj', 'Leela', 'ITC', 'Oberoi', 'Ritz', 'Marriott', 'Hyatt', 'Lalit', 'Radisson',
  'Shangri', 'Hilton', 'Westin', 'Novotel', 'Trident', 'Vivanta', 'Sheraton',
];

describe('demo catalogue', () => {
  it('generates the same catalogue every time', () => {
    expect(generateVendorData()).toEqual(vendors);
  });

  it('names no real hotel brand', () => {
    const named = vendors.filter((v) => REAL_BRANDS.some((b) => new RegExp(`\\b${b}\\b`, 'i').test(v.name)));
    expect(named.map((v) => v.name)).toEqual([]);
  });

  it('uses phone numbers no real line can have', () => {
    // No Indian number has 0 straight after the country code.
    for (const v of vendors) expect(v.phone).toMatch(/^\+91 00000 \d{5}$/);
  });

  it('uses only RFC 2606 .example domains for email and website', () => {
    for (const v of vendors) {
      expect(v.email).toMatch(/^contact@[a-z&]+\.example$/);
      expect(v.website).toMatch(/^www\.[a-z&]+\.example$/);
    }
  });

  it('the committed seed.sql matches the generator', () => {
    // Regenerate with `npm run db:seed:generate` after changing the generator.
    for (const v of vendors) {
      expect(seed).toContain(`'${v.name.replace(/'/g, "''")}'`);
      expect(seed).toContain(`'${v.email}'`);
    }
    expect(seed).not.toMatch(/\+91 [6-9]\d{4} \d{5}/);
    expect(seed).not.toMatch(/@[a-z&]+\.com'/);
  });
});
