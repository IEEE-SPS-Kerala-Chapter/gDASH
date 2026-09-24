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

## 1. Results / shortlist reveal

Once shortlisting decisions exist (they already can — `registrations.status`
supports `shortlisted`/`rejected` today via the admin team-detail page),
`/id/[memberId]` should be extended to show the team's result instead of (or
alongside) "Coming Soon" — e.g. "Your team has been shortlisted!" with next
steps, or a neutral "results not yet announced" state before organizers flip
the switch.

Needs: a new RPC (e.g. `get_member_result(p_member_id uuid)`) that joins
`team_members` → `teams` → `registrations` and returns just the status (not
the full registration/team object — same anon-facing minimalism as
`member_exists`), plus a global "results are live" flag (a settings row, or
simply gating on whether any team has a non-`submitted` status) so cards
don't leak an individual team's status before organizers are ready to
announce broadly.

## 2. Food-token check-in (breakfast / lunch / dinner)

On event day, volunteers scan a team member's QR (the same
`/id/[memberId]` URL, or a dedicated `/scan/[memberId]` volunteer-only
route) to mark that meal as claimed, preventing double-claims.

Needs:
- New table, e.g. `food_tokens (member_id uuid references team_members(id), meal text check (meal in ('breakfast','lunch','dinner')), claimed_at timestamptz, claimed_by uuid references profiles(id), primary key (member_id, meal))`.
- A `security definer` RPC (e.g. `claim_food_token(p_member_id uuid, p_meal text)`) restricted to `authenticated` staff with the `volunteer` (or `admin`) role — checked inside the function body against `profiles.role`, not just by grant, so a stolen anon session can't call it. Returns whether the claim succeeded or the meal was already claimed (and by whom/when), so the scanning UI can show a clear "already used" state instead of silently double-granting food.
- A volunteer-facing scan UI: camera-based QR scan (likely a small client library) → resolves to a member id → shows the member's name/team/photo (from the now-admin-only `id_card_path` — this phase would need to decide whether volunteers get a narrow, scan-triggered exception to the current admin-only visibility, e.g. a signed URL minted only in response to a valid, freshly-scanned QR, never a browsable list) → one tap per meal to claim.

## 3. Physical check-in / "registration complete" scan

Same QR, scanned once at event arrival by a volunteer, to mark the team
member as physically checked in (distinct from the food tokens above).

Needs: a `checked_in_at timestamptz` column on `team_members` (or a shared
generic `event_scans` table alongside food tokens, if it turns out check-in
and food scans want the same audit shape) plus a small `security definer`
RPC gated to volunteer/admin the same way as `claim_food_token`.

## 4. Admin dashboard — food-token / check-in tab

A new tab in the existing admin sidebar (`components/admin/dashboard-shell.tsx`)
showing, per team or per member, which meals/check-in have been claimed and
when — mirroring the existing team-list/analytics pattern
(`components/admin/registrations-analytics.tsx`) but reading from the new
`food_tokens`/check-in table instead of `registrations`. Likely wants the
same admin-only gating already established for ID-card visibility
(`app/actions/admin.ts`'s `caller.role === "admin"` checks) since it exposes
attendance data — though a "how many teams have arrived / eaten" summary
view could reasonably be opened to volunteers too, unlike raw ID-card
photos.

---

## Not yet decided (flag for whoever picks this up)

- Whether volunteers scanning for food/check-in need to see the member's
  photo at all, or just name + team + role is enough to prevent fraud —
  this determines whether item 2 needs any carve-out to the current
  admin-only ID-card visibility rule at all.
- Whether results-reveal (item 1) should be a manual "flip a switch" action
  by an admin, or automatically tied to every team having a final
  `shortlisted`/`rejected` status.
- Rate-limiting/anti-abuse on the scan RPCs (e.g. a volunteer's phone losing
  connectivity and replaying a claim) — likely fine as-is since claims are
  idempotent per `(member_id, meal)`, but worth a second look once the scan
  UI exists.
