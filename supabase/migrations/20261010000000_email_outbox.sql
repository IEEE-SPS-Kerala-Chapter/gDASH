-- Leader emails (2026-10-10).
--
-- The app emails the team leader (only the leader) from gignite@gadgeon.com
-- over Gmail SMTP:
--   registration_received — right after submitting, with every member's ID card attached
--   ineligible            — when staff mark the team ineligible (generic wording)
--   result                — shortlisted / not selected, sent in batches when an
--                           admin clicks "Send result emails" after publishing
--
-- Every email is a row here first, so each one is sent at most once per team
-- (unique team_id + kind), failures are visible and can be retried, and the
-- results batch can stop and resume. The app writes with the service-role
-- key from server actions that have already checked the caller; staff with
-- admin rights can read it.

create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  kind text not null check (kind in ('registration_received', 'ineligible', 'result')),
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint email_outbox_team_kind_key unique (team_id, kind)
);

create index if not exists email_outbox_kind_status_idx on email_outbox (kind, status);

drop trigger if exists set_email_outbox_updated_at on email_outbox;
create trigger set_email_outbox_updated_at
  before update on email_outbox
  for each row execute function set_updated_at();

alter table email_outbox enable row level security;

drop policy if exists "email_outbox_select_admin" on email_outbox;
create policy "email_outbox_select_admin" on email_outbox
  for select using (is_admin());

revoke all on email_outbox from anon, authenticated;
grant select on email_outbox to authenticated;
