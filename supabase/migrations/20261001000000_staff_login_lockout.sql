-- Staff sign-in lockout (security finding 2026-09-30): after 5 failed
-- sign-in attempts, the staff login refuses further attempts for 1 hour.
--
-- Counted two ways, both over the last hour and only since that
-- email's/IP's last successful sign-in:
--   * per email  — 5 failures lock that account's sign-in for 1 hour
--     (counted for any email typed, registered or not, so the response
--     never reveals whether an email is a staff account);
--   * per IP     — 20 failures from one address lock it for 1 hour
--     (someone trying many different emails).
-- The lock runs 1 hour from the failure that triggered it. Attempts refused
-- during a lock aren't recorded, so they don't extend it.
--
-- Used only by the staff sign-in server action through the service role
-- (app/actions/auth.ts). Nobody else can read or call any of this.
--
-- To lift a lock early (e.g. a locked-out admin), in the SQL Editor:
--   delete from staff_login_attempts where email = 'someone@example.com';

create table if not exists staff_login_attempts (
  id bigserial primary key,
  email text not null,
  ip text,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists staff_login_attempts_email_idx on staff_login_attempts (email, attempted_at desc);
create index if not exists staff_login_attempts_ip_idx on staff_login_attempts (ip, attempted_at desc);

alter table staff_login_attempts enable row level security;
-- No policies: not readable or writable by anon/authenticated at all.
revoke all on staff_login_attempts from anon, authenticated;

create or replace function staff_login_status(p_email text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_window timestamptz := now() - interval '1 hour';
  v_email_failures integer;
  v_email_last timestamptz;
  v_ip_failures integer := 0;
  v_ip_last timestamptz;
  v_locked_until timestamptz;
begin
  select count(*), max(attempted_at) into v_email_failures, v_email_last
  from staff_login_attempts a
  where a.email = v_email
    and not a.succeeded
    and a.attempted_at > greatest(v_window, coalesce((
      select max(s.attempted_at) from staff_login_attempts s where s.email = v_email and s.succeeded
    ), '-infinity'));

  if p_ip is not null and p_ip <> '' then
    select count(*), max(attempted_at) into v_ip_failures, v_ip_last
    from staff_login_attempts a
    where a.ip = p_ip
      and not a.succeeded
      and a.attempted_at > greatest(v_window, coalesce((
        select max(s.attempted_at) from staff_login_attempts s where s.ip = p_ip and s.succeeded
      ), '-infinity'));
  end if;

  if v_email_failures >= 5 then
    v_locked_until := v_email_last + interval '1 hour';
  end if;
  if v_ip_failures >= 20 then
    v_locked_until := greatest(coalesce(v_locked_until, '-infinity'), v_ip_last + interval '1 hour');
  end if;

  return jsonb_build_object(
    'locked', v_locked_until is not null and v_locked_until > now(),
    'locked_until', v_locked_until,
    'email_failures', v_email_failures
  );
end;
$$;

create or replace function staff_login_record(p_email text, p_ip text, p_succeeded boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into staff_login_attempts (email, ip, succeeded)
  values (lower(btrim(coalesce(p_email, ''))), nullif(p_ip, ''), p_succeeded);
  -- Keep the table small: nothing older than 30 days matters.
  delete from staff_login_attempts where attempted_at < now() - interval '30 days';
end;
$$;

revoke execute on function staff_login_status(text, text) from public, anon, authenticated;
revoke execute on function staff_login_record(text, text, boolean) from public, anon, authenticated;
grant execute on function staff_login_status(text, text) to service_role;
grant execute on function staff_login_record(text, text, boolean) to service_role;
