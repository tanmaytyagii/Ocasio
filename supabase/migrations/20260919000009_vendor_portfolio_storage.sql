-- ============================================================================
-- Vendor portfolio storage
--
-- vendor_media has carried owner-scoped INSERT/UPDATE/DELETE policies since
-- migration 1, but there was nowhere to put a file: the project had no storage
-- bucket and storage.objects had no policies at all, so every upload was denied
-- by default. This migration supplies the bucket and the four policies that
-- make vendor_media's existing rules reachable.
--
-- Read is public. Portfolio images are rendered to anonymous visitors on vendor
-- pages and marketplace cards, so private objects would mean a signed-URL round
-- trip per image on every listing — cost and latency for no confidentiality,
-- since the whole point of a portfolio is that customers see it. Writes are
-- the part that must be locked down, and they are.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The bucket.
--
-- The size and MIME limits here are the real boundary. The upload UI checks the
-- same things for a decent error message, but a caller who skips the UI is
-- stopped by Storage itself.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-portfolio',
  'vendor-portfolio',
  true,
  5242880,  -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Ownership from the object path.
--
-- Objects live at {vendor_id}/{uuid}.{ext}, so the first path segment is the
-- claim of ownership and has to be checked against the vendors table rather
-- than believed.
--
-- The uuid cast is wrapped because storage.objects.name is free text: a caller
-- can upload to 'nonsense/x.png' and an unguarded cast would raise 22P02
-- instead of simply refusing. Returning false is the correct answer to a
-- malformed path, and it also removes any reliance on AND short-circuiting
-- inside a policy, which Postgres does not guarantee.
--
-- This is also what blocks traversal: '..' is not a uuid, and a nested path
-- like '{other_vendor}/../{me}/x.png' still has its FIRST segment checked.
-- ---------------------------------------------------------------------------
create or replace function public.owns_vendor_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first text := (storage.foldername(p_object_name))[1];
  v_id    uuid;
begin
  if v_first is null or v_first = '' then
    return false;
  end if;

  begin
    v_id := v_first::uuid;
  exception when others then
    return false;
  end;

  return public.owns_vendor(v_id);
end;
$$;

comment on function public.owns_vendor_object(text) is
  'True when the first path segment of a storage object names a vendor the caller owns. Returns false for a malformed path rather than raising.';

revoke all on function public.owns_vendor_object(text) from public;
grant execute on function public.owns_vendor_object(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Policies on storage.objects, scoped to this bucket only.
--
-- Nothing here touches other buckets, and there is deliberately no blanket
-- "authenticated can write" rule: every write re-derives ownership from the
-- vendors table through owns_vendor().
-- ---------------------------------------------------------------------------
drop policy if exists "vendor portfolio: public read" on storage.objects;
create policy "vendor portfolio: public read"
  on storage.objects for select
  using (bucket_id = 'vendor-portfolio');

drop policy if exists "vendor portfolio: owner uploads" on storage.objects;
create policy "vendor portfolio: owner uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-portfolio'
    and public.owns_vendor_object(name)
  );

drop policy if exists "vendor portfolio: owner updates" on storage.objects;
create policy "vendor portfolio: owner updates"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-portfolio'
    and public.owns_vendor_object(name)
  )
  with check (
    bucket_id = 'vendor-portfolio'
    and public.owns_vendor_object(name)
  );

drop policy if exists "vendor portfolio: owner deletes" on storage.objects;
create policy "vendor portfolio: owner deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-portfolio'
    and public.owns_vendor_object(name)
  );
