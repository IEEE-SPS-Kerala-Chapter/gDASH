-- Volunteers verify teams (ID cards + member details), like admins do.
--
-- Volunteers get NO table or RLS access: a select policy on teams would
-- expose each team's private status-link token (access_token), and
-- registrations holds the idea and deck. Instead these SECURITY DEFINER
-- functions check the caller's role themselves and return only what
-- verification needs — team name/code/district, member details and ID-card
-- presence, and the verification fields. Nothing about the idea, deck, AI
-- theme, judges, scores or decisions. Admins and super-admins may use them
-- too.
--
-- set_verification_status() changes only verification_status/_note, with
-- the same optimistic version check the admin UI uses. It runs as definer,
-- but auth.uid() stays the caller, so the existing triggers still stamp
-- verification_decided_by, bump version, and refuse un-verifying a team
-- that has judges assigned (registrations_verification_guard).

create or replace function can_verify_teams()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('volunteer', 'admin', 'super_admin')
  );
$$;

revoke execute on function can_verify_teams() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function verification_list_teams()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      t.created_at,
      jsonb_build_object(
        'team_id', t.id,
        'name', t.name,
        'entry_code', t.entry_code,
        'district', t.district,
        'created_at', t.created_at,
        'college', (select m.college from team_members m where m.team_id = t.id and m.is_leader limit 1),
        'member_count', (select count(*) from team_members m where m.team_id = t.id),
        'member_names', (select string_agg(m.full_name, ', ' order by m.member_no) from team_members m where m.team_id = t.id),
        'registration_id', r.id,
        'verification_status', r.verification_status,
        'verification_decided_at', r.verification_decided_at
      ) as row_data
    from teams t
    join registrations r on r.team_id = t.id
  ) rows;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function verification_get_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'team', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'entry_code', t.entry_code,
      'district', t.district,
      'created_at', t.created_at
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'member_no', m.member_no,
        'member_code', m.member_code,
        'full_name', m.full_name,
        'email', m.email,
        'phone', m.phone,
        'college', m.college,
        'branch', m.branch,
        'year', m.year,
        'role_in_team', m.role_in_team,
        'is_leader', m.is_leader,
        'has_id_card', coalesce(m.id_card_path, '') <> ''
      ) order by m.member_no), '[]'::jsonb)
      from team_members m where m.team_id = t.id
    ),
    'registration', jsonb_build_object(
      'id', r.id,
      'version', r.version,
      'verification_status', r.verification_status,
      'verification_note', r.verification_note,
      'verification_decided_at', r.verification_decided_at,
      'verification_decided_by_name', (select p.full_name from profiles p where p.id = r.verification_decided_by),
      'assigned_judge_count', (select count(*) from registration_assignments ra where ra.registration_id = r.id)
    )
  )
  into v_result
  from teams t
  join registrations r on r.team_id = t.id
  where t.id = p_team_id;

  return v_result; -- null if not found
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function verification_state(p_registration_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'version', r.version,
    'verification_status', r.verification_status,
    'verification_note', r.verification_note,
    'verification_decided_at', r.verification_decided_at,
    'verification_decided_by_name', (select p.full_name from profiles p where p.id = r.verification_decided_by)
  )
  from registrations r
  where r.id = p_registration_id;
$$;

revoke execute on function verification_state(uuid) from public, anon, authenticated;

create or replace function set_verification_status(
  p_registration_id uuid,
  p_status text,
  p_note text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_updated uuid;
  v_state jsonb;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'verified', 'ineligible') then
    raise exception 'invalid verification status' using errcode = '22023', hint = 'invalid_status';
  end if;
  if p_status = 'ineligible' and v_note is null then
    raise exception 'a reason is required' using errcode = '22023', hint = 'reason_required';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note too long' using errcode = '22023', hint = 'note_too_long';
  end if;

  update registrations
  set verification_status = p_status,
      verification_note = case when p_status = 'ineligible' then v_note else null end
  where id = p_registration_id
    and version = p_expected_version
  returning id into v_updated;

  v_state := verification_state(p_registration_id);
  if v_state is null then
    return null; -- no such registration
  end if;
  return jsonb_build_object('conflict', v_updated is null, 'state', v_state);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function verification_id_card_path(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select nullif(m.id_card_path, '') from team_members m where m.id = p_member_id);
end;
$$;

-- Signed-in staff only; the role check inside each function does the rest.
revoke execute on function verification_list_teams() from public, anon;
revoke execute on function verification_get_team(uuid) from public, anon;
revoke execute on function set_verification_status(uuid, text, text, integer) from public, anon;
revoke execute on function verification_id_card_path(uuid) from public, anon;
grant execute on function verification_list_teams() to authenticated;
grant execute on function verification_get_team(uuid) to authenticated;
grant execute on function set_verification_status(uuid, text, text, integer) to authenticated;
grant execute on function verification_id_card_path(uuid) to authenticated;
