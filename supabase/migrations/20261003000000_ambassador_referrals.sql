-- Ambassador referrals (2026-10-01).
--
-- Campus ambassadors sign up outside the app (a Google Form) and get IDs
-- AMGIG-00, AMGIG-01, … AMGIG-NN. How many there will be isn't known yet,
-- so the super-admin sets the last number (the range always starts at 00)
-- and can raise it as ambassadors are confirmed. Participants pick who
-- referred them (or "no ambassador") on the registration form; the
-- super-admin sees a ranking by registrations referred.
--
-- The number is stored, not the "AMGIG-07" text — the app formats it
-- (lib/ambassador.ts), so IDs stay consistent even past 99.

-- ============================================================================
-- Range — singleton, same pattern as registration_window.
-- ============================================================================

create table if not exists ambassador_program (
  id boolean primary key default true,
  -- null = no ambassador IDs yet (the form hides the field).
  last_number integer check (last_number between 0 and 999),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  constraint ambassador_program_singleton check (id)
);

insert into ambassador_program (id) values (true) on conflict (id) do nothing;

alter table ambassador_program enable row level security;

-- The registration form needs the range; it's just a number.
drop policy if exists "ambassador_program_select_all" on ambassador_program;
create policy "ambassador_program_select_all" on ambassador_program
  for select using (true);

drop policy if exists "ambassador_program_update_super_admin" on ambassador_program;
create policy "ambassador_program_update_super_admin" on ambassador_program
  for update using (is_super_admin()) with check (is_super_admin());

revoke all on ambassador_program from anon, authenticated;
grant select on ambassador_program to anon, authenticated;
grant update (last_number) on ambassador_program to authenticated;

-- Registrations must never point outside the range: it can't shrink below
-- (or be cleared while) an ID a registration already uses.
create or replace function ambassador_program_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_highest integer;
begin
  select max(ambassador_number) into v_highest from registrations;
  if v_highest is not null and (new.last_number is null or new.last_number < v_highest) then
    raise exception 'ambassador id % is already used by a registration', v_highest
      using errcode = 'P0001', hint = 'range_in_use:' || v_highest;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists ambassador_program_guard on ambassador_program;
create trigger ambassador_program_guard
  before update on ambassador_program
  for each row execute function ambassador_program_guard();

-- ============================================================================
-- Optional names — staff-only (super-admin), never shown to participants.
-- ============================================================================

create table if not exists ambassador_names (
  number integer primary key check (number between 0 and 999),
  name text not null check (char_length(name) between 1 and 80),
  updated_at timestamptz not null default now()
);

alter table ambassador_names enable row level security;

drop policy if exists "ambassador_names_super_admin" on ambassador_names;
create policy "ambassador_names_super_admin" on ambassador_names
  for all using (is_super_admin()) with check (is_super_admin());

revoke all on ambassador_names from anon, authenticated;
grant select, insert, update, delete on ambassador_names to authenticated;

-- ============================================================================
-- The referral on each registration. null = no ambassador referred.
-- ============================================================================

alter table registrations add column if not exists ambassador_number integer
  check (ambassador_number between 0 and 999);

create index if not exists registrations_ambassador_number_idx on registrations (ambassador_number);

-- ============================================================================
-- Ranking — super-admin only.
-- ============================================================================

create or replace function ambassador_ranking()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_last integer;
  v_rows jsonb;
begin
  if not is_super_admin() then
    raise exception 'only a super-admin can view the ambassador ranking' using errcode = '42501';
  end if;

  select last_number into v_last from ambassador_program where id = true;

  with counts as (
    select n as number,
           count(r.id) as total,
           count(r.id) filter (where r.status = 'shortlisted') as shortlisted
    from generate_series(0, coalesce(v_last, -1)) as n
    left join registrations r on r.ambassador_number = n
    group by n
  ),
  -- Ties share a rank; IDs with no referrals yet have no rank.
  ranked as (
    select c.*, case when c.total > 0 then dense_rank() over (order by c.total desc) end as rank
    from counts c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', r.number,
           'name', an.name,
           'total', r.total,
           'shortlisted', r.shortlisted,
           'rank', r.rank
         ) order by r.total desc, r.number), '[]'::jsonb)
  into v_rows
  from ranked r
  left join ambassador_names an on an.number = r.number;

  return jsonb_build_object(
    'last_number', v_last,
    'rows', v_rows,
    'referred', (select count(*) from registrations where ambassador_number is not null),
    'no_ambassador', (select count(*) from registrations where ambassador_number is null)
  );
end;
$$;

revoke execute on function ambassador_ranking() from public, anon;
grant execute on function ambassador_ranking() to authenticated;

-- ============================================================================
-- submit_registration — the current definition (as live on 2026-10-01),
-- plus p_ambassador_number. The old 15-argument version is dropped so
-- PostgREST never sees two overloads.
-- ============================================================================

drop function if exists submit_registration(text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean);

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

revoke execute on function submit_registration(text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean, integer) from public;
grant execute on function submit_registration(text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean, integer) to anon, authenticated;

-- ============================================================================
-- super_admin_update_registration — same as 20261002000000, plus the
-- ambassador (p_registration.ambassador_number; left unchanged if the key
-- is missing). Hint invalid_ambassador when it's outside the range.
-- ============================================================================

