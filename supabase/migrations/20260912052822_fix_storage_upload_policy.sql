-- The storage.objects insert policy from the init_schema migration never
-- actually took effect either (anon upload was failing with "new row
-- violates row-level security policy" even with the bucket confirmed to
-- exist via service-role listBuckets()) — re-declaring it here.
drop policy if exists "registration_decks_insert" on storage.objects;
create policy "registration_decks_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'registration-decks');
