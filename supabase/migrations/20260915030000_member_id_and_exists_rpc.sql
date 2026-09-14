-- Extends get_registration_by_token()'s per-member jsonb with the member's
-- own id (body-only change, p_token text signature untouched) — this is
-- the stable identifier the ID-card QR code needs, both as the displayed
-- "gignite-id" (via lib/member-code.ts's memberDisplayCode()) and as the
-- QR payload itself (${origin}/id/${member.id}).

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
        'id', m.id,
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

grant execute on function get_registration_by_token(text) to anon, authenticated;

-- Existence-only check for the QR/ID-card "Coming Soon" route — kept
-- intentionally tiny (no data beyond a boolean) so /id/[memberId] behaves
-- like every other anon-facing surface in this schema (RPC-only, no direct
-- table SELECT policy for anon), and a garbage/malicious id genuinely
-- 404s instead of rendering identically regardless of validity.
create or replace function member_exists(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (select 1 from team_members where id = p_member_id);
end;
$$;

grant execute on function member_exists(uuid) to anon, authenticated;
