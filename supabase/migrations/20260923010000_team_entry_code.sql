-- The "Entry ID" shown in the admin team header/record panel (teamDisplayCode
-- in lib/team-code.ts) was purely cosmetic: the first 4 hex characters of
-- the team's own UUID, computed on the fly, never checked against other
-- teams. With only 65,536 possible values, two different teams could easily
-- end up showing the identical label as the event scales -- it looked like
-- an ID but never actually was one.
--
-- This adds a real one: entry_code, generated once at submission time,
-- checked for uniqueness against every other team via a retry loop (not
-- just trusted to be probably-unique), and stored on the row so it's a
-- stable, real identifier from then on -- usable for badges, check-in, or
-- verbally referencing a team at the event, not just a dashboard label.

alter table teams add column if not exists entry_code text;

-- ============================================================================
-- generate_entry_code() — GIG-XXXXXX from a 31-character alphabet (digits
-- 2-9, A-Z minus I/L/O) chosen to avoid characters easily confused when
-- read aloud or handwritten on a badge. 31^6 ≈ 887M possible codes.
-- ============================================================================

create or replace function generate_entry_code()
returns text
language plpgsql
as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text := 'GIG-';
begin
  for i in 1..6 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end;
$$;

-- ============================================================================
-- Backfill every existing team with a real, unique code before the column
-- becomes NOT NULL + UNIQUE below. Each iteration regenerates on collision
-- against codes already assigned in this same backfill, not just past rows.
-- ============================================================================

do $$
declare
  v_team record;
  v_code text;
begin
  for v_team in select id from teams where entry_code is null loop
    loop
      v_code := generate_entry_code();
      exit when not exists (select 1 from teams where entry_code = v_code);
    end loop;
    update teams set entry_code = v_code where id = v_team.id;
  end loop;
end;
$$;

alter table teams alter column entry_code set not null;
alter table teams drop constraint if exists teams_entry_code_key;
alter table teams add constraint teams_entry_code_key unique (entry_code);

-- ============================================================================
-- submit_registration — same body as 20260922010000, plus: generate a
-- unique entry_code before the teams insert, retrying on the rare collision
-- rather than trusting 887M possibilities to never repeat. The name-taken
-- and entry-code-collision cases share the same unique_violation exception
-- class (23505), so constraint_name (not the error code) is what tells them
-- apart -- same reasoning as the phone/email disambiguation below it.
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
  v_entry_code text;
  v_member jsonb;
  v_member_count int;
  v_email_re text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  v_phone_re text := '^\+?[0-9]{10,13}$';
  v_constraint text;
  v_window registration_window;
  v_similar_name text;
  v_attempt int := 0;
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

  loop
    v_attempt := v_attempt + 1;
    v_entry_code := generate_entry_code();
    begin
      insert into teams (name, ai_theme, district, entry_code)
      values (p_team_name, p_ai_theme, p_district, v_entry_code)
      returning id, access_token into v_team_id, v_access_token;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'teams_entry_code_key' then
        if v_attempt >= 5 then
          raise exception 'could not generate a unique entry code, please retry' using errcode = '23505';
        end if;
        -- Loop again with a freshly generated code.
      else
        raise exception 'team name taken' using errcode = '23505';
      end if;
    end;
  end loop;

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
-- get_registration_by_token — same body as 20260915030000, plus entry_code
-- on the team object, so the participant status page can show it too.
-- ============================================================================

create or replace function get_registration_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
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
        'full_name', m.full_name,
        'is_leader', m.is_leader,
        'college', m.college,
        'branch', m.branch,
        'year', m.year,
        'role_in_team', m.role_in_team
      ) order by m.is_leader desc, m.created_at)
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
  where t.access_token = p_token;

  return v_result; -- null if no match; callers must not distinguish "not found" from other errors
end;
$$;

grant execute on function get_registration_by_token(text) to anon, authenticated;
