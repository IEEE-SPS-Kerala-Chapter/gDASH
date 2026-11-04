-- Lock the judging status of a team verified ineligible (2026-11-05).
--
-- Once a team is verified ineligible, the admin screens show a red
-- "Ineligible" label in place of the status dropdown (Submitted / Under
-- review / Shortlisted / Rejected). This makes the same rule hold in the
-- database: a status change on an ineligible registration is refused. To
-- change the status again, the team's verification is reset and the team
-- is marked verified (who may do that is unchanged).
--
-- A separate trigger, so registrations_version_and_decision_guard stays
-- as it is. The check reads new.verification_status, so a single update
-- that both lifts the ineligibility and changes the status still goes
-- through. The hint maps to a message in app/actions/admin.ts
-- (REVIEW_GUARD_MESSAGES).

create or replace function registrations_ineligible_status_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.verification_status = 'ineligible' then
    raise exception 'an ineligible team''s status cannot change'
      using errcode = 'P0001', hint = 'ineligible_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_ineligible_status_lock on registrations;
create trigger registrations_ineligible_status_lock
  before update on registrations
  for each row execute function registrations_ineligible_status_lock();
