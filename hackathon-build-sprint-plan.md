# 2-Day Build Sprint: Hackathon Platform (Claude Code Prompts)

**Reality check first:** Solo, 2 days, full platform (registration + judging + logistics) is not realistic to do well.
This plan guarantees **registration + admin view working and deployed** by end of Day 1, and treats
**judging + logistics as stretch phases** for Day 2 only if the core is solid. Don't skip ahead to stretch
phases with a shaky foundation — a broken registration form on event day is worse than no QR scanner.

Work through phases in order. After each Claude Code session, actually test the feature in the browser
before moving on — don't chain 4 phases blind and debug at the end.

---

## Phase 0 — Project Setup (~30 min)

**Goal:** Next.js project running locally, connected to a real Supabase project, deployed to Vercel (even empty) so your deploy pipeline works from hour one.

**Prompt for Claude Code:**
```
Set up a new Next.js 14+ project using the App Router and TypeScript, with Tailwind CSS
and shadcn/ui installed. Install the Supabase JS client (@supabase/supabase-js and
@supabase/ssr). Create the standard Supabase server/client/middleware setup for Next.js
App Router (server component client, browser client, and middleware for session refresh).
Add a .env.local.example with placeholders for NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Set up the folder structure:
app/(public)/register, app/(admin)/dashboard, lib/supabase/. Don't build any features yet,
just get the skeleton running with `npm run dev` and confirm it builds cleanly.
```

*You do manually:* create the Supabase project on supabase.com, copy the URL/anon key/service key into `.env.local`, push an empty repo to GitHub, connect it to Vercel.

---

## Phase 1 — Minimal Schema + RLS (~45 min)

**Goal:** Just enough schema for registration + admin viewing. Skip judging/logistics tables entirely for now — add them later only if you reach the stretch phases.

**Prompt for Claude Code:**
```
Create a Supabase migration (using `supabase migration new init_schema`) with this schema:

- profiles (id uuid pk references auth.users, full_name text, email text unique, phone text,
  role text default 'participant' check (role in ('participant','admin')), created_at timestamptz default now())
- teams (id uuid pk default gen_random_uuid(), name text not null, track text, status text
  default 'active', created_at timestamptz default now())
- team_members (team_id uuid references teams(id) on delete cascade, user_id uuid references
  profiles(id), is_leader boolean default false, primary key (team_id, user_id))
- registrations (id uuid pk default gen_random_uuid(), team_id uuid references teams(id),
  idea_title text, idea_description text, status text default 'submitted', created_at
  timestamptz default now())

Enable RLS on all four tables. Write policies so:
- A user can select/update only their own profiles row
- A user can select teams/team_members/registrations only if they're a member of that team
- A user can insert into teams, team_members (for themselves), and registrations freely
  (registration is open, no invite gating needed)
- Any user with role='admin' in profiles can select ALL rows on every table, using a
  `is_admin()` Postgres helper function so I'm not repeating the subquery

Also write a trigger that auto-inserts a profiles row when a new auth.users row is created
(standard Supabase pattern), defaulting role to 'participant'.

Give me the full migration SQL file content.
```

*You do manually:* run the migration against your Supabase project, then manually flip one user's `role` to `admin` in the Supabase dashboard table editor (that'll be you).

---

## Phase 2 — Registration Flow (~2.5–3 hrs, the core of Day 1)

**Goal:** A participant can sign up (email/password via Supabase Auth), create or join a team, and submit their idea. This is the phase that must work — spend most of Day 1 here.

**Prompt for Claude Code:**
```
Build the participant registration flow in the app/(public)/register route group:

1. /register/signup — email + password signup form using Supabase Auth
   (supabase.auth.signUp), with Zod validation (name, email, phone, password).
   Show a "check your email to confirm" state after signup.

2. /register/team — after login, let the user either:
   - Create a new team (name + track dropdown), which makes them the team leader, OR
   - Join an existing team by entering a team name (simple lookup, no invite codes for now)
   Use React Hook Form + Zod. Show a clear error if the team name doesn't exist for "join".

3. /register/submit — once on a team, a form for idea_title and idea_description
   (textarea, min/max length validated), inserting into the registrations table tied to
   their team_id. Show a success confirmation screen after submit summarizing what was submitted.

4. Add a simple /register/status page showing the logged-in user their team name,
   members, and submission status — this is their "you're registered" landing page for
   returning visits.

Use Supabase server actions (not client-side inserts) for all writes, validating server-side
with the same Zod schema. Show loading and error states on every form. Keep styling clean
with shadcn/ui components (Card, Input, Button, Form) — doesn't need to be fancy, just usable
and not broken on mobile.
```

*Test after this phase, don't skip it:* sign up as a fresh user, create a team, submit an idea, refresh and check `/register/status`. Fix anything broken before moving on.

