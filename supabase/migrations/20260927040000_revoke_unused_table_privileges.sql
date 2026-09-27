-- Tidy-up: remove table privileges the API roles never need.
--
-- Supabase grants anon and authenticated every table privilege by default,
-- including TRUNCATE (which bypasses row-level security), TRIGGER and
-- REFERENCES. The REST API can't issue those statements, so this was not
-- exploitable, but nothing in the app needs them either. Found while
-- verifying the production project on 2026-09-27.
--
-- SELECT/INSERT/UPDATE/DELETE grants are unchanged; row-level security
-- still decides what each role can actually do with them.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Tables created by future migrations (run as postgres) don't get them either.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
