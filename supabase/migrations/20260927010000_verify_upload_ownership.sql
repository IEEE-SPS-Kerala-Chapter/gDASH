-- SECURITY FIX: a submission could reference files it didn't upload.
--
-- 20260927000000 checked only the *path*: a file was accepted if its folder
-- matched the submitter's user id, or if it was a legacy pre-folder path
-- (`<uuid>-<name>`), which carries no owner at all. Anyone who learned such
-- a path could attach someone else's government ID or pitch deck to their
-- own team (identity fraud, idea theft), and preview it on the Review step.
-- Reported by security testing on 2026-09-27.
--
-- Now ownership is checked against Storage's own record: storage.objects
-- stores the uploading user's id for every signed-in upload. A path is
-- accepted only if that object exists in the right bucket AND was uploaded
-- by the caller. Legacy anonymous uploads have no owner, so they can no
-- longer be used; leaders re-upload (the app clears them from drafts).

create or replace function public.owns_upload(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_bucket in ('registration-decks', 'member-id-cards')
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = p_bucket
        and o.name = p_path
        and coalesce(o.owner_id, o.owner::text) = auth.uid()::text
    );
$$;

revoke execute on function public.owns_upload(text, text) from public, anon;
grant execute on function public.owns_upload(text, text) to authenticated;

create or replace function enforce_own_upload_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_path text;
  v_bucket text;
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
    v_bucket := 'member-id-cards';
  else
    v_path := new.deck_path;
    v_bucket := 'registration-decks';
  end if;

  if v_path is not null and v_path <> '' and not public.owns_upload(v_bucket, v_path) then
    raise exception 'uploaded file does not belong to this account' using errcode = '42501';
  end if;
  return new;
end;
$$;
