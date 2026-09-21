-- Client requirement: "Duplicate Data Validation — check duplicate email IDs,
-- phone numbers and other applicable unique identifiers" (Priority: High).
--
-- Email was already fully covered (team_members_email_unique_idx, enforced
-- inside submit_registration()). Phone had none: same format-only regex
-- check as always, but nothing stopped the same number being reused across
-- members, teams, or even twice in one submission.
--
-- This migration:
--   1. Adds a normalize_phone() helper so "+919876543210", "919876543210"
--      and "9876543210" all compare as the same number (strict about
--      digits, but not about how the +91 country code was typed).
--   2. Adds a unique index on team_members using that normalized form.
--   3. Updates submit_registration() to tell a phone collision apart from
--      an email collision (both raised as the same unique_violation
--      before this) so the app can show the right message for each.
--   4. Adds check_duplicate_contact(), a small anon-callable RPC so the
--      registration form can warn "already registered" live, per field, as
--      the leader types — instead of only failing at final submit after
--      all 4 steps and file uploads are done.

-- ============================================================================
-- normalize_phone() — mirrors lib/phone.ts's normalizePhone() exactly.
-- Keep both in sync if this logic ever changes.
-- ============================================================================

create or replace function normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) = 12
      and regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') like '91%'
    then substring(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') from 3)
    else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  end;
$$;

create unique index if not exists team_members_phone_unique_idx
  on team_members (normalize_phone(phone));

-- ============================================================================
-- submit_registration — same body as 20260920000000, plus: distinguishing
-- a phone unique_violation from an email one via the constraint name, on
-- both the leader insert and the per-member insert.
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
  v_constraint text;
begin
  if auth.uid() is null
    or auth.email() is null
    or lower(auth.email()) is distinct from lower(coalesce(p_leader ->> 'email', ''))
  then
    raise exception 'leader email must match the verified signed-in account' using errcode = '42501';
  end if;

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
    or coalesce(char_length(p_leader ->> 'branch'), 0) not between 2 and 60
    or (p_leader ->> 'year') not in ('1st year', '2nd year', '3rd year', '4th year', 'PG')
    or coalesce(char_length(p_leader ->> 'id_card_path'), 0) not between 1 and 512
  then
    raise exception 'invalid leader details' using errcode = '22023';
  end if;

  v_member_count := 1 + coalesce(jsonb_array_length(p_members), 0);
  if v_member_count < 2 or v_member_count > 5 then
    raise exception 'team size must be between 2 and 5 members' using errcode = '22023';
  end if;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    if coalesce(char_length(v_member ->> 'full_name'), 0) not between 2 and 80
      or (v_member ->> 'email') !~* v_email_re
      or (v_member ->> 'phone') !~ v_phone_re
      or coalesce(char_length(v_member ->> 'college'), 0) not between 2 and 120
      or coalesce(char_length(v_member ->> 'role_in_team'), 0) not between 2 and 60
      or coalesce(char_length(v_member ->> 'id_card_path'), 0) not between 1 and 512
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
    or char_length(coalesce(p_deck_path, '')) not between 1 and 512
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
    insert into team_members (team_id, full_name, email, phone, college, branch, year, id_card_path, is_leader)
    values (
      v_team_id,
      p_leader ->> 'full_name',
      p_leader ->> 'email',
      p_leader ->> 'phone',
      p_leader ->> 'college',
      p_leader ->> 'branch',
      p_leader ->> 'year',
      p_leader ->> 'id_card_path',
      true
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'team_members_phone_unique_idx' then
      raise exception 'member phone already registered' using errcode = '23505';
    else
      raise exception 'member email already registered' using errcode = '23505';
    end if;
  end;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    begin
      insert into team_members (team_id, full_name, email, phone, college, branch, year, role_in_team, id_card_path, is_leader)
      values (
        v_team_id,
        v_member ->> 'full_name',
        v_member ->> 'email',
        v_member ->> 'phone',
        v_member ->> 'college',
        v_member ->> 'branch',
        v_member ->> 'year',
        v_member ->> 'role_in_team',
        v_member ->> 'id_card_path',
        false
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'team_members_phone_unique_idx' then
        raise exception 'member phone already registered' using errcode = '23505';
      else
        raise exception 'member email already registered' using errcode = '23505';
      end if;
    end;
  end loop;

  insert into registrations (
    team_id, problem_statement, proposed_solution, ai_approach, expected_impact,
    supporting_link, deck_path,
    declaration_eligibility, declaration_originality, declaration_rules, declaration_media_consent
  )
  values (
    v_team_id, p_problem_statement, p_proposed_solution, p_ai_approach, p_expected_impact,
    nullif(p_supporting_link, ''), p_deck_path,
    p_declaration_eligibility, p_declaration_originality, p_declaration_rules, p_declaration_media_consent
  );

  perform log_audit_event(
    'team.registered',
    'team',
    v_team_id,
    p_team_name,
    jsonb_build_object('ai_theme', p_ai_theme, 'district', p_district, 'member_count', v_member_count)
  );

  return jsonb_build_object('team_id', v_team_id, 'access_token', v_access_token);
end;
$$;

grant execute on function submit_registration(
  text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to anon, authenticated;

-- ============================================================================
-- check_duplicate_contact — live pre-submit check for the registration form.
-- Existence-only (like member_exists), so a garbage/malicious value just
-- gets a plain boolean back, never any other team's data.
-- ============================================================================

create or replace function check_duplicate_contact(p_email text default null, p_phone text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'email_taken', case
      when p_email is null or btrim(p_email) = '' then false
      else exists (select 1 from team_members where lower(email) = lower(btrim(p_email)))
    end,
    'phone_taken', case
      when p_phone is null or btrim(p_phone) = '' then false
      else exists (select 1 from team_members where normalize_phone(phone) = normalize_phone(p_phone))
    end
  );
$$;

grant execute on function check_duplicate_contact(text, text) to anon, authenticated;
