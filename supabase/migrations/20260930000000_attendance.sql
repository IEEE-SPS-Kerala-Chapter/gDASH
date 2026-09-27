-- Phase 10: attendance dashboard.
--
-- attendance_summary(): per check-in point, how many of the eligible
-- people (members of shortlisted teams) have been scanned. For everyone
-- who can scan (volunteers, admins, super-admins) — counts only, no names.
--
-- admin_set_scan(): admins correct records — mark someone manually (e.g. a
-- scan that failed for lack of signal, even after a meal has closed) or
-- remove a wrong scan. Still only for members of shortlisted teams.
--
-- Admins read the detailed per-person data through their existing
-- is_admin() policies on teams, team_members, registrations,
-- event_checkpoints and checkpoint_scans.

create or replace function attendance_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_eligible integer;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(*) into v_eligible
  from team_members m
  join registrations r on r.team_id = m.team_id
  where r.status = 'shortlisted';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'kind', c.kind,
      'label', c.label,
      'is_open', c.is_open,
      'eligible', v_eligible,
      'scanned', (
        select count(*)
        from checkpoint_scans s
        join team_members m on m.id = s.member_id
        join registrations r on r.team_id = m.team_id
        where s.checkpoint_id = c.id and r.status = 'shortlisted'
      )
    ) order by (c.kind <> 'venue'), c.sort_order, c.created_at)
    from event_checkpoints c
  ), '[]'::jsonb);
end;
$$;

create or replace function admin_set_scan(p_checkpoint_id uuid, p_member_id uuid, p_present boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_scanned_at timestamptz;
  v_scanned_by text;
begin
  if not is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from event_checkpoints where id = p_checkpoint_id) then
    raise exception 'check-in point not found' using errcode = 'P0001', hint = 'no_checkpoint';
  end if;

  if p_present then
    select r.status into v_status
    from team_members m
    join registrations r on r.team_id = m.team_id
    where m.id = p_member_id;
    if v_status is distinct from 'shortlisted' then
      raise exception 'member is not in a shortlisted team' using errcode = 'P0001', hint = 'not_eligible';
    end if;

    insert into checkpoint_scans (checkpoint_id, member_id, scanned_by)
    values (p_checkpoint_id, p_member_id, auth.uid())
    on conflict (checkpoint_id, member_id) do nothing;

    select s.scanned_at, p.full_name into v_scanned_at, v_scanned_by
    from checkpoint_scans s
    left join profiles p on p.id = s.scanned_by
    where s.checkpoint_id = p_checkpoint_id and s.member_id = p_member_id;

    return jsonb_build_object('present', true, 'scanned_at', v_scanned_at, 'scanned_by_name', v_scanned_by);
  end if;

  delete from checkpoint_scans where checkpoint_id = p_checkpoint_id and member_id = p_member_id;
  return jsonb_build_object('present', false);
end;
$$;

revoke execute on function attendance_summary() from public, anon;
revoke execute on function admin_set_scan(uuid, uuid, boolean) from public, anon;
grant execute on function attendance_summary() to authenticated;
grant execute on function admin_set_scan(uuid, uuid, boolean) to authenticated;
