-- New private bucket for per-member ID-card photos, mirroring
-- registration-decks' exact bucket+policy shape (single anon/authenticated
-- INSERT policy, no read policy — reads only ever go through a service-role
-- signed URL minted by an admin-gated Server Action).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-id-cards',
  'member-id-cards',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "member_id_cards_insert" on storage.objects;
create policy "member_id_cards_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'member-id-cards');

-- Nullable at the DB level (like registrations.deck_path) — required-ness is
-- enforced at the Zod/UI layer and inside submit_registration()'s own
-- checks, not here, so a script-driven test insert never breaks on it.
alter table team_members add column if not exists id_card_path text;
alter table team_members drop constraint if exists team_members_id_card_path_length;
alter table team_members add constraint team_members_id_card_path_length
  check (id_card_path is null or char_length(id_card_path) <= 512);
