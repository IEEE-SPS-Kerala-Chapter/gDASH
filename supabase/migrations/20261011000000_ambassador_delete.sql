-- Deleting ambassadors (2026-10-11).
--
-- The super-admin can delete one ambassador, or all of them, from the
-- Ambassadors page. A deleted ID disappears from the registration
-- dropdown and can't be picked any more (enforced below, not just hidden).
-- IDs are never renumbered: teams that already picked a deleted ambassador
-- keep that referral, and the ranking still counts it (marked deleted).
-- The name and college are kept for that record. Importing a sheet that
-- covers a deleted ID brings it back with the sheet's details.

alter table ambassador_names add column if not exists deleted_at timestamptz;

-- A deleted ID may have no details at all (it was never named).
alter table ambassador_names drop constraint if exists ambassador_names_has_detail;
alter table ambassador_names add constraint ambassador_names_has_detail
  check (name is not null or college is not null or deleted_at is not null);

-- ============================================================================
-- Directory for the registration form — now says which IDs are deleted.
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
           'name', case when an.deleted_at is null then an.name end,
           'college', case when an.deleted_at is null then an.college end,
           'deleted', an.deleted_at is not null
         ) order by an.number), '[]'::jsonb)
  from ambassador_names an
  join ambassador_program ap on ap.id = true
  where ap.last_number is not null and an.number <= ap.last_number;
$$;

-- ============================================================================
-- A deleted ID can't be newly picked — by the form or anyone calling the
-- API directly. Existing referrals are left alone.
-- ============================================================================

create or replace function registrations_ambassador_not_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ambassador_number is not null
    and (tg_op = 'INSERT' or new.ambassador_number is distinct from old.ambassador_number)
    and exists (select 1 from ambassador_names where number = new.ambassador_number and deleted_at is not null)
  then
    raise exception 'ambassador id % was deleted', new.ambassador_number
      using errcode = '22023', hint = 'invalid_ambassador';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_ambassador_not_deleted on registrations;
create trigger registrations_ambassador_not_deleted
  before insert or update of ambassador_number on registrations
  for each row execute function registrations_ambassador_not_deleted();

-- ============================================================================
-- Import — same as 20261009000000, and brings deleted IDs it covers back.
-- ============================================================================

create or replace function super_admin_import_ambassadors(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := coalesce(jsonb_array_length(p_rows), 0);
  v_last integer;
begin
  if not is_super_admin() then
    raise exception 'only a super-admin can import ambassadors' using errcode = '42501';
  end if;

  if v_count = 0 or v_count > 1000 then
    raise exception 'the sheet must have 1 to 1000 ambassadors' using errcode = '22023', hint = 'bad_count';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where char_length(btrim(coalesce(r ->> 'name', ''))) not between 1 and 80
      or (nullif(btrim(coalesce(r ->> 'college', '')), '') is not null
          and char_length(btrim(r ->> 'college')) not between 2 and 120)
  ) then
    raise exception 'invalid ambassador row' using errcode = '22023', hint = 'bad_row';
  end if;

  insert into ambassador_names (number, name, college, deleted_at, updated_at)
  select (r.ord - 1)::integer,
         btrim(r.value ->> 'name'),
         nullif(btrim(coalesce(r.value ->> 'college', '')), ''),
         null,
         now()
  from jsonb_array_elements(p_rows) with ordinality as r(value, ord)
  on conflict (number) do update
    set name = excluded.name,
        college = excluded.college,
        deleted_at = null,
        updated_at = excluded.updated_at;

  update ambassador_program
  set last_number = v_count - 1
  where id = true and (last_number is null or last_number < v_count - 1);

  select last_number into v_last from ambassador_program where id = true;
  return jsonb_build_object('imported', v_count, 'last_number', v_last);
end;
$$;

-- ============================================================================
-- Ranking — same as 20261008000000, plus whether each ID is deleted.
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
  ranked as (
    select c.*, case when c.total > 0 then dense_rank() over (order by c.total desc) end as rank
    from counts c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', r.number,
           'name', an.name,
           'college', an.college,
           'deleted', an.deleted_at is not null,
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
