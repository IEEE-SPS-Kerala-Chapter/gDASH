-- Client requirement: "Draft Registration Handling" (Priority: High) — a
-- server-side draft so an in-progress registration is there "whenever the
-- user logs in," not just in one browser's localStorage
-- (lib/registration-draft.ts, kept as-is as a fast local cache; this table
-- is the durable, cross-device copy). One draft per leader, saved only
-- when they explicitly click "Save draft" — not on every keystroke — and
-- deleted the moment they actually submit, so there's never anything left
-- to accidentally resume/overwrite a real submission with.

create table if not exists registration_drafts (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null unique references auth.users(id) on delete cascade,
  value jsonb not null,
  step int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_registration_drafts_updated_at on registration_drafts;
create trigger set_registration_drafts_updated_at
  before update on registration_drafts
  for each row execute function set_updated_at();

alter table registration_drafts enable row level security;

-- A leader only ever sees/touches their own draft — never another
-- leader's, and never any staff role either; a draft isn't a registration,
-- there's nothing here for admin/judge/volunteer to review.
drop policy if exists "registration_drafts_select_own" on registration_drafts;
create policy "registration_drafts_select_own" on registration_drafts
  for select using (leader_id = auth.uid());

drop policy if exists "registration_drafts_insert_own" on registration_drafts;
create policy "registration_drafts_insert_own" on registration_drafts
  for insert with check (leader_id = auth.uid());

drop policy if exists "registration_drafts_update_own" on registration_drafts;
create policy "registration_drafts_update_own" on registration_drafts
  for update using (leader_id = auth.uid()) with check (leader_id = auth.uid());

drop policy if exists "registration_drafts_delete_own" on registration_drafts;
create policy "registration_drafts_delete_own" on registration_drafts
  for delete using (leader_id = auth.uid());
