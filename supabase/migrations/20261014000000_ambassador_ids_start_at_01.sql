-- Ambassador IDs start at AMGIG-01 (2026-10-14).
--
-- The range used to run AMGIG-00 … AMGIG-<last_number>; the client wants it
-- to start at 01. The stored number is still exactly the ID (1 = AMGIG-01),
-- so 0 is no longer a valid ID anywhere: the range is 1 … last_number and a
-- sheet import numbers its first row 1.
--
-- No IDs had been handed out yet, but any rows that already exist are moved
-- up by one so every referral keeps pointing at the same ambassador.

-- ============================================================================
-- Renumber existing data (0 → 1, 1 → 2, …).
-- ============================================================================

alter table ambassador_program drop constraint if exists ambassador_program_last_number_check;
alter table ambassador_names drop constraint if exists ambassador_names_number_check;
alter table registrations drop constraint if exists registrations_ambassador_number_check;

-- Two steps through negatives so the primary key never collides mid-update.
update ambassador_names set number = -(number + 1);
update ambassador_names set number = -number;

update registrations set ambassador_number = ambassador_number + 1 where ambassador_number is not null;

update ambassador_program set last_number = last_number + 1 where id = true and last_number is not null;

alter table ambassador_program add constraint ambassador_program_last_number_check
  check (last_number between 1 and 999);
alter table ambassador_names add constraint ambassador_names_number_check
  check (number between 1 and 999);
alter table registrations add constraint registrations_ambassador_number_check
  check (ambassador_number between 1 and 999);

-- ============================================================================
-- Functions: the range checks, the ranking and the import start at 1.
--
-- Patched from their deployed definitions (each last written in
-- 20261003000000 / 20261005000000 / 20261011000000) rather than copied out in
-- full; every replacement must match, or the migration fails.
-- ============================================================================

do $$
declare
  v_patch record;
  v_def text;
  v_new text;
begin
  for v_patch in
    select * from (values
      ('submit_registration(text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean, integer)'::regprocedure::oid,
       'p_ambassador_number not between 0 and v_ambassador_last',
       'p_ambassador_number not between 1 and v_ambassador_last'),
      ('super_admin_update_registration(uuid, integer, jsonb, jsonb, jsonb)'::regprocedure::oid,
       'v_ambassador not between 0 and v_ambassador_last',
       'v_ambassador not between 1 and v_ambassador_last'),
      ('ambassador_ranking()'::regprocedure::oid,
       'generate_series(0, coalesce(v_last, -1))',
       'generate_series(1, coalesce(v_last, 0))'),
      ('super_admin_import_ambassadors(jsonb)'::regprocedure::oid,
       '(r.ord - 1)::integer',
       'r.ord::integer'),
      ('super_admin_import_ambassadors(jsonb)'::regprocedure::oid,
       'v_count - 1',
       'v_count')
    ) as p(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn);
    if position(v_patch.old_text in v_def) = 0 then
      raise exception 'expected % in %', v_patch.old_text, v_patch.fn::regprocedure;
    end if;
    v_new := replace(v_def, v_patch.old_text, v_patch.new_text);
    execute v_new;
  end loop;
end;
$$;
