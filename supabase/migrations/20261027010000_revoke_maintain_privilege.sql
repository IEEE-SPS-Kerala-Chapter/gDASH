-- Tidy-up: remove the MAINTAIN privilege from the API roles.
--
-- MAINTAIN (new in Postgres 17) allows VACUUM, ANALYZE, REINDEX, CLUSTER,
-- REFRESH MATERIALIZED VIEW and LOCK TABLE. Supabase granted it to anon
-- and authenticated on most tables; 20260927040000 predates it, so it was
-- missed. The REST API can't issue those statements, so this was not
-- exploitable, but nothing in the app needs it. Found while reading prod
-- grants on 2026-10-23.
--
-- service_role keeps it.

revoke maintain on all tables in schema public from anon, authenticated;

-- Tables created by future migrations (run as postgres) don't get it either.
alter default privileges for role postgres in schema public
  revoke maintain on tables from anon, authenticated;
