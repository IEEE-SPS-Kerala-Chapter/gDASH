-- Client requirement: super-admin needs to be able to delete a registration
-- outright (e.g. a spam/test/duplicate entry), not just change its status.
--
-- No delete policy existed on `teams` at all before this -- RLS denies an
-- operation with no matching policy by default, so even super_admin's own
-- session couldn't delete a row here previously. team_members,
-- registrations, registration_assignments, and judge_scores all reference
-- teams(id) with `on delete cascade` (see init_schema.sql,
-- registration_assignments.sql, judge_scoring_and_scope.sql), so deleting
-- the `teams` row is enough to remove the whole registration in one
-- statement -- no separate policy needed on those tables.
--
-- Deliberately super_admin only, not is_admin() -- a regular admin can
-- change status/assign judges but not permanently destroy a submission.

drop policy if exists "teams_delete_super_admin" on teams;
create policy "teams_delete_super_admin" on teams
  for delete using (is_super_admin());
