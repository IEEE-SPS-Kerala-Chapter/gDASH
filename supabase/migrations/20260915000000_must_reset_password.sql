-- Force staff (admin/judge/volunteer) accounts created from now on to reset
-- their password on first login. Existing accounts are grandfathered in the
-- same statement so nobody who can already sign in today gets locked into
-- an unexpected reset screen.
alter table profiles
  add column if not exists must_reset_password boolean not null default true;

update profiles
  set must_reset_password = false
  where must_reset_password is true;
