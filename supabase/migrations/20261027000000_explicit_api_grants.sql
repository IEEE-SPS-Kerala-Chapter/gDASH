-- Explicit Data API grants for every public table.
--
-- From 2026-10-30 Supabase no longer grants anon / authenticated /
-- service_role access to new tables in public automatically. Existing
-- prod tables keep their grants, but rebuilding from these migrations
-- (new project, branch, db reset) would leave most tables unreachable.
-- This restates the grants prod has today (read from prod on
-- 2026-10-23), so on prod it changes nothing.
--
-- Row-level security still decides which rows each role can touch.
-- A table missing for a role below is intentionally closed to it.
--
-- Every migration that creates a table from now on must grant its own
-- access in the same file.

-- Full read/write for both API roles; RLS limits it.
grant select, insert, update, delete on
  audit_logs, event_checkpoints, judge_scores, registration_assignments,
  registration_drafts, registration_window, registrations, team_members, teams
to anon, authenticated;

-- Read-only for both API roles.
grant select on checkpoint_scans, profiles to anon, authenticated;

grant select, update on results_publication to anon, authenticated;

grant select on ambassador_program to anon, authenticated;
grant update (last_number) on ambassador_program to authenticated;

grant select, insert, update, delete on ambassador_names to authenticated;

grant select on email_outbox to authenticated;

-- staff_login_attempts and staff_mfa_backup_codes: service role only.

-- Server-side admin client.
grant all on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
