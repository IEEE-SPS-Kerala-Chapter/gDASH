-- Don't reveal other teams' names from the team-name availability check.
--
-- check_team_name_available() returned the existing team's name
-- ('similar_to') when a new name was too close to it, and
-- find_similar_team_name() was callable directly over the API (functions
-- are executable by PUBLIC by default). Either let anyone list registered
-- team names by trying variations. The form now just says "too close to an
-- existing team" (QA request, 2026-09-27), so the name isn't needed.

create or replace function check_team_name_available(p_team_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_norm text := normalize_team_name(p_team_name);
begin
  if v_norm = '' then
    return jsonb_build_object('available', true, 'reason', null, 'similar_to', null);
  end if;

  if exists (select 1 from teams where normalize_team_name(name) = v_norm) then
    return jsonb_build_object('available', false, 'reason', 'taken', 'similar_to', null);
  end if;

  if find_similar_team_name(p_team_name) is not null then
    return jsonb_build_object('available', false, 'reason', 'similar', 'similar_to', null);
  end if;

  return jsonb_build_object('available', true, 'reason', null, 'similar_to', null);
end;
$$;

grant execute on function check_team_name_available(text) to anon, authenticated;

-- Internal helper only (used by check_team_name_available and
-- submit_registration, which run as their owner): not callable over the API.
revoke execute on function find_similar_team_name(text) from public, anon, authenticated;
