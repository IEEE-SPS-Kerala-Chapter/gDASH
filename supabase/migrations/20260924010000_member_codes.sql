-- Real per-member IDs, nested under the team's entry_code.
--
-- Until now the "GIG-XXXXXXXX" printed on each ID card was purely cosmetic
-- (lib/member-code.ts: first 8 hex chars of the member's UUID, computed on
-- the fly, never stored, never checked for uniqueness, not searchable).
-- Attendance, food tokens and similar event-day flows need a member ID a
-- volunteer can read aloud, type, or look up -- so this adds a stored one:
--
--   member_no    1..5 within the team (leader is always 1, then the other
--                members in submission order)
--   member_code  <team entry_code>-<member_no>, e.g. GIG-7K3QPA-1
--
-- member_code is unique across every member because entry_code is unique
-- across every team and member_no is unique within a team -- and both are
-- enforced by constraints, not just by construction. The team a member
-- belongs to is readable straight off their ID.
--
-- team_members.id (UUID) stays the internal key and the QR payload; this
-- is the human-facing identifier alongside it.

alter table team_members add column if not exists member_no smallint;
alter table team_members add column if not exists member_code text;

-- Backfill existing members: leader first, then everyone else in the order
-- they were inserted (submit_registration inserts them in form order).
with numbered as (
  select
    m.id,
    row_number() over (partition by m.team_id order by m.is_leader desc, m.created_at, m.id) as n,
    t.entry_code
  from team_members m
  join teams t on t.id = m.team_id
)
update team_members m
set member_no = numbered.n,
    member_code = numbered.entry_code || '-' || numbered.n
from numbered
where numbered.id = m.id and m.member_code is null;

alter table team_members alter column member_no set not null;
alter table team_members alter column member_code set not null;

alter table team_members drop constraint if exists team_members_member_no_check;
alter table team_members add constraint team_members_member_no_check check (member_no between 1 and 5);

alter table team_members drop constraint if exists team_members_team_member_no_key;
alter table team_members add constraint team_members_team_member_no_key unique (team_id, member_no);

alter table team_members drop constraint if exists team_members_member_code_key;
alter table team_members add constraint team_members_member_code_key unique (member_code);

-- ============================================================================
-- Assign member_no/member_code on insert. A trigger (rather than another
-- copy of the whole submit_registration body) keeps every insert path
-- covered. submit_registration inserts the leader first, so the leader
-- gets 1. Every member of a team is inserted inside the same
-- submit_registration transaction, so there's no concurrent insert racing
-- for the same number -- and the unique constraints above are the backstop
-- if that ever changes.
-- ============================================================================

create or replace function assign_member_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_code text;
begin
  select entry_code into v_entry_code from teams where id = new.team_id;
  if v_entry_code is null then
    raise exception 'team % has no entry code', new.team_id;
  end if;

  select coalesce(max(member_no), 0) + 1 into new.member_no
  from team_members where team_id = new.team_id;

  new.member_code := v_entry_code || '-' || new.member_no;
  return new;
end;
$$;

drop trigger if exists team_members_assign_member_code on team_members;
create trigger team_members_assign_member_code
  before insert on team_members
  for each row execute function assign_member_code();

-- ============================================================================
-- Once issued, IDs never change: printed cards, attendance records and food
-- tokens will all reference them. Block edits to member_no/member_code and
-- to the team's entry_code they're derived from.
-- ============================================================================

create or replace function prevent_member_code_change()
returns trigger
language plpgsql
as $$
begin
  if new.member_no is distinct from old.member_no or new.member_code is distinct from old.member_code then
    raise exception 'member_no and member_code cannot be changed once issued' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_prevent_member_code_change on team_members;
create trigger team_members_prevent_member_code_change
  before update on team_members
  for each row execute function prevent_member_code_change();

create or replace function prevent_entry_code_change()
returns trigger
language plpgsql
as $$
begin
  if new.entry_code is distinct from old.entry_code then
    raise exception 'entry_code cannot be changed once issued' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_prevent_entry_code_change on teams;
create trigger teams_prevent_entry_code_change
  before update on teams
  for each row execute function prevent_entry_code_change();

-- ============================================================================
-- get_registration_by_token — same body as 20260923010000, plus
-- member_code per member, ordered by member_no so the status page lists
-- members in ID order.
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

grant execute on function get_registration_by_token(text) to anon, authenticated;
