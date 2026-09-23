-- Client requirement: "System should clearly manage assignments when
-- multiple admins access the dashboard and prevent unintended duplicate
-- actions. After reviewer submits score/decision, admin updates participant
-- status. System should prevent multiple admins from simultaneously
-- changing the same idea's status."
--
-- 1. Optimistic concurrency on registrations. `version` goes up by one on
--    every update. The app sends the version it last saw, and the update
--    only applies if that's still current -- so if two admins act on the
--    same idea from stale screens, the second one is refused and shown
--    what the first one did, instead of silently overwriting it.
--
-- 2. Who/when on status changes (status_changed_by/at), stamped from the
--    session like verification_decided_by/at, so the conflict message and
--    the detail page can say which admin last changed it.
--
-- 3. A final decision (shortlisted / rejected) needs every assigned judge
--    to have submitted their score first, and at least one judge assigned.
--    Once decided, no new judges can be assigned.
--
-- 4. Assigning a judge takes a share lock on the registration row, so it
--    can't interleave with a concurrent verification change or decision
--    (each of which holds the row's update lock): whichever commits first
--    wins and the other re-checks against it.

alter table registrations
  add column if not exists version integer not null default 1,
  add column if not exists status_changed_by uuid references profiles(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

create or replace function registrations_version_and_decision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;

  if new.status is distinct from old.status then
    if new.status in ('shortlisted', 'rejected') then
      if not exists (select 1 from registration_assignments where registration_id = new.id) then
        raise exception 'assign judges and collect scores before a decision'
          using errcode = 'P0001', hint = 'no_judges';
      end if;
      if exists (
        select 1 from registration_assignments ra
        where ra.registration_id = new.id
          and not exists (
            select 1 from judge_scores js
            where js.registration_id = ra.registration_id
              and js.judge_id = ra.judge_id
              and js.status = 'submitted'
          )
      ) then
        raise exception 'every assigned judge must submit a score before a decision'
          using errcode = 'P0001', hint = 'scores_incomplete';
      end if;
    end if;

    new.status_changed_by := auth.uid();
    new.status_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_version_and_decision_guard on registrations;
create trigger registrations_version_and_decision_guard
  before update on registrations
  for each row execute function registrations_version_and_decision_guard();

create or replace function registration_assignments_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_verification text;
  v_status text;
begin
  select verification_status, status into v_verification, v_status
  from registrations
  where id = new.registration_id
  for share;

  if v_verification is distinct from 'verified' then
    raise exception 'registration is not verified'
      using errcode = 'P0001', hint = 'not_verified';
  end if;
  if v_status in ('shortlisted', 'rejected') then
    raise exception 'registration already has a final decision'
      using errcode = 'P0001', hint = 'already_decided';
  end if;

  return new;
end;
$$;

drop trigger if exists registration_assignments_insert_guard on registration_assignments;
create trigger registration_assignments_insert_guard
  before insert on registration_assignments
  for each row execute function registration_assignments_insert_guard();
