/**
 * The build-time meta policy that pins images and connections to the build's
 * own Supabase project (vite.config.ts, docs/SECURITY_AUDIT.md F-12).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pinnedSupabasePolicy } from '../vite.config';

const headerPolicy = (
  JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[];
  }
).headers[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value;

const directive = (policy: string, name: string) =>
  policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `))!.split(/\s+/).slice(1);

describe('pinning the CSP to one Supabase project', () => {
  const pinned = pinnedSupabasePolicy(headerPolicy, 'https://abcdefghijklmnop.supabase.co/');

  it('replaces the wildcard with the exact project origin in img-src and connect-src', () => {
    for (const name of ['img-src', 'connect-src']) {
      expect(directive(pinned, name)).toContain('https://abcdefghijklmnop.supabase.co');
      expect(directive(pinned, name)).not.toContain('https://*.supabase.co');
    }
    expect(pinned).not.toContain('*');
  });

  it('keeps every other source the header allows for those directives', () => {
    for (const name of ['img-src', 'connect-src']) {
      const expected = directive(headerPolicy, name).filter((s) => s !== 'https://*.supabase.co');
      expect(directive(pinned, name)).toEqual(expect.arrayContaining(expected));
    }
    // Razorpay Checkout's telemetry still connects.
    expect(directive(pinned, 'connect-src')).toContain('https://lumberjack.razorpay.com');
  });

  it('restricts nothing else: only the two directives are in the meta policy', () => {
    expect(pinned.split(';').map((d) => d.trim().split(/\s+/)[0])).toEqual(['img-src', 'connect-src']);
  });

  it('pins a local stack or a custom domain the same way', () => {
    expect(directive(pinnedSupabasePolicy(headerPolicy, 'http://127.0.0.1:54321'), 'img-src')).toContain(
      'http://127.0.0.1:54321',
    );
    expect(directive(pinnedSupabasePolicy(headerPolicy, 'https://db.example.org'), 'connect-src')).toContain(
      'https://db.example.org',
    );
  });

  it('refuses a header policy without the directives it pins', () => {
    expect(() => pinnedSupabasePolicy("default-src 'self'", 'https://x.supabase.co')).toThrow(/img-src/);
  });
});
