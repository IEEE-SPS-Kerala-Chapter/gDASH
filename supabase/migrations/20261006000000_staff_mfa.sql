-- Staff 2FA (2026-10-03): every staff power now needs a session that has
-- passed the authenticator-app code (Supabase MFA, JWT claim aal = 'aal2').
-- A password-only (aal1) staff session can read its own profile and set up
-- or enter its code — nothing else, even calling the API directly.
--
-- !! Apply only AFTER the app code with the 2FA screens is live on every
-- !! staff site (pre-prod staff, and the web team's g-dash in production).
-- !! Otherwise staff sessions can't reach aal2 and are locked out.
--
-- Participants are unaffected: none of their paths use these helpers
-- (their pages tell staff sessions apart with is_staff_account() below).
--
-- Super-admin locked out (lost phone and backup codes)? In the SQL Editor:
--   delete from auth.mfa_factors
--     where user_id = (select id from auth.users where email = 'SUPER_ADMIN_EMAIL');
--   delete from staff_mfa_backup_codes
--     where user_id = (select id from auth.users where email = 'SUPER_ADMIN_EMAIL');
-- They set up a new authenticator at their next sign-in. (Anyone else: the
-- super-admin uses "Reset 2FA" on the Staff page.)

create or replace function staff_mfa_ok()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ============================================================================
-- Role helpers — same checks as before, plus staff_mfa_ok(). Every admin,
-- super-admin and volunteer policy and RPC goes through these.
-- ============================================================================

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select staff_mfa_ok() and exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select staff_mfa_ok() and exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select staff_mfa_ok() and exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'judge', 'volunteer', 'super_admin')
  );
$$;

create or replace function can_verify_teams()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select staff_mfa_ok() and exists (
    select 1 from profiles
    where id = auth.uid() and role in ('volunteer', 'admin', 'super_admin')
  );
$$;

-- Whether this is a staff account at all, 2FA or not — for the participant
-- pages, which show staff a "you're signed in as staff" screen instead of
-- the registration form.
create or replace function is_staff_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'judge', 'volunteer', 'super_admin')
  );
$$;

grant execute on function is_staff_account() to anon, authenticated;

-- ============================================================================
-- Judge paths match on auth.uid() directly — add the same requirement.
-- ============================================================================

create or replace function can_view_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or (
      staff_mfa_ok()
      and exists (
        select 1
        from registrations r
        join registration_assignments ra on ra.registration_id = r.id
        where r.team_id = p_team_id and ra.judge_id = auth.uid()
      )
    );
$$;

create or replace function can_view_registration(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or (
      staff_mfa_ok()
      and exists (
        select 1 from registration_assignments ra
        where ra.registration_id = p_registration_id and ra.judge_id = auth.uid()
      )
    );
$$;

drop policy if exists "registration_assignments_select_staff" on registration_assignments;
create policy "registration_assignments_select_staff" on registration_assignments
  for select using (is_admin() or (staff_mfa_ok() and judge_id = auth.uid()));

drop policy if exists "judge_scores_select" on judge_scores;
create policy "judge_scores_select" on judge_scores
  for select using (is_admin() or (staff_mfa_ok() and judge_id = auth.uid()));

drop policy if exists "judge_scores_insert" on judge_scores;
create policy "judge_scores_insert" on judge_scores
  for insert with check (
    staff_mfa_ok()
    and judge_id = auth.uid()
    and exists (
      select 1 from registration_assignments ra
      where ra.registration_id = judge_scores.registration_id and ra.judge_id = auth.uid()
    )
  );

drop policy if exists "judge_scores_update" on judge_scores;
create policy "judge_scores_update" on judge_scores
  for update
  using (staff_mfa_ok() and judge_id = auth.uid())
  with check (
    staff_mfa_ok()
    and judge_id = auth.uid()
    and exists (
      select 1 from registration_assignments ra
      where ra.registration_id = judge_scores.registration_id and ra.judge_id = auth.uid()
    )
  );

-- ============================================================================
-- Backup codes — 10 one-time codes per staff member, stored hashed
-- (SHA-256). Only the server (service role) reads or writes them: a code
-- proves who you are, removes your lost authenticator, and sends you to set
-- up a new one (app/actions/mfa.ts).
-- ============================================================================

create table if not exists staff_mfa_backup_codes (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_mfa_backup_codes_user_idx on staff_mfa_backup_codes (user_id);

alter table staff_mfa_backup_codes enable row level security;
-- No policies: not readable or writable by anon/authenticated at all.
revoke all on staff_mfa_backup_codes from anon, authenticated;

-- Ends every session of one user (their refresh tokens stop working; an
-- access token already issued lasts until it expires, at most an hour).
-- Used when the super-admin resets someone's 2FA. Service role only.
create or replace function revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke execute on function revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function revoke_user_sessions(uuid) to service_role;
