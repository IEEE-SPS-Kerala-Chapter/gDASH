-- log_audit_event() assumed any signed-in auth.uid() had a matching
-- `profiles` row -- true while only staff authenticated via Supabase Auth.
-- Leader email verification (20260920000000_leader_identity_verification.sql)
-- added a second, deliberately profileless category of signed-in user: team
-- leaders verifying via Google OAuth. handle_new_user() intentionally skips
-- creating a profiles row for provider = 'google' (see
-- 20260912065823_fix_oauth_staff_trigger.sql), so a leader has a valid
-- session but no profiles row.
--
-- log_audit_event() still unconditionally inserted that auth.uid() as
-- actor_id, which audit_logs.actor_id references profiles(id) -- so every
-- submit_registration() call from a Google-verified leader hit
-- audit_logs_actor_id_fkey on its closing log_audit_event() call and rolled
-- back the entire registration.
--
-- Fix: only attribute actor_id when a matching profiles row actually
-- exists; otherwise log it the same way an anonymous participant submission
-- already has (actor_id null, actor_role 'participant').

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
  v_actor_id uuid;
  v_actor_role text;
  v_actor_label text;
begin
  select id, role, coalesce(full_name, email)
    into v_actor_id, v_actor_role, v_actor_label
  from profiles where id = auth.uid();

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
