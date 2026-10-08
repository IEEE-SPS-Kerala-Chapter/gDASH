-- Ambassador sheet import (2026-10-09).
--
-- The super-admin uploads a CSV of ambassadors (name, college) on the
-- Ambassadors page. Rows are numbered in sheet order: the first row becomes
-- AMGIG-00, the second AMGIG-01, and so on. Those IDs get the sheet's name
-- and college; IDs after the last row are left as they are. The range is
-- raised to cover every row (never lowered).
--
-- One function, so the whole sheet is saved or none of it is.

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

  insert into ambassador_names (number, name, college, updated_at)
  select (r.ord - 1)::integer,
         btrim(r.value ->> 'name'),
         nullif(btrim(coalesce(r.value ->> 'college', '')), ''),
         now()
  from jsonb_array_elements(p_rows) with ordinality as r(value, ord)
  on conflict (number) do update
    set name = excluded.name,
        college = excluded.college,
        updated_at = excluded.updated_at;

  -- Raise the range to cover the sheet (the guard trigger records who).
  update ambassador_program
  set last_number = v_count - 1
  where id = true and (last_number is null or last_number < v_count - 1);

  select last_number into v_last from ambassador_program where id = true;
  return jsonb_build_object('imported', v_count, 'last_number', v_last);
end;
$$;

revoke execute on function super_admin_import_ambassadors(jsonb) from public, anon;
grant execute on function super_admin_import_ambassadors(jsonb) to authenticated;