create or replace function super_admin_update_registration(
  p_team_id uuid,
  p_expected_version integer,
  p_team jsonb,
  p_members jsonb,
  p_registration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg registrations%rowtype;
  v_team teams%rowtype;
  v_name text := btrim(p_team ->> 'name');
  v_college text := btrim(p_team ->> 'college');
  v_member jsonb;
  v_member_id uuid;
  v_old_path text;
  v_new_path text;
  v_constraint text;
  v_replaced jsonb := '[]'::jsonb;
  v_version integer;
  v_ambassador integer := (p_registration ->> 'ambassador_number')::integer;
  v_ambassador_last integer;
begin
  if not is_super_admin() then
    raise exception 'only a super-admin can edit a registration' using errcode = '42501';
  end if;

  -- Locks the registration for the rest of the edit. Assigning a judge
  -- takes `for share` on this same row (registration_assignments_insert_guard),
  -- so no assignment can slip in between the check below and the updates.
  select * into v_reg from registrations where team_id = p_team_id for update;
  if not found then
    raise exception 'registration not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_reg.version <> p_expected_version then
    raise exception 'registration changed since it was loaded' using errcode = 'P0001', hint = 'stale';
  end if;
  if exists (select 1 from registration_assignments where registration_id = v_reg.id) then
    raise exception 'judging has started for this team' using errcode = 'P0001', hint = 'judging_started';
  end if;

  select * into v_team from teams where id = p_team_id for update;

  -- Team name: same rules as registration, but the team doesn't clash
  -- with itself.
  if normalize_team_name(v_name) is distinct from normalize_team_name(v_team.name) then
    if exists (
      select 1 from teams
      where id <> p_team_id and normalize_team_name(name) = normalize_team_name(v_name)
    ) then
      raise exception 'team name taken' using errcode = 'P0001', hint = 'name_taken';
    end if;
    if exists (
      select 1 from teams
      where id <> p_team_id
        and similarity(normalize_team_name(name), normalize_team_name(v_name)) >= 0.55
    ) then
      raise exception 'team name too similar' using errcode = 'P0001', hint = 'name_similar';
    end if;
  end if;

  update teams
  set name = v_name,
      ai_theme = p_team ->> 'ai_theme',
      district = p_team ->> 'district'
  where id = p_team_id;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    v_member_id := (v_member ->> 'id')::uuid;
    begin
      update team_members
      set full_name = btrim(v_member ->> 'full_name'),
          email = lower(btrim(v_member ->> 'email')),
          phone = btrim(v_member ->> 'phone'),
          college = v_college,
          branch = nullif(btrim(v_member ->> 'branch'), ''),
          year = nullif(v_member ->> 'year', ''),
          role_in_team = nullif(btrim(v_member ->> 'role_in_team'), '')
      where id = v_member_id and team_id = p_team_id
      returning id_card_path into v_old_path;
      if not found then
        raise exception 'member is not on this team' using errcode = 'P0001', hint = 'bad_member';
      end if;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint like '%phone%' then
        raise exception 'phone already registered' using errcode = 'P0001', hint = 'phone_taken:' || v_member_id;
      end if;
      raise exception 'email already registered' using errcode = 'P0001', hint = 'email_taken:' || v_member_id;
    end;

    v_new_path := nullif(v_member ->> 'id_card_path', '');
    if v_new_path is not null and v_new_path is distinct from v_old_path then
      update team_members set id_card_path = v_new_path where id = v_member_id;
      if v_old_path is not null then
        v_replaced := v_replaced || jsonb_build_object('bucket', 'member-id-cards', 'path', v_old_path);
      end if;
    end if;
  end loop;

  if v_ambassador is not null then
    select last_number into v_ambassador_last from ambassador_program where id = true;
    if v_ambassador_last is null or v_ambassador not between 0 and v_ambassador_last then
      raise exception 'invalid ambassador id' using errcode = 'P0001', hint = 'invalid_ambassador';
    end if;
  end if;

  -- Always written (updated_at at least), so the version guard bumps the
  -- version and other open admin tabs see the change.
  update registrations
  set problem_statement = p_registration ->> 'problem_statement',
      proposed_solution = p_registration ->> 'proposed_solution',
      ai_approach = p_registration ->> 'ai_approach',
      expected_impact = p_registration ->> 'expected_impact',
      supporting_link = nullif(btrim(p_registration ->> 'supporting_link'), ''),
      -- Left as is when the caller doesn't send the key at all.
      ambassador_number = case when p_registration ? 'ambassador_number' then v_ambassador else ambassador_number end,
      updated_at = now()
  where id = v_reg.id;

  v_new_path := nullif(p_registration ->> 'deck_path', '');
  if v_new_path is not null and v_new_path is distinct from v_reg.deck_path then
    update registrations set deck_path = v_new_path where id = v_reg.id;
    if v_reg.deck_path is not null then
      v_replaced := v_replaced || jsonb_build_object('bucket', 'registration-decks', 'path', v_reg.deck_path);
    end if;
  end if;

  select version into v_version from registrations where id = v_reg.id;
  return jsonb_build_object('version', v_version, 'replaced_files', v_replaced);
end;
$$;

