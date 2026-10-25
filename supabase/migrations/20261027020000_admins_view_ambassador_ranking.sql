-- Admins can view the ambassador ranking (2026-10-25).
--
-- The ranking was super-admin only. Admins now see it too (is_admin()
-- covers admin and super_admin, with the same 2FA rule). Changing the ID
-- range, names, the sheet import and deleting IDs stay super-admin only.
--
-- Same function as 20261020000000; only the role check is new. It keeps
-- its existing execute grant to authenticated.

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
  if not is_admin() then
    raise exception 'only admins can view the ambassador ranking' using errcode = '42501';
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
