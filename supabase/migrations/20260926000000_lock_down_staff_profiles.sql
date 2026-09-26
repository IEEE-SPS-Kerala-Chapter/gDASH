-- SECURITY FIX: any self-service sign-up could become an admin.
--
-- 1. handle_new_user() created a `profiles` row -- with the column default
--    role = 'admin' -- for every new auth.users row that wasn't Google OAuth
--    and didn't carry raw_user_meta_data.role_intent = 'leader'. That tag is
--    supplied by the client, so anyone with the public anon key could call
--    POST /auth/v1/signup (or signInWithOtp) without it and get a profile
--    that passes is_admin()/is_staff(): every team's PII, exports, status
--    changes, judge assignments. Exploited in testing on 2026-09-25.
--
-- 2. The "profiles_update_own" policy let any signed-in user UPDATE their own
--    profile row with no column restriction -- so a judge or volunteer could
--    set their own role to 'super_admin' with one REST call.
--
-- Fix: a profile (i.e. staff access) can now only ever be created or changed
-- by trusted server code using the service role -- createStaffAccount() in
-- app/actions/admin.ts and scripts/seed-*.mjs, which insert it explicitly.
-- Signing up through Supabase Auth, by any method, never grants staff access.

-- (1) Stop creating profiles on sign-up. The trigger is dropped; the
-- function is kept as a no-op so nothing that references it breaks.
drop trigger if exists on_auth_user_created on auth.users;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intentionally does nothing: staff profiles are created only by the
  -- service role (see header). Kept so older references don't error.
  return new;
end;
$$;

-- No implicit role: every profile insert must say which role it grants.
alter table profiles alter column role drop default;

-- (2) Signed-in users can no longer write to profiles at all. The app never
-- updates a profile with a user's own session -- only via the service role
-- (role/name on staff creation, must_reset_password after a reset).
drop policy if exists "profiles_update_own" on profiles;
revoke insert, update, delete on profiles from anon, authenticated;

-- Defence in depth: even if a future policy or grant reopens writes, role
-- and identity columns can only change through the service role / postgres.
create or replace function profiles_protect_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if tg_op = 'INSERT' then
      raise exception 'staff profiles can only be created by the server' using errcode = '42501';
    end if;
    if new.role is distinct from old.role or new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'profile role and identity can only be changed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on profiles;
create trigger profiles_protect_privileged_columns
  before insert or update on profiles
  for each row execute function profiles_protect_privileged_columns();

-- Helper internals shouldn't be callable over the API.
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function profiles_protect_privileged_columns() from public, anon, authenticated;
