-- handle_new_user() only skipped profile creation for provider = 'google',
-- on the assumption that was the only non-staff Supabase Auth path. Email
-- magic-link sign-in (signInWithOtp, used for leader verification in
-- components/registration/leader-sign-in.tsx) is tagged provider = 'email'
-- -- the exact same tag staff get from signInWithPassword() -- so the
-- trigger couldn't tell a participant leader verifying by magic link apart
-- from a staff member logging in with a password. Every magic-link leader
-- was silently getting a `profiles` row with the default role = 'admin',
-- passing is_admin()/is_staff() and gaining full staff access (every team's
-- PII, registration status updates, registration window toggle, judge
-- assignment management).
--
-- An earlier attempt at this fix checked whether encrypted_password was set,
-- reasoning that only staff (created via supabase.auth.admin.createUser with
-- an explicit password) would have one. Verified against the live database
-- and that's wrong -- Supabase's OTP flow also leaves encrypted_password
-- set, so every leader account had has_password = true too. Not a reliable
-- signal here.
--
-- Fix: explicitly tag the signup instead of inferring it. leader-sign-in.tsx
-- now passes { data: { role_intent: 'leader' } } to signInWithOtp(), which
-- lands in raw_user_meta_data. The trigger skips profile creation whenever
-- that tag is present, in addition to the existing Google OAuth check.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'provider' = 'google'
    or new.raw_user_meta_data ->> 'role_intent' = 'leader'
  then
    return new;
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;
