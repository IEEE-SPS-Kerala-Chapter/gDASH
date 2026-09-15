-- Adds a super_admin role that sits above admin/judge/volunteer, plus an
-- audit_logs table so super_admin can see who did what across the whole
-- platform (participants registering, judges scoring, admins/volunteers
-- acting). Written idempotently so it can be safely re-run while iterating.

-- ============================================================================
-- ROLE: super_admin
-- ============================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'judge', 'volunteer', 'super_admin'));

-- is_admin() now covers super_admin too — every existing "admin-only" RLS
-- policy (registrations_update_admin, registration_assignments insert/
-- delete, judge_scores admin-select, ...) extends to super_admin for free
-- without having to touch each policy individually. Scoring is judge-only
-- and never checks is_admin(), so this doesn't hand super_admin the
-- ability to score — matching "all admin access except judging".
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'judge', 'volunteer', 'super_admin')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

-- is_admin() now also covers super_admin, which means a super_admin can
-- create registration_assignments rows too. Tighten the insert check so
-- the judge_id on that row must actually belong to a judge-role profile —
-- otherwise a super_admin could assign the registration to themselves and
-- then satisfy judge_scores_insert's "exists an assignment for auth.uid()"
-- check, i.e. score it. "All admin access except judging" needs this closed
-- at the DB level, not just by the judge-picker UI only listing judges.
drop policy if exists "registration_assignments_insert_admin" on registration_assignments;
create policy "registration_assignments_insert_admin" on registration_assignments
  for insert with check (
    is_admin()
    and exists (select 1 from profiles where id = judge_id and role = 'judge')
  );

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Null actor_id = an unauthenticated participant (team registration).
  actor_id uuid references profiles(id) on delete set null,
  actor_role text not null default 'participant',
  actor_label text not null,
  action text not null,
  target_type text,
  target_id uuid,
  target_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);

alter table audit_logs enable row level security;

-- Only super_admin can read the log. No insert/update/delete policy for
-- anon/authenticated at all — every write goes through log_audit_event()
-- below (SECURITY DEFINER), never a direct table write from the app.
drop policy if exists "audit_logs_select_super_admin" on audit_logs;
create policy "audit_logs_select_super_admin" on audit_logs for select using (is_super_admin());

