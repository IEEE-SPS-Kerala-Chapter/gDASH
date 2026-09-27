-- Phase 8 (+9): event-day QR scanning — venue check-in and meal tokens.
--
-- event_checkpoints: what volunteers can scan for. One built-in "Venue
-- check-in", plus meal slots admins create ("Day 1 · Lunch"). Each is
-- opened/closed by admins; only open ones can be scanned.
--
-- checkpoint_scans: one row per (checkpoint, member). The primary key is
-- what stops a member claiming the same meal — or checking in — twice,
-- even with several volunteers scanning at once.
--
-- Only members of teams whose registration is 'shortlisted' can be
-- scanned. Scanners are volunteers, admins and super-admins
-- (can_verify_teams(), 20260928010000). They use the RPCs below; the
-- tables themselves are admin-only.

create table if not exists event_checkpoints (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('venue', 'meal')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  sort_order integer not null default 0,
  is_open boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create unique index if not exists event_checkpoints_single_venue on event_checkpoints (kind) where kind = 'venue';

insert into event_checkpoints (kind, label, sort_order)
select 'venue', 'Venue check-in', 0
where not exists (select 1 from event_checkpoints where kind = 'venue');

create table if not exists checkpoint_scans (
  checkpoint_id uuid not null references event_checkpoints(id) on delete restrict,
  member_id uuid not null references team_members(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  scanned_by uuid references profiles(id) on delete set null,
  primary key (checkpoint_id, member_id)
);

create index if not exists checkpoint_scans_member_idx on checkpoint_scans (member_id);

alter table event_checkpoints enable row level security;
alter table checkpoint_scans enable row level security;

drop policy if exists "event_checkpoints_admin_select" on event_checkpoints;
create policy "event_checkpoints_admin_select" on event_checkpoints for select using (is_admin());
drop policy if exists "event_checkpoints_admin_insert" on event_checkpoints;
create policy "event_checkpoints_admin_insert" on event_checkpoints for insert with check (is_admin());
drop policy if exists "event_checkpoints_admin_update" on event_checkpoints;
create policy "event_checkpoints_admin_update" on event_checkpoints for update using (is_admin()) with check (is_admin());
drop policy if exists "event_checkpoints_admin_delete" on event_checkpoints;
create policy "event_checkpoints_admin_delete" on event_checkpoints for delete using (is_admin() and kind = 'meal');

drop policy if exists "checkpoint_scans_admin_select" on checkpoint_scans;
create policy "checkpoint_scans_admin_select" on checkpoint_scans for select using (is_admin());

revoke truncate, trigger, references on event_checkpoints, checkpoint_scans from anon, authenticated;
revoke insert, update, delete on checkpoint_scans from anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function scan_list_checkpoints()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'label', c.label)
                     order by (c.kind <> 'venue'), c.sort_order, c.created_at)
    from event_checkpoints c
    where c.is_open
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- p_member_ref: a member id (from the ID-card QR) or a member code typed in.
create or replace function scan_member(p_checkpoint_id uuid, p_member_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := btrim(coalesce(p_member_ref, ''));
  v_open boolean;
  v_kind text;
  v_member team_members%rowtype;
  v_team_name text;
  v_entry_code text;
  v_reg_status text;
  v_member_json jsonb;
  v_inserted boolean;
  v_scanned_at timestamptz;
  v_scanned_by text;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select c.is_open, c.kind into v_open, v_kind from event_checkpoints c where c.id = p_checkpoint_id;
  if v_open is null or not v_open then
    return jsonb_build_object('result', 'checkpoint_closed');
  end if;

  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_member from team_members where id = v_ref::uuid;
  else
    select * into v_member from team_members where upper(member_code) = upper(v_ref);
  end if;
  if v_member.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select t.name, t.entry_code, r.status into v_team_name, v_entry_code, v_reg_status
  from teams t
  left join registrations r on r.team_id = t.id
  where t.id = v_member.team_id;

  v_member_json := jsonb_build_object(
    'id', v_member.id,
    'full_name', v_member.full_name,
    'member_code', v_member.member_code,
    'is_leader', v_member.is_leader,
    'college', v_member.college,
    'role_in_team', v_member.role_in_team,
    'team_name', v_team_name,
    'entry_code', v_entry_code,
    'has_id_card', coalesce(v_member.id_card_path, '') <> '',
    'venue_checked_in', exists (
      select 1 from checkpoint_scans s join event_checkpoints c on c.id = s.checkpoint_id
      where s.member_id = v_member.id and c.kind = 'venue'
    )
  );

  if v_reg_status is distinct from 'shortlisted' then
    return jsonb_build_object('result', 'not_eligible', 'member', v_member_json);
  end if;

  insert into checkpoint_scans (checkpoint_id, member_id, scanned_by)
  values (p_checkpoint_id, v_member.id, auth.uid())
  on conflict (checkpoint_id, member_id) do nothing
  returning true into v_inserted;

  select s.scanned_at, p.full_name into v_scanned_at, v_scanned_by
  from checkpoint_scans s
  left join profiles p on p.id = s.scanned_by
  where s.checkpoint_id = p_checkpoint_id and s.member_id = v_member.id;

  if v_kind = 'venue' then
    v_member_json := v_member_json || jsonb_build_object('venue_checked_in', true);
  end if;

  return jsonb_build_object(
    'result', case when coalesce(v_inserted, false) then 'ok' else 'already' end,
    'member', v_member_json,
    'scanned_at', v_scanned_at,
    'scanned_by_name', v_scanned_by
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo a scan: admins any time; the volunteer who made it within 2 minutes.
create or replace function undo_scan(p_checkpoint_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from checkpoint_scans s
  where s.checkpoint_id = p_checkpoint_id
    and s.member_id = p_member_id
    and (is_admin() or (s.scanned_by = auth.uid() and s.scanned_at > now() - interval '2 minutes'))
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

revoke execute on function scan_list_checkpoints() from public, anon;
revoke execute on function scan_member(uuid, text) from public, anon;
revoke execute on function undo_scan(uuid, uuid) from public, anon;
grant execute on function scan_list_checkpoints() to authenticated;
grant execute on function scan_member(uuid, text) to authenticated;
grant execute on function undo_scan(uuid, uuid) to authenticated;
