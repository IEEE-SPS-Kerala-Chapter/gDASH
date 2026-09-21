# Supabase Production Migration — official email, new prod project

The Supabase project currently in use (`fgchziqxtpxccehkeawe.supabase.co`, org
"gDASH") is owned by a personal Gmail account. The plan: create a **new**
Supabase account/project under the client's official licensed email, and that
becomes the real production database. The current project stays exactly as it
is — the dev/testing environment for ongoing feature work.

**This is manual, on purpose.** Account creation and ownership need to happen
under credentials Claude doesn't have and shouldn't touch. Do Part 1 yourself,
whenever you're ready — it doesn't affect the dev project at all. Part 2 is
the actual cutover, for later, once feature work has settled down; bring
Claude back in for the CLI steps in Part 2 once you've done the account setup
and are ready to hand over the new project's connection details.

---

## Part 1 — Create the account and project (do this whenever you're ready)

1. Go to **supabase.com** → **Sign up**, using the official licensed email —
   not the personal Gmail. Supabase supports direct email + password signup
   (no Google/GitHub required); verify it via the confirmation email Supabase
   sends to that inbox.
2. Create a new **Organization** (Supabase's hierarchy is Account → Org →
   Project) — name it something identifiable, e.g. the official chapter/event
   name. Free tier is fine to start, matching the current setup — same known
   limits apply: the project pauses after a week of inactivity on the free
   tier, and outbound auth emails are rate-limited on Supabase's shared SMTP
   (see the note on custom SMTP in the original Google OAuth conversation —
   worth revisiting once this is the real prod project).
3. Create a new **Project** inside that org:
   - Name: something like `gignite-prod`.
   - Database password: generate a strong one and store it in a password
     manager immediately — this is the Postgres superuser password, separate
     from any staff login.
   - Region: pick the one closest to your actual users. Since this event is
     Kerala/India-based, choose the Mumbai region if available.
   - Wait ~2 minutes for it to finish provisioning.
4. Once it's up, go to **Project Settings → API** and note down (store
   securely, don't paste into chat):
   - Project URL
   - `anon`/publishable key
   - `service_role`/secret key

That's it for Part 1 — nothing else needs to change yet, and the dev project
keeps working exactly as before.

---

## Part 2 — Migrating the schema over (later, when you're ready to cut over)

This replays the dev project's schema — all 16 migration files already in
`supabase/migrations/` — onto the new prod project: same tables, same Row
Level Security policies, same RPC functions (`submit_registration`,
`get_registration_by_token`, etc.), same storage buckets. No data rows come
across — it's a clean slate, which is what you want for a real production
launch.

1. Confirm the Supabase CLI works: `npx supabase --version`.
2. Link this repo to the *new* project (not the current one):
   `npx supabase link --project-ref <new-project-ref>` — the ref is in the
   new project's Settings → General.
3. Push the schema: `npx supabase db push` — applies every migration in
   order.
4. Seed the first super-admin account on the new project via
   `scripts/seed-super-admin.mjs` (it needs the new project's URL + service
   role key as env vars — check the script's header for the exact names).
5. Re-do the Google OAuth provider setup in the new project's
   **Authentication → Providers → Google** (new Client ID/secret) — this
   lines up with the separate Google account migration already planned; see
   `googleOauth.md`.
6. Set **Authentication → URL Configuration** (Site URL + Redirect URLs) to
   whatever the final production domain ends up being (Vercel's
   `gdash-one.vercel.app`, or the eventual Hostinger domain — see the
   Hostinger migration notes from the earlier hosting conversation).
7. Update the app's environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) wherever the
   app is actually hosted at that point, to point at the new project.
8. Redeploy, then smoke-test the whole flow end-to-end (leader sign-in,
   registration submit, staff login, admin dashboard) against the new
   project before calling it live.
9. Decide what happens to the old dev project afterward — recommend keeping
   it as a permanent dev/staging sandbox rather than deleting it, so future
   feature work still has somewhere safe to run that isn't production.

## What not to do

- Never share the new project's `service_role`/secret key outside trusted
  maintainers — same rule as the current project.
- Don't point production traffic (real domain, real registrations) at the
  new project until the Part 2 checklist has been verified end-to-end.
