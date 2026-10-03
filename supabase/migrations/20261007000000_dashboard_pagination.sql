-- Dashboard team lists load page by page (2026-10-03).
--
-- The admin Registrations list and the volunteer verification list used to
-- load every team at once and re-download all of it every 30 seconds per
-- open tab. These functions do the search, filters, sorting and counting in
-- the database and return one page at a time, plus small summaries for the
-- charts and counters. Apply after 20261006000000_staff_mfa.sql: they use
-- is_admin() / can_verify_teams(), which require a 2FA (aal2) session.

-- ============================================================================
-- Admin: one page of team ids matching the search and filters, plus the
-- total that match. The app then loads those teams' rows (RLS applies).
-- ============================================================================

create or replace function admin_team_page(
  p_search text default null,
  p_status text default null,
  p_verification text default null,
  p_theme text default null,
  p_district text default null,
  p_newest_first boolean default true,
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
  v_ids jsonb;
begin
  if not is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Escape LIKE wildcards so a search for "50%" means the text itself.
  if v_q is not null then
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with matching as (
    select t.id, coalesce(r.created_at, t.created_at) as submitted_at
    from teams t
    left join registrations r on r.team_id = t.id
    where (p_status is null or coalesce(r.status, 'submitted') = p_status)
      and (p_verification is null or r.verification_status = p_verification)
      and (p_theme is null or t.ai_theme = p_theme)
      and (p_district is null or t.district = p_district)
      and (
        v_pattern is null
        or t.name ilike v_pattern
        or t.entry_code ilike v_pattern
        or t.ai_theme ilike v_pattern
        or exists (select 1 from team_members m where m.team_id = t.id and m.member_code ilike v_pattern)
      )
  )
  select
    (select count(*) from matching),
    coalesce((
      select jsonb_agg(id order by rn)
      from (
        select id, row_number() over (
          order by
            case when p_newest_first then submitted_at end desc,
            case when not p_newest_first then submitted_at end asc,
            id
        ) as rn
        from matching
      ) ordered
      where rn > v_offset and rn <= v_offset + v_limit
    ), '[]'::jsonb)
  into v_total, v_ids;

  return jsonb_build_object('ids', v_ids, 'total', v_total);
end;
$$;

revoke execute on function admin_team_page(text, text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function admin_team_page(text, text, text, text, text, boolean, integer, integer) to authenticated;

-- ============================================================================
-- Admin: totals for the charts — by status, theme, verification, and
-- registrations per day for the last 7 days (India time). About 1 KB.
-- ============================================================================

create or replace function admin_registration_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', (select count(*) from teams),
    'by_status', coalesce((
      select jsonb_object_agg(s, n) from (
        select coalesce(r.status, 'submitted') as s, count(*) as n
        from teams t left join registrations r on r.team_id = t.id
        group by 1
      ) x
    ), '{}'::jsonb),
    'by_theme', coalesce((
      select jsonb_object_agg(ai_theme, n) from (
        select ai_theme, count(*) as n from teams group by ai_theme
      ) x
    ), '{}'::jsonb),
    'by_verification', coalesce((
      select jsonb_object_agg(verification_status, n) from (
        select verification_status, count(*) as n from registrations group by verification_status
      ) x
    ), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_object_agg(day, n) from (
        select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, count(*) as n
        from registrations
        where created_at >= now() - interval '8 days'
        group by 1
      ) x
    ), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_registration_stats() from public, anon;
grant execute on function admin_registration_stats() to authenticated;

-- ============================================================================
-- Volunteers (and admins): one page of the verification list — same row
-- shape as verification_list_teams() — plus the total matching and the
-- verified / pending / ineligible counts across all teams.
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
    'ineligible', count(*) filter (where verification_status = 'ineligible')
  ) into v_counts
  from registrations;

  return jsonb_build_object('teams', v_teams, 'total', v_total, 'counts', v_counts);
end;
$$;

revoke execute on function verification_team_page(text, text, text, integer, integer) from public, anon;
grant execute on function verification_team_page(text, text, text, integer, integer) to authenticated;
