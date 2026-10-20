-- Ambassador funnel counts (2026-10-20).
--
-- The ranking now shows, per ambassador ID, how many of the teams it
-- referred passed ID verification, next to the existing registration and
-- shortlisted (= selected for the Grand Finale) counts. The summary line
-- gets the same three totals across every referred team.
--
-- Same function as 20261011000000 with the 20261014000000 range patch
-- (IDs start at 1) folded in; only the verified counts are new.

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
           count(r.id) filter (where r.verification_status = 'verified') as verified,
           count(r.id) filter (where r.status = 'shortlisted') as shortlisted
    from generate_series(1, coalesce(v_last, 0)) as n
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
           'verified', r.verified,
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
    'referred_verified', (select count(*) from registrations
                          where ambassador_number is not null and verification_status = 'verified'),
    'referred_shortlisted', (select count(*) from registrations
                             where ambassador_number is not null and status = 'shortlisted'),
    'no_ambassador', (select count(*) from registrations where ambassador_number is null)
  );
end;
$$;
