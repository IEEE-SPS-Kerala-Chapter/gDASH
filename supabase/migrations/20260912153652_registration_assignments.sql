-- Lets admins assign a registration to one or more judges. No judge-facing
-- view exists yet (that's the rest of Phase 5) — for now this is
-- organizational metadata the admin dashboard reads/writes. When the judge
-- dashboard is built, whether assignment also RESTRICTS what a judge can
-- see (vs. all judges seeing everything, scoped by assignment only for
-- tracking) is an open design question for that phase, not this one.

create table if not exists registration_assignments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  judge_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (registration_id, judge_id)
);

alter table registration_assignments enable row level security;

drop policy if exists "registration_assignments_select_staff" on registration_assignments;
create policy "registration_assignments_select_staff" on registration_assignments
  for select using (is_staff());

drop policy if exists "registration_assignments_insert_admin" on registration_assignments;
create policy "registration_assignments_insert_admin" on registration_assignments
  for insert with check (is_admin());

drop policy if exists "registration_assignments_delete_admin" on registration_assignments;
create policy "registration_assignments_delete_admin" on registration_assignments
  for delete using (is_admin());
