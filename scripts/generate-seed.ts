/**
 * Emits supabase/seed.sql from the Phase 0 deterministic catalogue.
 *
 * Run with: npx tsx scripts/generate-seed.ts > supabase/seed.sql
 *
 * The OUTPUT is committed, not generated at deploy time — the database must be
 * reproducible from source control alone. Re-run this only when the demo
 * catalogue changes, and commit the regenerated SQL.
 */
import { createHash } from 'node:crypto';
import { generateVendorData } from '../src/utils/dataGenerator.ts';

/** Deterministic UUIDv5-style id derived from a stable key. */
function uuidFor(key: string): string {
  const h = createHash('sha1').update(`ocasio:${key}`).digest('hex');
  // Force version 4 / variant bits so Postgres accepts it as a well-formed uuid.
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

const q = (s: string | null | undefined) =>
  s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const vendors = generateVendorData();

const lines: string[] = [];
lines.push(`-- Ocasio — deterministic demo seed
--
-- GENERATED FILE — do not edit by hand.
-- Regenerate with: npx tsx scripts/generate-seed.ts > supabase/seed.sql
--
-- ############################################################################
-- #  DEMO DATA ONLY.                                                         #
-- #  These are NOT real businesses. Names, ratings, review counts, prices,   #
-- #  phone numbers and email addresses are fabricated for development.       #
-- #  Every seeded vendor is owned by a profile named 'Ocasio Demo Vendor'    #
-- #  so demo rows can be identified and purged before real vendors onboard.  #
-- ############################################################################
--
-- Values are byte-identical to the Phase 0 client catalogue, so migrating
-- vendor discovery to the database changes no visible content.

begin;

-- Demo auth users. The on_auth_user_created trigger creates their profiles.`);

const vendorRows: string[] = [];
const serviceRows: string[] = [];
const mediaRows: string[] = [];
const userRows: string[] = [];
const profileNameUpdates: string[] = [];

for (const v of vendors) {
  const slug = slugify(v.name);
  const userId = uuidFor(`user:${slug}`);
  const vendorId = uuidFor(`vendor:${slug}`);
  const email = `demo+${slug}@ocasio.test`;

  userRows.push(
    `  (${q('00000000-0000-0000-0000-000000000000')}, ${q(userId)}, 'authenticated', 'authenticated', ${q(email)}, crypt('demo-password-not-for-production', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ocasio Demo Vendor"}'::jsonb, '', '', '', '')`,
  );

  profileNameUpdates.push(userId);

  const startingPrice = Number(v.pricing.replace(/[^0-9]/g, '')) || null;

  vendorRows.push(
    `  (${q(vendorId)}, ${q(userId)}, ${q(v.name)}, ${q(slug)}, ${q(v.description)}, ` +
      `${q(v.category)}, ${q(v.location)}, 'active', ${q(v.phone)}, ${q(v.email)}, ${q(v.website)}, ` +
      `${q(v.businessHours)}, ${q(v.image)}, ${v.rating}, ${v.reviews}, ${startingPrice ?? 'null'})`,
  );

  v.services.forEach((name, i) => {
    serviceRows.push(`  (${q(uuidFor(`service:${slug}:${name}`))}, ${q(vendorId)}, ${q(name)}, null, null, ${i})`);
  });

  mediaRows.push(`  (${q(uuidFor(`media:${slug}:0`))}, ${q(vendorId)}, ${q(v.image)}, ${q(`${v.name} — portfolio image`)}, 0)`);
}

lines.push(`insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
${userRows.join(',\n')}
on conflict (id) do nothing;
`);

lines.push(`-- Mark demo profiles, and grant them the vendor role.
--
-- These seeded vendors represent ALREADY-APPROVED businesses, so they carry
-- role='vendor' and status='active'. That is the state an admin review would
-- produce. A real signup can never reach it on its own: handle_new_user() always
-- writes role='customer', request_vendor_onboarding() always writes
-- status='pending', and both guard triggers reject self-promotion. This
-- statement works only because seeding runs with no end-user identity attached.
update public.profiles
set full_name = 'Ocasio Demo Vendor',
    role      = 'vendor'
where id in (${profileNameUpdates.map(q).join(', ')});
`);

lines.push(`insert into public.vendors
  (id, owner_id, business_name, slug, description, category, location, status,
   phone, email, website, business_hours, hero_image_url, rating, review_count, starting_price)
values
${vendorRows.join(',\n')}
on conflict (id) do nothing;
`);

lines.push(`insert into public.vendor_services (id, vendor_id, name, description, price, sort_order)
values
${serviceRows.join(',\n')}
on conflict (id) do nothing;
`);

lines.push(`insert into public.vendor_media (id, vendor_id, url, alt_text, sort_order)
values
${mediaRows.join(',\n')}
on conflict (id) do nothing;
`);

lines.push('commit;');

process.stdout.write(lines.join('\n') + '\n');
