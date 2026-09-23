-- Client requirement: "Before assigning a submission to a reviewer, the
-- admin/organizer must verify that the participant is genuine and eligible
-- to participate ... Only Verified submissions can be assigned to a
-- reviewer."
--
-- Adds an eligibility verification step that is deliberately separate from
-- registrations.status (submitted / under_review / shortlisted / rejected):
-- that column is the judging outcome, this one is "is this team real and
-- allowed to take part at all" -- checked by an admin against the members'
-- college ID cards before any judge's time is spent on the entry.
--
--   pending    -- default; not yet checked
--   verified   -- ID cards/details checked, eligible; can be assigned judges
--   ineligible -- fake, invalid, or not eligible; can never be assigned
--
-- Enforced at the DB level, not just in the UI:
--   * registration_assignments_insert_admin now also requires the
--     registration to be 'verified'.
--   * A registration can't be moved off 'verified' while it still has
--     judge assignments -- otherwise a judge would keep scoring an entry
--     that's since been found ineligible. The admin unassigns first.
--
-- Existing registrations backfill to 'pending'. Any judge assignments made
-- before this migration are left in place (the insert check only applies to
-- new assignments) -- those entries still show as "Pending" until an admin
-- verifies them.

alter table registrations
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'ineligible')),
  add column if not exists verification_note text
    check (verification_note is null or char_length(verification_note) <= 1000),
  add column if not exists verification_decided_by uuid references profiles(id) on delete set null,
  add column if not exists verification_decided_at timestamptz;

create index if not exists registrations_verification_status_idx on registrations (verification_status);

-- Stamps who/when on every verification change (from the session's
-- auth.uid(), not a client-supplied value), and blocks un-verifying an
-- entry that still has judges assigned.
create or replace function registrations_verification_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verification_status is distinct from old.verification_status then
    if old.verification_status = 'verified'
       and exists (select 1 from registration_assignments where registration_id = new.id) then
      raise exception 'unassign judges before changing verification'
        using errcode = 'P0001', hint = 'has_assignments';
    end if;

    if new.verification_status = 'pending' then
      new.verification_decided_by := null;
      new.verification_decided_at := null;
      new.verification_note := null;
    else
      new.verification_decided_by := auth.uid();
      new.verification_decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_verification_guard on registrations;
create trigger registrations_verification_guard
  before update on registrations
  for each row execute function registrations_verification_guard();

drop policy if exists "registration_assignments_insert_admin" on registration_assignments;
create policy "registration_assignments_insert_admin" on registration_assignments
  for insert with check (
    is_admin()
    and exists (select 1 from profiles where id = judge_id and role = 'judge')
    and exists (
      select 1 from registrations r
      where r.id = registration_id and r.verification_status = 'verified'
    )
  );
