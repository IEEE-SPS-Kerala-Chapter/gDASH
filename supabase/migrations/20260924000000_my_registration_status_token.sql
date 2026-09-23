-- Pre-launch review: a leader who lost their status link had no way back to
-- it. The link is shown only once, right after submitting (no email is sent
-- yet), and signing in again at /register only showed "This email is
-- already registered" with a sign-out button.
--
-- This returns the status-page token for the team the signed-in person
-- belongs to (as leader or member), matched on the email in their verified
-- session -- Google or the email sign-in link both prove they own it. Only
-- ever their own team's token; nothing for anyone else, and nothing at all
-- for an anonymous caller.

create or replace function get_my_registration_status_token()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select t.access_token
  from team_members m
  join teams t on t.id = m.team_id
  where auth.uid() is not null
    and lower(m.email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

revoke execute on function get_my_registration_status_token() from public, anon;
grant execute on function get_my_registration_status_token() to authenticated;
