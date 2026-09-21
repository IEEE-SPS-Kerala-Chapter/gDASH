-- Client requirement: "Team Name Validation — basic validation for team
-- names. Check for duplicate/similar team names where applicable."
--
-- Exact duplicates (case-insensitive) were already fully enforced via
-- teams_name_lower_idx. This migration:
--   1. Adds basic character rules — a team name must contain at least one
--      letter and only use letters/digits/spaces/' & . - (no symbols,
--      emoji, or a name that's just whitespace/punctuation).
--   2. Extends "duplicate" to also catch whitespace-only variants
--      ("Neural  Nadi" vs "Neural Nadi") — same normalize-then-compare
--      pattern already used for phone numbers.
--   3. Adds a genuinely fuzzy "similar" check (pg_trgm trigram
--      similarity), hard-blocked the same as an exact duplicate — per
--      confirmed decision, a near-duplicate ("Neura Nadi" vs an existing
--      "Neural Nadi") is rejected outright, not just warned about.
--   4. Adds check_team_name_available(), a live pre-submit RPC mirroring
--      check_duplicate_contact() for email/phone, so this surfaces while
--      the leader is still typing, not only at final submit.

create extension if not exists pg_trgm with schema public;

-- ============================================================================
-- normalize_team_name() — mirrors normalize_phone()'s role: lowercased,
-- with internal whitespace collapsed to a single space, so uniqueness and
-- similarity comparisons both ignore case and incidental spacing.
-- ============================================================================

create or replace function normalize_team_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

drop index if exists teams_name_lower_idx;
create unique index if not exists teams_name_normalized_idx
  on teams (normalize_team_name(name));

alter table teams drop constraint if exists teams_name_charset;
alter table teams add constraint teams_name_charset
  check (name ~ '^[A-Za-z0-9 ''&.\-]+$' and name ~ '[A-Za-z]');

-- ============================================================================
-- find_similar_team_name() — internal helper (not directly RPC-callable;
-- only ever invoked from within the SECURITY DEFINER functions below).
-- Threshold is a single, tunable constant used by both callers.
-- ============================================================================

create or replace function find_similar_team_name(p_team_name text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select name
  from teams
  where similarity(normalize_team_name(name), normalize_team_name(p_team_name)) >= 0.55
    and normalize_team_name(name) <> normalize_team_name(p_team_name)
  order by similarity(normalize_team_name(name), normalize_team_name(p_team_name)) desc
  limit 1;
$$;

-- ============================================================================
-- check_team_name_available — live pre-submit check, same shape/spirit as
-- check_duplicate_contact(). anon-callable, existence-only.
-- ============================================================================

create or replace function check_team_name_available(p_team_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_norm text := normalize_team_name(p_team_name);
  v_similar_name text;
begin
  if v_norm = '' then
    return jsonb_build_object('available', true, 'reason', null, 'similar_to', null);
  end if;

  if exists (select 1 from teams where normalize_team_name(name) = v_norm) then
    return jsonb_build_object('available', false, 'reason', 'taken', 'similar_to', null);
  end if;

  v_similar_name := find_similar_team_name(p_team_name);
  if v_similar_name is not null then
    return jsonb_build_object('available', false, 'reason', 'similar', 'similar_to', v_similar_name);
  end if;

  return jsonb_build_object('available', true, 'reason', null, 'similar_to', null);
end;
$$;

grant execute on function check_team_name_available(text) to anon, authenticated;

-- ============================================================================
-- submit_registration — same body as 20260921020000, plus: character-set
-- validation and the hard-blocking similarity check, both ahead of the
-- teams insert.
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
  v_window registration_window;
  v_similar_name text;
begin
  select * into v_window from registration_window where id = true;
  if v_window.is_open is distinct from true
    or (v_window.closes_at is not null and now() >= v_window.closes_at)
  then
    raise exception 'registration is closed' using errcode = '42501';
  end if;

  if auth.uid() is null
    or auth.email() is null
    or lower(auth.email()) is distinct from lower(coalesce(p_leader ->> 'email', ''))
  then
    raise exception 'leader email must match the verified signed-in account' using errcode = '42501';
  end if;

  if not (p_declaration_eligibility and p_declaration_originality and p_declaration_rules) then
    raise exception 'required declarations not confirmed' using errcode = '22023';
  end if;

  if p_team_name is null
    or char_length(p_team_name) not between 3 and 50
    or p_team_name !~ '^[A-Za-z0-9 ''&.\-]+$'
    or p_team_name !~ '[A-Za-z]'
  then
    raise exception 'invalid team name' using errcode = '22023';
  end if;

  v_similar_name := find_similar_team_name(p_team_name);
  if v_similar_name is not null then
    raise exception 'team name too similar to an existing team: %', v_similar_name using errcode = '23505';
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
