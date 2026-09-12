-- Diagnostic: the registration-decks bucket from the init_schema migration
-- never actually appeared on the remote project (confirmed via
-- supabase.storage.listBuckets() returning an empty array with the anon
-- key). Re-running the same insert here to see the real error, since a
-- prior `db push` reported success without one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-decks',
  'registration-decks',
  false,
  20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