-- Callable by anyone (participants included — team registration has no
-- session) so every kind of activity can be logged the same way. Resolves
-- the actor's role/name from profiles when there's a session; falls back to
-- 'participant' when there isn't (the registration flow is authless by
-- design, see init_schema.sql).
create or replace function log_audit_event(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_target_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_label text;
begin
  if v_actor_id is not null then
    select role, coalesce(full_name, email) into v_actor_role, v_actor_label
    from profiles where id = v_actor_id;
  end if;

  insert into audit_logs (actor_id, actor_role, actor_label, action, target_type, target_id, target_label, metadata)
  values (
    v_actor_id,
    coalesce(v_actor_role, 'participant'),
    coalesce(v_actor_label, 'Participant'),
    p_action,
    p_target_type,
    p_target_id,
    p_target_label,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

grant execute on function log_audit_event(text, text, uuid, text, jsonb) to anon, authenticated;

-- ============================================================================
-- submit_registration — same body as 20260915020000_submit_registration_v2,
-- plus one log_audit_event() call so a team's own registration shows up in
-- the audit log even though the flow is authless.
-- ============================================================================

create or replace function submit_registration(
  p_team_name text,
  p_ai_theme text,
  p_district text,
  p_leader jsonb,
  p_members jsonb,
  p_problem_statement text,
  p_proposed_solution text,
  p_ai_approach text,
  p_expected_impact text,
  p_supporting_link text,
  p_deck_path text,
  p_declaration_eligibility boolean,
  p_declaration_originality boolean,
  p_declaration_rules boolean,
  p_declaration_media_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_access_token text;
  v_member jsonb;
  v_member_count int;
  v_email_re text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  v_phone_re text := '^\+?[0-9]{10,13}$';
begin
  if not (p_declaration_eligibility and p_declaration_originality and p_declaration_rules) then
    raise exception 'required declarations not confirmed' using errcode = '22023';
  end if;

  if p_team_name is null or char_length(p_team_name) not between 3 and 50 then
    raise exception 'invalid team name' using errcode = '22023';
  end if;

  if p_leader is null
    or coalesce(char_length(p_leader ->> 'full_name'), 0) not between 2 and 80
    or (p_leader ->> 'email') !~* v_email_re
    or (p_leader ->> 'phone') !~ v_phone_re
    or coalesce(char_length(p_leader ->> 'college'), 0) not between 2 and 120
    or coalesce(char_length(p_leader ->> 'role_in_team'), 0) not between 2 and 60
    or coalesce(char_length(p_leader ->> 'id_card_path'), 0) not between 1 and 512
  then
    raise exception 'invalid leader details' using errcode = '22023';
  end if;

  v_member_count := 1 + coalesce(jsonb_array_length(p_members), 0);
  if v_member_count < 2 or v_member_count > 5 then
    raise exception 'team size must be between 2 and 5 members' using errcode = '22023';
  end if;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    if coalesce(char_length(v_member ->> 'full_name'), 0) not between 2 and 80
      or (v_member ->> 'email') !~* v_email_re
      or (v_member ->> 'phone') !~ v_phone_re
      or coalesce(char_length(v_member ->> 'college'), 0) not between 2 and 120
      or coalesce(char_length(v_member ->> 'role_in_team'), 0) not between 2 and 60
      or coalesce(char_length(v_member ->> 'id_card_path'), 0) not between 1 and 512
      or (v_member ->> 'year') is not null and (v_member ->> 'year') not in ('1st year', '2nd year', '3rd year', '4th year', 'PG')
    then
      raise exception 'invalid member details' using errcode = '22023';
    end if;
  end loop;

  if char_length(coalesce(p_problem_statement, '')) not between 50 and 1500
    or char_length(coalesce(p_proposed_solution, '')) not between 50 and 1500
    or char_length(coalesce(p_ai_approach, '')) not between 30 and 1500
    or char_length(coalesce(p_expected_impact, '')) not between 30 and 1500
    or char_length(coalesce(p_supporting_link, '')) > 2048
    or char_length(coalesce(p_deck_path, '')) > 512
  then
    raise exception 'invalid idea details' using errcode = '22023';
  end if;

  begin
    insert into teams (name, ai_theme, district)
    values (p_team_name, p_ai_theme, p_district)
    returning id, access_token into v_team_id, v_access_token;
  exception when unique_violation then
    raise exception 'team name taken' using errcode = '23505';
  end;

  begin
    insert into team_members (team_id, full_name, email, phone, college, role_in_team, id_card_path, is_leader)
    values (
      v_team_id,
      p_leader ->> 'full_name',
      p_leader ->> 'email',
      p_leader ->> 'phone',
      p_leader ->> 'college',
      p_leader ->> 'role_in_team',
      p_leader ->> 'id_card_path',
      true
    );
  exception when unique_violation then
    raise exception 'member email already registered' using errcode = '23505';
  end;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    begin
      insert into team_members (team_id, full_name, email, phone, college, branch, year, role_in_team, id_card_path, is_leader)
      values (
        v_team_id,
        v_member ->> 'full_name',
        v_member ->> 'email',
        v_member ->> 'phone',
        v_member ->> 'college',
        v_member ->> 'branch',
        v_member ->> 'year',
        v_member ->> 'role_in_team',
        v_member ->> 'id_card_path',
        false
      );
    exception when unique_violation then
      raise exception 'member email already registered' using errcode = '23505';
    end;
  end loop;

  insert into registrations (
    team_id, problem_statement, proposed_solution, ai_approach, expected_impact,
    supporting_link, deck_path,
    declaration_eligibility, declaration_originality, declaration_rules, declaration_media_consent
  )
  values (
    v_team_id, p_problem_statement, p_proposed_solution, p_ai_approach, p_expected_impact,
    nullif(p_supporting_link, ''), nullif(p_deck_path, ''),
    p_declaration_eligibility, p_declaration_originality, p_declaration_rules, p_declaration_media_consent
  );

  perform log_audit_event(
    'team.registered',
    'team',
    v_team_id,
    p_team_name,
    jsonb_build_object('ai_theme', p_ai_theme, 'district', p_district, 'member_count', v_member_count)
  );

  return jsonb_build_object('team_id', v_team_id, 'access_token', v_access_token);
end;
$$;

grant execute on function submit_registration(
  text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to anon, authenticated;
