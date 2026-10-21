-- Super-admin can add members when editing a registration (2026-10-21).
--
-- super_admin_update_registration() is the same as before (last written in
-- 20261003000000, with the ambassador range starting at 1 from
-- 20261014000000) plus one thing: an entry in p_members WITHOUT an "id" is
-- a new member, inserted into the team. A new member must come with an ID
-- card; the client's "key" for it is echoed in error hints so the app can
-- say which new member clashed. Member number and code (and so the
-- check-in QR) are assigned by assign_member_code(), and the existing
-- 1..5 member_no check caps the team at 5.
--
-- Adding a member puts the team's verification back to pending: the new
-- person's ID card hasn't been checked.

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
  v_member_ref text;
  v_old_path text;
  v_new_path text;
  v_constraint text;
  v_replaced jsonb := '[]'::jsonb;
  v_added integer := 0;
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
    v_member_id := nullif(v_member ->> 'id', '')::uuid;
    -- What error hints name: the member id, or the new member's client key.
    v_member_ref := coalesce(v_member ->> 'id', v_member ->> 'key', '');

    if v_member_id is null then
      -- New member.
      v_new_path := nullif(v_member ->> 'id_card_path', '');
      if v_new_path is null then
        raise exception 'a new member needs an ID card' using errcode = 'P0001', hint = 'id_card_required:' || v_member_ref;
      end if;
      begin
        insert into team_members (team_id, full_name, email, phone, college, branch, year, role_in_team, is_leader, id_card_path)
        values (
          p_team_id,
          btrim(v_member ->> 'full_name'),
          lower(btrim(v_member ->> 'email')),
          btrim(v_member ->> 'phone'),
          v_college,
          nullif(btrim(v_member ->> 'branch'), ''),
          nullif(v_member ->> 'year', ''),
          nullif(btrim(v_member ->> 'role_in_team'), ''),
          false,
          v_new_path
        );
      exception
        when unique_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint like '%phone%' then
            raise exception 'phone already registered' using errcode = 'P0001', hint = 'phone_taken:' || v_member_ref;
          end if;
          raise exception 'email already registered' using errcode = 'P0001', hint = 'email_taken:' || v_member_ref;
        when check_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint = 'team_members_member_no_check' then
            raise exception 'team already has 5 members' using errcode = 'P0001', hint = 'team_full';
          end if;
          raise;
      end;
      v_added := v_added + 1;
      continue;
    end if;

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
        raise exception 'phone already registered' using errcode = 'P0001', hint = 'phone_taken:' || v_member_ref;
      end if;
      raise exception 'email already registered' using errcode = 'P0001', hint = 'email_taken:' || v_member_ref;
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
    if v_ambassador_last is null or v_ambassador not between 1 and v_ambassador_last then
      raise exception 'invalid ambassador id' using errcode = 'P0001', hint = 'invalid_ambassador';
    end if;
  end if;

  -- Always written (updated_at at least), so the version guard bumps the
  -- version and other open admin tabs see the change. A new member's ID
  -- card hasn't been checked, so verification goes back to pending.
  update registrations
  set problem_statement = p_registration ->> 'problem_statement',
      proposed_solution = p_registration ->> 'proposed_solution',
      ai_approach = p_registration ->> 'ai_approach',
      expected_impact = p_registration ->> 'expected_impact',
      supporting_link = nullif(btrim(p_registration ->> 'supporting_link'), ''),
      -- Left as is when the caller doesn't send the key at all.
      ambassador_number = case when p_registration ? 'ambassador_number' then v_ambassador else ambassador_number end,
      verification_status = case when v_added > 0 then 'pending' else verification_status end,
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
  return jsonb_build_object(
    'version', v_version,
    'replaced_files', v_replaced,
    'added_members', v_added,
    'verification_reset', v_added > 0 and v_reg.verification_status <> 'pending'
  );
end;
$$;
