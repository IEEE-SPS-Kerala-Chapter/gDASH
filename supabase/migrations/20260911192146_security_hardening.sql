-- Security hardening for the registration RPC surface.
--
-- submit_registration() and get_registration_by_token() are the only two
-- writable/readable paths for anon, and both are called with the public
-- anon/publishable key. That key — and the RPC names — are visible to
-- anyone inspecting network traffic, so "goes through our Next.js Zod
-- validation" is NOT a real guarantee: a direct POST to
-- /rest/v1/rpc/submit_registration bypasses the app entirely. This
-- migration pushes the important checks down into the database itself,
-- which every caller must go through regardless of how they call it.
--
-- Written idempotently so it can be safely re-run while iterating.

-- ============================================================================
-- Table-level CHECK constraints (defense in depth, applies even if the
-- function below is ever changed and a check is dropped by mistake)
-- ============================================================================

alter table teams drop constraint if exists teams_name_length;
alter table teams add constraint teams_name_length check (char_length(name) between 3 and 50);

alter table team_members drop constraint if exists team_members_full_name_length;
alter table team_members add constraint team_members_full_name_length check (char_length(full_name) between 2 and 80);

alter table team_members drop constraint if exists team_members_email_format;
alter table team_members add constraint team_members_email_format
  check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' and char_length(email) <= 254);

alter table team_members drop constraint if exists team_members_phone_format;
alter table team_members add constraint team_members_phone_format
  check (phone ~ '^\+?[0-9]{10,13}$');

alter table team_members drop constraint if exists team_members_college_length;
alter table team_members add constraint team_members_college_length check (char_length(college) between 2 and 120);

alter table team_members drop constraint if exists team_members_branch_length;
alter table team_members add constraint team_members_branch_length
  check (branch is null or char_length(branch) between 2 and 60);

alter table team_members drop constraint if exists team_members_role_length;
alter table team_members add constraint team_members_role_length
  check (role_in_team is null or char_length(role_in_team) between 2 and 60);

alter table registrations drop constraint if exists registrations_supporting_link_length;
alter table registrations add constraint registrations_supporting_link_length
  check (supporting_link is null or char_length(supporting_link) <= 2048);

alter table registrations drop constraint if exists registrations_deck_path_length;
alter table registrations add constraint registrations_deck_path_length
  check (deck_path is null or char_length(deck_path) <= 512);

-- ============================================================================
-- submit_registration — add friendly pre-checks ahead of the CHECK
-- constraints above, plus a couple of gaps the original version left open:
-- rejecting missing/blank required leader fields before they hit a raw
-- not-null-constraint error, and re-validating member emails/phones so a
-- direct API call can't skip the same rules the UI enforces.
-- ============================================================================

create or replace function submit_registration(
  p_team_name text,
  p_ai_theme text,
  p_district text,
  p_leader jsonb,
  p_members jsonb,
  p_problem_statement text,
  p_proposed_solution text,
  p_ai_approach text,
  p_expected_impact text,
  p_supporting_link text,
  p_deck_path text,
  p_declaration_eligibility boolean,
  p_declaration_originality boolean,
  p_declaration_rules boolean,
  p_declaration_media_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_access_token text;
  v_member jsonb;
  v_member_count int;
  v_email_re text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  v_phone_re text := '^\+?[0-9]{10,13}$';
begin
  if not (p_declaration_eligibility and p_declaration_originality and p_declaration_rules) then
    raise exception 'required declarations not confirmed' using errcode = '22023';
  end if;

  if p_team_name is null or char_length(p_team_name) not between 3 and 50 then
    raise exception 'invalid team name' using errcode = '22023';
  end if;

  if p_leader is null
    or coalesce(char_length(p_leader ->> 'full_name'), 0) not between 2 and 80
    or (p_leader ->> 'email') !~* v_email_re
    or (p_leader ->> 'phone') !~ v_phone_re
    or coalesce(char_length(p_leader ->> 'college'), 0) not between 2 and 120
  then
    raise exception 'invalid leader details' using errcode = '22023';
  end if;

  v_member_count := 1 + coalesce(jsonb_array_length(p_members), 0);
  if v_member_count < 1 or v_member_count > 5 then
    raise exception 'team size must be between 1 and 5 members' using errcode = '22023';
  end if;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    if coalesce(char_length(v_member ->> 'full_name'), 0) not between 2 and 80
      or (v_member ->> 'email') !~* v_email_re
      or (v_member ->> 'phone') !~ v_phone_re
      or coalesce(char_length(v_member ->> 'college'), 0) not between 2 and 120
      or (v_member ->> 'year') is not null and (v_member ->> 'year') not in ('1st year', '2nd year', '3rd year', '4th year', 'PG')
    then
      raise exception 'invalid member details' using errcode = '22023';
    end if;
  end loop;

  if char_length(coalesce(p_problem_statement, '')) not between 50 and 1500
    or char_length(coalesce(p_proposed_solution, '')) not between 50 and 1500
    or char_length(coalesce(p_ai_approach, '')) not between 30 and 1500
    or char_length(coalesce(p_expected_impact, '')) not between 30 and 1500
    or char_length(coalesce(p_supporting_link, '')) > 2048
    or char_length(coalesce(p_deck_path, '')) > 512
  then
    raise exception 'invalid idea details' using errcode = '22023';
  end if;

  begin
    insert into teams (name, ai_theme, district)
    values (p_team_name, p_ai_theme, p_district)
    returning id, access_token into v_team_id, v_access_token;
  exception when unique_violation then
    raise exception 'team name taken' using errcode = '23505';
  end;

  begin
    insert into team_members (team_id, full_name, email, phone, college, is_leader)
    values (
      v_team_id,
      p_leader ->> 'full_name',
      p_leader ->> 'email',
      p_leader ->> 'phone',
      p_leader ->> 'college',
      true
    );
  exception when unique_violation then
    raise exception 'member email already registered' using errcode = '23505';
  end;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    begin
      insert into team_members (team_id, full_name, email, phone, college, branch, year, role_in_team, is_leader)
      values (
        v_team_id,
        v_member ->> 'full_name',
        v_member ->> 'email',
        v_member ->> 'phone',
        v_member ->> 'college',
        v_member ->> 'branch',
        v_member ->> 'year',
        v_member ->> 'role_in_team',
        false
      );
    exception when unique_violation then
      raise exception 'member email already registered' using errcode = '23505';
    end;
  end loop;

  insert into registrations (
    team_id, problem_statement, proposed_solution, ai_approach, expected_impact,
    supporting_link, deck_path,
    declaration_eligibility, declaration_originality, declaration_rules, declaration_media_consent
  )
  values (
    v_team_id, p_problem_statement, p_proposed_solution, p_ai_approach, p_expected_impact,
    nullif(p_supporting_link, ''), nullif(p_deck_path, ''),
    p_declaration_eligibility, p_declaration_originality, p_declaration_rules, p_declaration_media_consent
  );

  return jsonb_build_object('team_id', v_team_id, 'access_token', v_access_token);
end;
$$;

grant execute on function submit_registration(
  text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to anon, authenticated;