---

## Phase 3 — Admin View (~1.5–2 hrs)

**Goal:** You (as admin) can see every team and submission in one place. This is the other half of your "must-have."

**Prompt for Claude Code:**
```
Build an admin dashboard at app/(admin)/dashboard, protected so only users with role='admin'
in profiles can access it (redirect everyone else to /). Use a Next.js middleware or a
server-side check in a layout.tsx that queries the profiles table.

Build:
1. /dashboard — a table listing all teams: team name, track, member count, submission
   status, submitted idea title, created_at. Sortable by created_at. Use shadcn/ui's Table
   component with a simple client-side search/filter input (filter by team name or track).

2. A row-click or expand action showing full details for that team: all members' names/
   emails/phones, and the full idea_description text.

3. A CSV export button that downloads all registrations as a CSV (team name, track, leader
   name, leader email, leader phone, idea title, submitted date) — this matters for me
   printing name badges or contacting teams later.

Fetch data server-side (Server Component), not client-side, since this is admin-only data
and I want it protected by the server render, not just hidden UI.
```

*Test after this phase:* log in as your admin account, confirm you see the test data from Phase 2, confirm CSV export downloads and opens correctly.

---

## Phase 4 — Polish + Deploy (~1 hr, end of Day 1)

**Prompt for Claude Code:**
```
Do a pass over the registration and admin flows for:
1. Proper error boundaries / not-found pages
2. Loading states (loading.tsx) for the admin dashboard table
3. A basic responsive check — make sure the register forms and admin table don't break
   on a 375px-wide mobile viewport
4. A simple root page (/) that just says what event this is and links to /register/signup
   or /register/status if already logged in

Then walk me through anything I need to set as environment variables on Vercel before
deploying (I'll do the actual Vercel dashboard steps myself).
```

*You do manually:* set env vars on Vercel, deploy, do one full end-to-end signup→submit→admin-view test on the live URL, not just localhost.

**At this point you have a working, deployed registration + admin system. If you're out of time, stop here — this is a complete, usable product on its own.**

---

## Stretch Phase 5 — Judging (only if Day 2 morning is ahead of schedule)

Do NOT start this unless registration is fully working and deployed. Simplify judging drastically for the time budget — skip multi-round, weighted criteria, and judge assignment logic. Single round, single overall score + comments, all judges see all submissions.

**Prompt for Claude Code:**
```
Add a minimal judging feature:
1. Extend profiles.role to also allow 'judge'
2. Add table: evaluations (id, judge_id references profiles, registration_id references
   registrations, score numeric check (score between 0 and 10), comments text, created_at,
   unique(judge_id, registration_id))
3. RLS: judges can insert/update only their own evaluations; can select all registrations
   (read-only) but not team member PII (just idea_title, idea_description, team name)
4. Build /judge route: list of submissions with a score input (0-10) and comments textarea
   per submission, saving via server action, showing which ones they've already scored
5. Add an aggregated average-score column to the admin dashboard table from Phase 3,
   sorted highest first
```

---

## Stretch Phase 6 — Logistics/QR (only if everything above is done and stable)

Given the time budget, this is very unlikely to be reached for a 2-day solo build — treat it as v2. If you do attempt it, keep it to a single meal-token type (not per-day/per-meal variants) to fit the remaining time.

**Prompt for Claude Code:**
```
Add a minimal QR-based check-in:
1. Table: event_tokens (id, user_id references profiles, qr_payload text unique
   default gen_random_uuid()::text, redeemed boolean default false, redeemed_at timestamptz)
   Auto-create one row per profile via trigger on profiles insert.
2. A /register/status page addition showing their QR code (use the `qrcode` npm package
   to render qr_payload as an SVG/image)
3. A /volunteer/scan route (role-gated, reuse the judge/admin role pattern with a new
   'volunteer' role) using a browser QR scanner library, calling a Postgres RPC function
   that atomically checks and sets redeemed=true (SECURITY DEFINER, using
   `UPDATE ... WHERE redeemed = false RETURNING *` so concurrent scans can't double-redeem),
   showing a green "OK" or red "already used" result.
```

---

## Order of operations reminder for Day 1 / Day 2

| When | Do |
|---|---|
| Day 1 morning | Phase 0 → Phase 1 |
| Day 1 afternoon | Phase 2 (the big one — don't rush this) |
| Day 1 evening | Phase 3 → Phase 4 → deploy, test live |
| Day 2 morning | Buffer for fixing whatever broke on live deploy; only start Phase 5 if Day 1 finished with time to spare |
| Day 2 afternoon | Phase 5 if started; otherwise use remaining time to stress-test registration flow and fix edge cases (duplicate team names, empty submissions, etc.) |
