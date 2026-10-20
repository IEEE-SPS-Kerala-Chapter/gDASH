-- Optional staff 2FA (2026-10-22).
--
-- Until now every staff power needed an aal2 session (the authenticator-app
-- code, 20261006000000_staff_mfa.sql). Now 2FA is a choice for admins,
-- judges and volunteers, and stays required for the super-admin:
--
--   * Someone WITH an authenticator app must still enter its code — a
--     password-only (aal1) session gets nothing, exactly as before. Turning
--     2FA off needs a code too (done by the server, app/actions/mfa.ts).
--   * Someone WITHOUT an authenticator app passes with the password alone,
--     unless they're the super-admin.
--
-- Every policy and RPC already goes through staff_mfa_ok() together with a
-- check on auth.uid() (a profile role, a judge_id, …), so changing this one
-- function is enough.
--
-- profiles.mfa_skipped_at records that the person chose "skip for now" at
-- sign-in, so the app stops asking (they can turn 2FA on from Profile). It's
-- only a reminder flag — it grants nothing; the rule above is what counts.

alter table profiles add column if not exists mfa_skipped_at timestamptz;

create or replace function staff_mfa_ok()
returns boolean
language sql
stable
-- Definer: reads auth.mfa_factors, which signed-in users can't.
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or (
      not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
      and not exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role = 'super_admin'
      )
    )
  );
$$;
