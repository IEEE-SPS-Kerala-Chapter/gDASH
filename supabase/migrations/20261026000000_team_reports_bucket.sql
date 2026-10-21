-- Team report PDFs (2026-10-22).
--
-- Admins and super-admins can download a "report card" PDF per team (team
-- and member details, the idea, generated and uploaded ID cards, and the
-- deck), one at a time or as a zip of all / shortlisted teams. The server
-- builds each PDF and keeps it here, named by the registration's version,
-- so an unchanged team isn't rebuilt (lib/team-report.ts).
--
-- Private, with no storage policies: only the service role (the server,
-- after checking the caller is an admin) reads or writes it, and staff get
-- short-lived signed links. Reports hold ID card photos and phone numbers.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-reports', 'team-reports', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
