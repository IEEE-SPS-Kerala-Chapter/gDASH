-- "Details updated" email (2026-10-22).
--
-- After the super-admin edits a team (adds a member, or corrects member or
-- team details), the leader can be emailed the updated squad with a fresh
-- ID card for every member attached. It's a new email_outbox kind; it can be
-- sent again after every edit (the app resets the row each time).

alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check
  check (kind in ('registration_received', 'details_updated', 'correction', 'ineligible', 'result'));
