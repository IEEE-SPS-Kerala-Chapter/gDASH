-- handle_new_user() currently auto-creates a `profiles` row with the
-- default role='admin' for ANY new auth.users row. That was fine while
-- Supabase Auth was only used for manually-provisioned staff — but we're
-- about to let team leaders sign in with Google (solely to verify their
-- email; see app/auth/callback), and every one of them would silently get
-- a staff profile with admin rights through this same trigger.
--
-- Fix: only build a staff profile for the email/password path (how staff
-- actually sign up); skip it entirely for Google sign-ins. Participant
-- leaders authenticating via Google never need a `profiles` row at all —
-- we only need their verified email at submission time, not a staff record.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'provider' = 'google' then
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
