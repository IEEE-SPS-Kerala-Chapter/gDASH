-- gIGNITE — initial schema
--
-- Participant registration is authless: the team leader fills one continuous
-- form (team -> members -> idea -> declarations) and gets back an opaque
-- access_token used to view /register/status/[token] later. There are no
-- participant accounts. Staff (admin/judge/volunteer) still authenticate via
-- Supabase Auth and get a `profiles` row.
--
-- Written idempotently so it can be safely re-run while iterating.

-- ============================================================================
-- STAFF PROFILES (admin / judge / volunteer — provisioned via Supabase Auth)
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'judge', 'volunteer')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
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
    select 1 from profiles where id = auth.uid() and role in ('admin', 'judge', 'volunteer')
  );
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

drop policy if exists "profiles_select_own_or_staff" on profiles;
create policy "profiles_select_own_or_staff" on profiles
  for select using (id = auth.uid() or is_staff());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================================
-- TEAMS / MEMBERS / REGISTRATIONS
-- ============================================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  ai_theme text not null check (ai_theme in (
    'AI for Disaster Management',
    'AI for Healthcare',
    'AI for Mobility & Transportation',
    'AI for Smart Cities',
    'Open Innovation Track'
  )),
  district text not null check (district in (
    'Ernakulam', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kottayam'
  )),
  access_token text not null unique default gen_random_uuid()::text,
  status text not null default 'active' check (status in ('active', 'disqualified', 'withdrawn')),
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  college text not null,
  branch text,
  year text check (year in ('1st year', '2nd year', '3rd year', '4th year', 'PG')),
  role_in_team text,
  is_leader boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

-- One person can't be registered on more than one team.
create unique index if not exists team_members_email_unique_idx on team_members (lower(email));

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references teams(id) on delete cascade,
  problem_statement text not null check (char_length(problem_statement) between 50 and 1500),
  proposed_solution text not null check (char_length(proposed_solution) between 50 and 1500),
  ai_approach text not null check (char_length(ai_approach) between 30 and 1500),
  expected_impact text not null check (char_length(expected_impact) between 30 and 1500),
  supporting_link text,
  deck_path text,
  declaration_eligibility boolean not null default false,
  declaration_originality boolean not null default false,
  declaration_rules boolean not null default false,
  declaration_media_consent boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'shortlisted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint required_declarations_confirmed check (
    declaration_eligibility and declaration_originality and declaration_rules
  )
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_registrations_updated_at on registrations;
create trigger set_registrations_updated_at
  before update on registrations
  for each row execute function set_updated_at();

alter table teams enable row level security;
alter table team_members enable row level security;
alter table registrations enable row level security;

-- No direct anon/authenticated INSERT or SELECT policies: participants never
-- touch these tables directly. Writes go through submit_registration() below
-- (SECURITY DEFINER); status reads go through get_registration_by_token()
-- (SECURITY DEFINER, scoped to one team by its access_token). Staff reads for
-- the admin dashboard go through the policies below.

drop policy if exists "teams_select_staff" on teams;
create policy "teams_select_staff" on teams for select using (is_staff());

drop policy if exists "team_members_select_staff" on team_members;
create policy "team_members_select_staff" on team_members for select using (is_staff());

drop policy if exists "registrations_select_staff" on registrations;
create policy "registrations_select_staff" on registrations for select using (is_staff());

drop policy if exists "registrations_update_admin" on registrations;
create policy "registrations_update_admin" on registrations for update using (is_admin()) with check (is_admin());

-- ============================================================================
-- submit_registration — atomic write for the whole 4-step form
-- ============================================================================

create or replace function submit_registration(
  p_team_name text,
  p_ai_theme text,
  p_district text,
  p_leader jsonb,       -- { full_name, email, phone, college }
  p_members jsonb,      -- array of { full_name, email, phone, college, branch, year, role_in_team }
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
begin
  if not (p_declaration_eligibility and p_declaration_originality and p_declaration_rules) then
    raise exception 'required declarations not confirmed' using errcode = '22023';
  end if;

  v_member_count := 1 + coalesce(jsonb_array_length(p_members), 0);
  if v_member_count < 1 or v_member_count > 5 then
    raise exception 'team size must be between 1 and 5 members' using errcode = '22023';
  end if;

  begin
    insert into teams (name, ai_theme, district)
    values (p_team_name, p_ai_theme, p_district)
    returning id, access_token into v_team_id, v_access_token;
  exception when unique_violation then
    raise exception 'team name taken' using errcode = '23505';
  end;

  begin
    insert into team_members (team_id, full_name, email, phone, college, is_leader)
    values (
      v_team_id,
      p_leader ->> 'full_name',
      p_leader ->> 'email',
      p_leader ->> 'phone',
      p_leader ->> 'college',
      true
    );
  exception when unique_violation then
    raise exception 'member email already registered' using errcode = '23505';
  end;

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    begin
      insert into team_members (team_id, full_name, email, phone, college, branch, year, role_in_team, is_leader)
      values (
        v_team_id,
        v_member ->> 'full_name',
        v_member ->> 'email',
        v_member ->> 'phone',
        v_member ->> 'college',
        v_member ->> 'branch',
        v_member ->> 'year',
        v_member ->> 'role_in_team',
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

  return jsonb_build_object('team_id', v_team_id, 'access_token', v_access_token);
end;
$$;

-- ============================================================================
-- get_registration_by_token — the only anon-readable path, scoped to one team
-- ============================================================================

create or replace function get_registration_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'team', jsonb_build_object(
      'name', t.name,
      'ai_theme', t.ai_theme,
      'district', t.district,
      'status', t.status,
      'created_at', t.created_at
    ),
    'members', (
      select jsonb_agg(jsonb_build_object(
        'full_name', m.full_name,
        'is_leader', m.is_leader,
        'college', m.college,
        'branch', m.branch,
        'year', m.year,
        'role_in_team', m.role_in_team
      ) order by m.is_leader desc, m.created_at)
      from team_members m where m.team_id = t.id
    ),
    'registration', jsonb_build_object(
      'problem_statement', r.problem_statement,
      'proposed_solution', r.proposed_solution,
      'ai_approach', r.ai_approach,
      'expected_impact', r.expected_impact,
      'supporting_link', r.supporting_link,
      'status', r.status,
      'created_at', r.created_at
    )
  )
  into v_result
  from teams t
  join registrations r on r.team_id = t.id
  where t.access_token = p_token;

  return v_result; -- null if no match; callers must not distinguish "not found" from other errors
end;
$$;

-- Anon/authenticated only need EXECUTE on the two RPCs above, never table access.
grant execute on function submit_registration(
  text, text, text, jsonb, jsonb, text, text, text, text, text, text, boolean, boolean, boolean, boolean
) to anon, authenticated;
grant execute on function get_registration_by_token(text) to anon, authenticated;

-- ============================================================================
-- STORAGE — optional deck upload (Step 3, "Supporting material")
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-decks',
  'registration-decks',
  false,
  20971520, -- 20 MB
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can upload a deck before a team exists (pre-submit); nobody can read
-- or overwrite one directly — the admin dashboard reads via the service role
-- key, and deck_path is only ever linked to a row through submit_registration.
drop policy if exists "registration_decks_insert" on storage.objects;
create policy "registration_decks_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'registration-decks');
