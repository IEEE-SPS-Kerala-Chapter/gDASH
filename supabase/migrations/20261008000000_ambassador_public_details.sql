-- Ambassador details on the registration form (2026-10-08).
--
-- The client wants the ambassador dropdown to show each ambassador's ID,
-- name and college, so participants can recognise who referred them. The
-- super-admin enters name and college by hand on the Ambassadors page.
--
-- Until now the names were staff-only. They stay in ambassador_names (still
-- written only by the super-admin), which gains a college column; the
-- public reads them only through ambassador_directory() below, which returns
-- just the IDs in the current range with their name and college.

alter table ambassador_names add column if not exists college text
  check (college is null or char_length(college) between 2 and 120);

-- Either detail on its own is fine (a college may be known before the
-- name); a row with neither is deleted instead.
alter table ambassador_names alter column name drop not null;
alter table ambassador_names drop constraint if exists ambassador_names_name_check;
alter table ambassador_names add constraint ambassador_names_name_check
  check (name is null or char_length(name) between 1 and 80);
alter table ambassador_names drop constraint if exists ambassador_names_has_detail;
alter table ambassador_names add constraint ambassador_names_has_detail
  check (name is not null or college is not null);

-- ============================================================================
-- Public list for the registration form: every ID in the range, with the
-- name and college when set.
-- ============================================================================

create or replace function ambassador_directory()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', an.number,
           'name', an.name,
           'college', an.college
         ) order by an.number), '[]'::jsonb)
  from ambassador_names an
  join ambassador_program ap on ap.id = true
  where ap.last_number is not null and an.number <= ap.last_number;
$$;

revoke execute on function ambassador_directory() from public;
grant execute on function ambassador_directory() to anon, authenticated;

-- ============================================================================
-- ambassador_ranking — same as 20261003000000, plus each ID's college.
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
           'college', an.college,
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
