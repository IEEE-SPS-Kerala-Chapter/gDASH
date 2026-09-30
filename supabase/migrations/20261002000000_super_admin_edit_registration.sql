-- Super-admin correction of a submitted registration (2026-09-30).
--
-- Participants sometimes contact organisers after submitting ("my phone
-- number is wrong", "wrong ID card uploaded"). A super-admin can now fix
-- team details, member details, the idea answers, and replace ID cards or
-- the deck — until judging starts: once any judge is assigned to the team,
-- nothing can be changed (unassigning every judge unlocks it again).
--
-- Not editable here: adding/removing members, declarations, entry ID and
-- member codes (so check-in QR codes never change), status/verification
-- (those have their own controls).
--
-- All-or-nothing: any refusal raises, so a partly applied edit is rolled
-- back. Refusals carry a hint the server action turns into a message
-- (app/actions/admin.ts → updateRegistrationDetails):
--   stale              the registration changed since the editor loaded it
--   judging_started    a judge is assigned
--   name_taken         another team has this name
--   name_similar       another team's name is too close to it
--   bad_member         a member id that isn't on this team
--   email_taken:<id>   that member's email is on another team / member
--   phone_taken:<id>   same for phone
-- Field formats are enforced by the existing table CHECK constraints.
--
-- New file paths go through enforce_own_upload_path() as usual: the
-- super-admin uploads with their own signed link, so owns_upload() passes
-- for them. Path columns are only written when a new file is given, so the
-- `update of id_card_path/deck_path` triggers don't fire otherwise.

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

  -- Always written (updated_at at least), so the version guard bumps the
  -- version and other open admin tabs see the change.
  update registrations
  set problem_statement = p_registration ->> 'problem_statement',
      proposed_solution = p_registration ->> 'proposed_solution',
      ai_approach = p_registration ->> 'ai_approach',
      expected_impact = p_registration ->> 'expected_impact',
      supporting_link = nullif(btrim(p_registration ->> 'supporting_link'), ''),
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

revoke execute on function super_admin_update_registration(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function super_admin_update_registration(uuid, integer, jsonb, jsonb, jsonb) to authenticated;
