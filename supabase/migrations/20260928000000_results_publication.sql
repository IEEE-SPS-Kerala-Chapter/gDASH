-- Phase 7: results / shortlist reveal.
--
-- 1. A single admin-controlled "results are published" switch, plus one
--    organiser message for shortlisted teams and one for teams not selected.
--    Only admins and super-admins (is_admin()) can read or change it.
--
-- 2. Decisions no longer leak early. Until results are published, a team's
--    status page shows 'under_review' in place of 'shortlisted'/'rejected'
--    (get_registration_by_token used to return the raw status the moment an
--    admin set it).
--
-- 3. get_member_result() backs the ID-card QR page (/id/<member>): it only
--    reveals a result to a signed-in, confirmed-email member of that team,
--    and only once results are published. Everyone else gets a bare state.

create table if not exists results_publication (
  id boolean primary key default true,
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references profiles(id) on delete set null,
  shortlisted_message text,
  not_selected_message text,
  updated_at timestamptz not null default now(),
  constraint results_publication_singleton check (id),
  constraint results_publication_shortlisted_message_length
    check (shortlisted_message is null or char_length(shortlisted_message) <= 2000),
  constraint results_publication_not_selected_message_length
    check (not_selected_message is null or char_length(not_selected_message) <= 2000)
);

insert into results_publication (id) values (true) on conflict (id) do nothing;

drop trigger if exists set_results_publication_updated_at on results_publication;
create trigger set_results_publication_updated_at
  before update on results_publication
  for each row execute function set_updated_at();

alter table results_publication enable row level security;

drop policy if exists "results_publication_select_admin" on results_publication;
create policy "results_publication_select_admin" on results_publication
  for select using (is_admin());

drop policy if exists "results_publication_update_admin" on results_publication;
create policy "results_publication_update_admin" on results_publication
  for update using (is_admin()) with check (is_admin());

revoke insert, delete, truncate, trigger, references on results_publication from anon, authenticated;

-- Internal helper for the functions below.
create or replace function results_are_published()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_published from results_publication where id), false);
$$;

revoke execute on function results_are_published() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Status page: same member + confirmed-email check as 20260927020000, with
-- the decision masked until publication and the result/message added.
-- ---------------------------------------------------------------------------
create or replace function get_registration_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
  v_email text;
  v_published boolean := results_are_published();
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_email is null then
    return null;
  end if;

  select jsonb_build_object(
    'team', jsonb_build_object(
      'name', t.name,
      'entry_code', t.entry_code,
      'ai_theme', t.ai_theme,
      'district', t.district,
      'status', t.status,
      'created_at', t.created_at
    ),
    'members', (
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'member_code', m.member_code,
        'full_name', m.full_name,
        'is_leader', m.is_leader,
        'college', m.college,
        'branch', m.branch,
        'year', m.year,
        'role_in_team', m.role_in_team
      ) order by m.member_no)
      from team_members m where m.team_id = t.id
    ),
    'registration', jsonb_build_object(
      'problem_statement', r.problem_statement,
      'proposed_solution', r.proposed_solution,
      'ai_approach', r.ai_approach,
      'expected_impact', r.expected_impact,
      'supporting_link', r.supporting_link,
      'status', case
        when not v_published and r.status in ('shortlisted', 'rejected') then 'under_review'
        else r.status
      end,
      'created_at', r.created_at
    ),
    'result', case
      when v_published and r.status = 'shortlisted' then jsonb_build_object(
        'outcome', 'shortlisted',
        'message', (select shortlisted_message from results_publication where id))
      when v_published and r.status = 'rejected' then jsonb_build_object(
        'outcome', 'not_selected',
        'message', (select not_selected_message from results_publication where id))
      else null
    end
  )
  into v_result
  from teams t
  join registrations r on r.team_id = t.id
  where t.access_token = p_token
    and exists (
      select 1 from team_members tm
      where tm.team_id = t.id and lower(tm.email) = v_email
    );

  return v_result; -- null if no match or not a member; callers must not distinguish
end;
$$;

revoke execute on function get_registration_by_token(text) from public, anon;
grant execute on function get_registration_by_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ID-card QR page. Returns only a state to anyone who isn't a signed-in,
-- confirmed-email member of the card's team.
--   not_published    results aren't out yet (said to everyone)
--   sign_in_required results are out; sign in as a team member to see yours
--   pending          you're a member, your team isn't decided yet
--   result           you're a member: team name, outcome and message
-- ---------------------------------------------------------------------------
create or replace function get_member_result(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_team_id uuid;
  v_email text;
  v_team_name text;
  v_status text;
begin
  if not results_are_published() then
    return jsonb_build_object('state', 'not_published');
  end if;

  select m.team_id into v_team_id from team_members m where m.id = p_member_id;
  if v_team_id is null then
    return jsonb_build_object('state', 'sign_in_required');
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_email is null or not exists (
    select 1 from team_members tm where tm.team_id = v_team_id and lower(tm.email) = v_email
  ) then
    return jsonb_build_object('state', 'sign_in_required');
  end if;

  select t.name, r.status into v_team_name, v_status
  from teams t
  join registrations r on r.team_id = t.id
  where t.id = v_team_id;

  if v_status = 'shortlisted' then
    return jsonb_build_object(
      'state', 'result',
      'team_name', v_team_name,
      'outcome', 'shortlisted',
      'message', (select shortlisted_message from results_publication where id));
  elsif v_status = 'rejected' then
    return jsonb_build_object(
      'state', 'result',
      'team_name', v_team_name,
      'outcome', 'not_selected',
      'message', (select not_selected_message from results_publication where id));
  end if;

  return jsonb_build_object('state', 'pending', 'team_name', v_team_name);
end;
$$;

revoke execute on function get_member_result(uuid) from public;
grant execute on function get_member_result(uuid) to anon, authenticated;
