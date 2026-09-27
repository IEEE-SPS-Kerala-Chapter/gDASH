# gIGNITE ID Cards — Future Phases

The current build gives every team member a QR-coded ID card (downloadable
PNG from the registration status page) whose QR points to
`/id/[memberId]` — today that route only shows a static **"gIGNITE — Coming
Soon"** page after confirming the id is real. **This doc records the
downstream system that page is deliberately a placeholder for.** None of it
is built yet; nothing below should be assumed to exist in the code.

The reason this can wait: `team_members.id` (a stable UUID, already the QR
payload) plus the new `member_exists(p_member_id uuid)` RPC already give
every future phase its lookup key. Building the phases below later needs no
schema migration on the "identify this card" side — only new read/write
surfaces on top of the id that already round-trips today.

Each member also has a human-readable `team_members.member_code`
(`<team entry_code>-<member_no>`, e.g. `GIG-7K3QPA-1`, leader always `-1`;
see `supabase/migrations/20260924010000_member_codes.sql`). It is unique,
stored, and can't be changed once issued, so it's the fallback key for manual
check-in or food-token claims when a QR won't scan: a volunteer can type it in.

---

## 1. Results / shortlist reveal — BUILT (2026-09-28)

Built in `supabase/migrations/20260928000000_results_publication.sql`:

- `results_publication` singleton: `is_published`, `published_at/by`, and one
  organiser message each for shortlisted and not-selected teams. Readable and
  editable only by `is_admin()` (admin, super_admin). Admin UI:
  `components/admin/results-panel.tsx` on the dashboard, actions in
  `app/actions/results.ts` (audit-logged as `results.published`,
  `results.unpublished`, `results.messages_updated`).
- Manual switch, reversible. Publishing with undecided teams is allowed (with
  a warning); those teams see "Under review" until decided.
- `get_registration_by_token` masks `shortlisted`/`rejected` as
  `under_review` until published, and adds `result: { outcome, message }`.
  (Before this, a team saw its decision the moment an admin set it.)
- `get_member_result(p_member_id)` backs `/id/[memberId]`: returns only a
  state (`not_published` / `sign_in_required`) unless the caller is a
  signed-in, confirmed-email member of that team, who gets `pending` or
  `result` with team name, outcome and message.

## 2 & 3. Meal tokens and venue check-in — BUILT (2026-09-29)

Built together as one scanner (`supabase/migrations/20260929000000_event_checkpoints.sql`):

- `event_checkpoints`: a built-in "Venue check-in" plus admin-created meal
  slots ("Day 1 · Lunch"), each opened/closed by admins on
  `/dashboard/check-in` (`components/checkin/checkpoints-panel.tsx`).
- `checkpoint_scans`: primary key (checkpoint, member) — one claim per meal /
  one check-in per member, enforced by the database. Tables are admin-only.
- Scanners (volunteers, admins, super-admins) use `scan_list_checkpoints`,
  `scan_member(checkpoint, member id or member code)` and `undo_scan`
  (admins any time; the scanning volunteer within 2 minutes). Only teams whose
  registration is `shortlisted` are accepted.
- `/dashboard/scan` (`components/checkin/scanner.tsx`, `qr-scanner` library):
  camera + manual member-code entry; result shows name, team and the ID-card
  photo (via `getVerificationIdCardUrl`); online only.
- QR parsing: `lib/member-ref.ts` (any domain's `/id/<uuid>`, bare uuid, or
  member code).

## 4. Attendance dashboard — BUILT (2026-09-30)

`/dashboard/attendance` (`supabase/migrations/20260930000000_attendance.sql`,
`app/actions/attendance.ts`, `components/attendance/*`), refreshing every 15 s:

- Everyone who can scan (volunteers, admins, super-admins) sees counts per
  check-in point — scanned of eligible (shortlisted participants) — via
  `attendance_summary()`. No names for volunteers.
- Admins also get every shortlisted participant × check-in point, search, a
  "Not yet: <point>" filter, CSV export (`lib/csv.ts`, formula-injection safe),
  and click-a-cell corrections via `admin_set_scan()` (mark manually — even on
  a closed meal — or remove), audit-logged.

## Not yet decided (flag for whoever picks this up)

- Rate-limiting/anti-abuse on the scan RPCs (e.g. a volunteer's phone losing
  connectivity and replaying a claim) — likely fine as-is since claims are
  idempotent per `(member_id, meal)`, but worth a second look once the scan
  UI exists.
