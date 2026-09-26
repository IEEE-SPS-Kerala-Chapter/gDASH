-- SECURITY FIX: anyone could upload files without signing in.
--
-- The insert policies on both participant buckets allowed the `anon` role
-- with only a bucket check, so anyone holding the public anon key (it ships
-- in the site's JavaScript) could upload unlimited files to
-- registration-decks and member-id-cards. Reported by security testing on
-- 2026-09-27.
--
-- Leaders are always signed in before they see the form
-- (LEADER_VERIFICATION_ENABLED in lib/config.ts), so uploads now require a
-- session, and each file must go in a folder named after the uploader's own
-- user id: `<auth.uid()>/<uuid>-<file name>` (lib/upload-path.ts). No
-- update/delete policies exist, so nobody can overwrite or remove files.
-- Reads stay service-role only, as before.

drop policy if exists "registration_decks_insert" on storage.objects;
create policy "registration_decks_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'registration-decks'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "member_id_cards_insert" on storage.objects;
create policy "member_id_cards_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'member-id-cards'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- A submission may only reference the submitter's own uploads (or a legacy,
-- pre-folder path). Otherwise a team could point at someone else's file —
-- and deleting that team would then delete the other person's file too.
-- Checked here rather than only in the app, because submit_registration()
-- can be called directly over the API.
create or replace function enforce_own_upload_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_path text;
begin
  -- Trusted callers only: the service role, or a direct database session
  -- (SQL Editor, migrations), which carries no API token at all. Don't
  -- test current_user — inside the SECURITY DEFINER submit_registration()
  -- it's the function owner (postgres) even for an ordinary API caller.
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  -- Separate branches: a CASE naming new.deck_path would fail on
  -- team_members rows (no such column) even when not taken.
  if tg_table_name = 'team_members' then
    v_path := new.id_card_path;
  else
    v_path := new.deck_path;
  end if;

  if v_path is not null and v_path <> '' and position('/' in v_path) > 0
     and (split_part(v_path, '/', 1) <> coalesce(auth.uid()::text, '')
          or v_path like '%..%'
          or array_length(string_to_array(v_path, '/'), 1) <> 2)
  then
    raise exception 'uploaded file does not belong to this account' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_own_upload_path on team_members;
create trigger team_members_own_upload_path
  before insert or update of id_card_path on team_members
  for each row execute function enforce_own_upload_path();

drop trigger if exists registrations_own_upload_path on registrations;
create trigger registrations_own_upload_path
  before insert or update of deck_path on registrations
  for each row execute function enforce_own_upload_path();

revoke execute on function enforce_own_upload_path() from public, anon, authenticated;

-- Same exemption fix for the profiles guard added on 2026-09-26: it trusted
-- current_user = postgres, which is also true inside any SECURITY DEFINER
-- function called over the API. Only the service role or a token-less
-- direct session may change a profile's role or identity.
create or replace function profiles_protect_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'staff profiles can only be created by the server' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'profile role and identity can only be changed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
