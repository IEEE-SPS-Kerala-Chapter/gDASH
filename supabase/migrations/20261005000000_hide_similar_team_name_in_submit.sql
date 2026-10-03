-- submit_registration() no longer names the similar team (2026-10-02).
--
-- When a new team name was too close to an existing one, the error said
-- which team ("… too similar to an existing team: <name>"). The app never
-- showed it, but anyone calling the API directly could collect registered
-- team names by trying variations. check_team_name_available() was fixed
-- the same way in 20260927030000. Same body as 20261003000000 otherwise;
-- app/actions/registration.ts still matches the message prefix.

CREATE OR REPLACE FUNCTION public.submit_registration(p_team_name text, p_ai_theme text, p_district text, p_leader jsonb, p_members jsonb, p_problem_statement text, p_proposed_solution text, p_ai_approach text, p_expected_impact text, p_supporting_link text, p_deck_path text, p_declaration_eligibility boolean, p_declaration_originality boolean, p_declaration_rules boolean, p_declaration_media_consent boolean, p_ambassador_number integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  v_ambassador_last integer;
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

  -- Deliberately doesn't name the other team: the error goes back to the
  -- caller, so naming it let anyone list registered team names by trying
  -- variations against the API.
  v_similar_name := find_similar_team_name(p_team_name);
  if v_similar_name is not null then
    raise exception 'team name too similar to an existing team' using errcode = '23505';
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

  -- Ambassador referral: null = "no ambassador referred"; otherwise one of
  -- AMGIG-00 … AMGIG-<last_number> as currently set by the super-admin.
  if p_ambassador_number is not null then
    select last_number into v_ambassador_last from ambassador_program where id = true;
    if v_ambassador_last is null or p_ambassador_number not between 0 and v_ambassador_last then
      raise exception 'invalid ambassador id' using errcode = '22023', hint = 'invalid_ambassador';
    end if;
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
    declaration_eligibility, declaration_originality, declaration_rules, declaration_media_consent,
    ambassador_number
  )
  values (
    v_team_id, p_problem_statement, p_proposed_solution, p_ai_approach, p_expected_impact,
    nullif(p_supporting_link, ''), p_deck_path,
    p_declaration_eligibility, p_declaration_originality, p_declaration_rules, p_declaration_media_consent,
    p_ambassador_number
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
