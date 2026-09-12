-- Team names were unique case-sensitively ("Datapirates" and "DataPirates"
-- could both register), inconsistent with team_members' case-insensitive
-- email uniqueness. Drop whatever the auto-named unique constraint on
-- teams.name actually is (found dynamically rather than assumed, since we
-- didn't create it by name) and replace it with a case-insensitive index.

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'teams'
    and con.contype = 'u'
    and con.conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = rel.oid and attname = 'name'
    );

  if v_constraint_name is not null then
    execute format('alter table teams drop constraint %I', v_constraint_name);
  end if;
end $$;

create unique index if not exists teams_name_lower_idx on teams (lower(name));
