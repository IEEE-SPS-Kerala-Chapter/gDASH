-- SECURITY FIX: a team's status link showed its details to anyone.
--
-- get_registration_by_token() was callable by anon and returned the team
-- name, entry code, every member's name/college/branch/year/role and the
-- full idea (problem, solution, AI approach, impact) to whoever held the
-- link. The token is unguessable, but links travel — team chats, forwards,
-- screenshots, shared computers — so a competing team holding one could
-- read another team's idea. Reported by security testing on 2026-09-27.
--
-- Now the link alone isn't enough: the caller must also be signed in with a
-- confirmed email that belongs to a member of that team (leader or any
-- member). Checked against auth.users, not the token's email claim, so it
-- holds even if email auto-confirm is ever switched on.

create or replace function get_registration_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
  v_email text;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_email is null then
    return null;
  end if;

  select jsonb_build_object(
    'team', jsonb_build_object(
      'name', t.name,
      'entry_code', t.entry_code,
      'ai_theme', t.ai_theme,
      'district', t.district,
      'status', t.status,
      'created_at', t.created_at
    ),
    'members', (
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'member_code', m.member_code,
        'full_name', m.full_name,
        'is_leader', m.is_leader,
        'college', m.college,
        'branch', m.branch,
        'year', m.year,
        'role_in_team', m.role_in_team
      ) order by m.member_no)
      from team_members m where m.team_id = t.id
    ),
    'registration', jsonb_build_object(
      'problem_statement', r.problem_statement,
      'proposed_solution', r.proposed_solution,
      'ai_approach', r.ai_approach,
      'expected_impact', r.expected_impact,
      'supporting_link', r.supporting_link,
      'status', r.status,
      'created_at', r.created_at
    )
  )
  into v_result
  from teams t
  join registrations r on r.team_id = t.id
  where t.access_token = p_token
    and exists (
      select 1 from team_members tm
      where tm.team_id = t.id and lower(tm.email) = v_email
    );

  return v_result; -- null if no match or not a member; callers must not distinguish
end;
$$;

revoke execute on function get_registration_by_token(text) from public, anon;
grant execute on function get_registration_by_token(text) to authenticated;

-- Same confirmed-email rule for "get back to my status page": use the
-- account's confirmed email from auth.users rather than the token claim.
create or replace function get_my_registration_status_token()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select t.access_token
  from auth.users u
  join team_members m on lower(m.email) = lower(u.email)
  join teams t on t.id = m.team_id
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
  limit 1;
$$;

revoke execute on function get_my_registration_status_token() from public, anon;
grant execute on function get_my_registration_status_token() to authenticated;
