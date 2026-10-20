-- Correction requests before ineligibility (2026-10-21).
--
-- Verification gets a fourth state between pending and the final outcomes:
--   needs_correction — a volunteer (or admin) found something wrong (an
--     unreadable ID card, a deck not on the official template, …) and the
--     team leader is emailed a correction request with the note and a
--     deadline. The team sends fixed details through a Google Form.
--   ineligible — now ADMIN ONLY: the final call, typically when a team
--     didn't respond to a correction request in time. The leader gets a
--     final-notice email with the admin's note.
--
-- Volunteers keep pending / verified and gain needs_correction; asking
-- set_verification_status for 'ineligible' without admin rights is refused.
-- The note is kept for needs_correction and ineligible (it's the email's
-- "what needs correcting" / reason) and required for both.
--
-- email_outbox gets a 'correction' kind next to 'ineligible'.

-- ============================================================================
-- Allowed values. The original checks were inline column checks, so their
-- names were generated; find them by what they check rather than by name.
-- ============================================================================

do $$
declare
  v_con record;
begin
  for v_con in
    select conname from pg_constraint
    where conrelid = 'registrations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%verification_status%'
  loop
    execute format('alter table registrations drop constraint %I', v_con.conname);
  end loop;

  for v_con in
    select conname from pg_constraint
    where conrelid = 'email_outbox'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table email_outbox drop constraint %I', v_con.conname);
  end loop;
end;
$$;

alter table registrations add constraint registrations_verification_status_check
  check (verification_status in ('pending', 'verified', 'needs_correction', 'ineligible'));

alter table email_outbox add constraint email_outbox_kind_check
  check (kind in ('registration_received', 'correction', 'ineligible', 'result'));

-- ============================================================================
-- Volunteer/admin verification change. Same as 20260928010000 except the
-- statuses: needs_correction for anyone who can verify, ineligible for
-- admins only, and a note required (and kept) for both.
-- ============================================================================

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
  if p_status not in ('pending', 'verified', 'needs_correction', 'ineligible') then
    raise exception 'invalid verification status' using errcode = '22023', hint = 'invalid_status';
  end if;
  if p_status = 'ineligible' and not is_admin() then
    raise exception 'only admins can mark a team ineligible' using errcode = '42501', hint = 'admin_only';
  end if;
  if p_status in ('needs_correction', 'ineligible') and v_note is null then
    raise exception 'a note is required' using errcode = '22023', hint = 'reason_required';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note too long' using errcode = '22023', hint = 'note_too_long';
  end if;

  update registrations
  set verification_status = p_status,
      verification_note = case when p_status in ('needs_correction', 'ineligible') then v_note else null end
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

-- ============================================================================
-- Verification list page: same as 20261007000000 plus the needs_correction
-- count.
-- ============================================================================

create or replace function verification_team_page(
  p_search text default null,
  p_verification text default null,
  p_district text default null,
  p_offset integer default 0,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_teams jsonb;
  v_counts jsonb;
begin
  if not can_verify_teams() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_q is not null then
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with matching as (
    select t.id, t.created_at
    from teams t
    join registrations r on r.team_id = t.id
    where (p_verification is null or r.verification_status = p_verification)
      and (p_district is null or t.district = p_district)
      and (
        v_pattern is null
        or t.name ilike v_pattern
        or t.entry_code ilike v_pattern
        or exists (
          select 1 from team_members m
          where m.team_id = t.id and (m.full_name ilike v_pattern or m.college ilike v_pattern)
        )
      )
  ),
  page as (
    select id, created_at from matching
    order by created_at desc, id
    offset v_offset limit v_limit
  )
  select
    (select count(*) from matching),
    coalesce((
      select jsonb_agg(
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
        )
        order by p.created_at desc, p.id
      )
      from page p
      join teams t on t.id = p.id
      join registrations r on r.team_id = t.id
    ), '[]'::jsonb)
  into v_total, v_teams;

  select jsonb_build_object(
    'pending', count(*) filter (where verification_status = 'pending'),
    'verified', count(*) filter (where verification_status = 'verified'),
    'needs_correction', count(*) filter (where verification_status = 'needs_correction'),
    'ineligible', count(*) filter (where verification_status = 'ineligible')
  ) into v_counts
  from registrations;

  return jsonb_build_object('teams', v_teams, 'total', v_total, 'counts', v_counts);
end;
$$;
