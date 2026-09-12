-- Judge-facing scoring + scoping judge/volunteer access down from "all staff
-- see everything" to what each role actually needs.
--
-- Until now, teams/team_members/registrations were readable by any staff
-- account (admin, judge, OR volunteer) via is_staff(). That was fine while
-- only the admin dashboard existed. Now that judges get their own view:
--   - a judge should only see the registrations assigned to them
--   - a volunteer should see none of this yet (no check-in feature exists
--     that would need it) — locked out per explicit decision, easy to
--     reopen later when that phase is built
--   - admin keeps seeing everything, unchanged
--
-- Written idempotently so it can be safely re-run while iterating.

-- ============================================================================
-- Scoping functions
-- ============================================================================

create or replace function can_view_registration(p_registration_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_admin()
    or exists (
      select 1 from registration_assignments ra
      where ra.registration_id = p_registration_id and ra.judge_id = auth.uid()
    );
$$;

create or replace function can_view_team(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_admin()
    or exists (
      select 1
      from registrations r
      join registration_assignments ra on ra.registration_id = r.id
      where r.team_id = p_team_id and ra.judge_id = auth.uid()
    );
$$;

-- ============================================================================
-- Re-scope existing staff-read policies
-- ============================================================================

drop policy if exists "teams_select_staff" on teams;
create policy "teams_select_staff" on teams for select using (can_view_team(id));

drop policy if exists "team_members_select_staff" on team_members;
create policy "team_members_select_staff" on team_members for select using (can_view_team(team_id));

drop policy if exists "registrations_select_staff" on registrations;
create policy "registrations_select_staff" on registrations for select using (can_view_registration(id));

-- A judge only needs to see their own assignment rows (to know what's
-- assigned to them); admin still sees all, for the assign/unassign UI.
drop policy if exists "registration_assignments_select_staff" on registration_assignments;
create policy "registration_assignments_select_staff" on registration_assignments
  for select using (is_admin() or judge_id = auth.uid());

-- ============================================================================
-- JUDGE_SCORES — Stage 1 (virtual shortlisting) evaluation, per the
-- weighted parameters in gIGNITE_Hackathon_Rules.docx §Evaluation
-- Framework. Only the five Stage-1-weighted parameters are scored here
-- (User Experience & Design, Team Learning & Growth, and Presentation &
-- Communication are 0%-weighted at Stage 1 — they only apply to the
-- in-person Grand Finale, which isn't part of this platform yet).
-- Actual weights live in lib/scoring.ts, not here, since the rules doc
-- notes they're "proposed defaults... subject to joint sign-off" and may
-- change without needing a migration.
-- ============================================================================

create table if not exists judge_scores (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  judge_id uuid not null references profiles(id) on delete cascade,
  problem_relevance smallint not null check (problem_relevance between 1 and 10),
  technical_implementation smallint not null check (technical_implementation between 1 and 10),
  innovation_creativity smallint not null check (innovation_creativity between 1 and 10),
  feasibility_scalability smallint not null check (feasibility_scalability between 1 and 10),
  completion_functionality smallint not null check (completion_functionality between 1 and 10),
  comments text check (comments is null or char_length(comments) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, judge_id)
);

drop trigger if exists set_judge_scores_updated_at on judge_scores;
create trigger set_judge_scores_updated_at
  before update on judge_scores
  for each row execute function set_updated_at();

alter table judge_scores enable row level security;

-- Admin sees every score (to review the panel's ranking); a judge sees
-- only their own.
drop policy if exists "judge_scores_select" on judge_scores;
create policy "judge_scores_select" on judge_scores
  for select using (is_admin() or judge_id = auth.uid());

-- A judge may only score a registration they were actually assigned —
-- enforced at the DB level, not just trusted from the app.
drop policy if exists "judge_scores_insert" on judge_scores;
create policy "judge_scores_insert" on judge_scores
  for insert with check (
    judge_id = auth.uid()
    and exists (
      select 1 from registration_assignments ra
      where ra.registration_id = judge_scores.registration_id and ra.judge_id = auth.uid()
    )
  );

drop policy if exists "judge_scores_update" on judge_scores;
create policy "judge_scores_update" on judge_scores
  for update using (judge_id = auth.uid())
  with check (
    judge_id = auth.uid()
    and exists (
      select 1 from registration_assignments ra
      where ra.registration_id = judge_scores.registration_id and ra.judge_id = auth.uid()
    )
  );
