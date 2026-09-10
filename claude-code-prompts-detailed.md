# Claude Code Prompts — Detailed / High-Precision Version

More specific versions of each phase prompt — exact validation rules, file paths, error handling,
and edge cases spelled out so Claude Code has less room to guess wrong. A few reasonable defaults
are assumed below (marked with 📌) — edit the number/rule inline before pasting if you want something
different; don't feel locked into them.

---

## Phase 0 — Project Setup

```
Set up a new Next.js 14 project using the App Router, TypeScript (strict mode), and
Tailwind CSS. Install and initialize shadcn/ui with the "new-york" style and slate base color.
Install @supabase/supabase-js and @supabase/ssr (the current supported package for Next.js
App Router — do not use the deprecated auth-helpers-nextjs package).

Create these exact files:
- lib/supabase/client.ts — browser client using createBrowserClient
- lib/supabase/server.ts — server client using createServerClient with cookies() from
  next/headers, exporting an async function so it can be awaited in Server Components
  and Server Actions
- middleware.ts — session refresh middleware following Supabase's official Next.js
  App Router pattern, matching all routes except static assets and /api

Add .env.local.example with:
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
Add .env.local to .gitignore if it isn't already.

Folder structure to create (empty placeholder pages are fine for now):
  app/(public)/register/signup/page.tsx
  app/(public)/register/team/page.tsx
  app/(public)/register/submit/page.tsx
  app/(public)/register/status/page.tsx
  app/(admin)/dashboard/page.tsx
  app/actions/ — for Server Actions, one file per domain (auth.ts, team.ts, registration.ts)
  lib/validations/ — for Zod schemas, one file per domain
  components/ui/ — shadcn components live here by default, leave as-is

Install sonner for toast notifications and wire up the <Toaster /> in the root layout.

Confirm `npm run build` succeeds with zero TypeScript errors before finishing. Show me the
final folder tree.
```

---

## Phase 1 — Schema + RLS

```
Create a Supabase migration file via `supabase migration new init_schema` with the following,
written as idempotent SQL (use `create table if not exists`, `drop policy if exists` before
each create policy, etc., so I can safely re-run it while iterating):

TABLES:

profiles
  id uuid primary key references auth.users(id) on delete cascade
  full_name text not null
  email text not null unique
  phone text not null
  role text not null default 'participant' check (role in ('participant','admin','judge','volunteer'))
  created_at timestamptz not null default now()

teams
  id uuid primary key default gen_random_uuid()
  name text not null unique                      -- 📌 team names must be unique; enforce at DB level, not just UI
  track text not null
  status text not null default 'active' check (status in ('active','disqualified','withdrawn'))
  created_at timestamptz not null default now()

team_members
  team_id uuid not null references teams(id) on delete cascade
  user_id uuid not null references profiles(id) on delete cascade
  is_leader boolean not null default false
  joined_at timestamptz not null default now()
  primary key (team_id, user_id)
  -- 📌 add a partial unique index ensuring a user_id appears in at most one active team's
  --    team_members row (a participant can't be on two teams at once) — implement this as
  --    a unique index on user_id across the whole table for simplicity, since teams are 1:1
  --    with participants in this event

registrations
  id uuid primary key default gen_random_uuid()
  team_id uuid not null unique references teams(id) on delete cascade   -- one registration per team
  idea_title text not null check (char_length(idea_title) between 5 and 120)
  idea_description text not null check (char_length(idea_description) between 50 and 3000)
  status text not null default 'submitted' check (status in ('submitted','under_review','shortlisted','rejected'))
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

FUNCTIONS:
- is_admin() returns boolean, security definer, checking auth.uid() against profiles.role = 'admin'
- handle_new_user() trigger function that inserts a profiles row on auth.users insert,
  pulling full_name/phone from raw_user_meta_data (I'll pass these as signUp options.data),
  and email directly from the new row. Attach as an AFTER INSERT trigger on auth.users.
- set_updated_at() trigger function (generic, reusable) that sets NEW.updated_at = now(),
  attached as a BEFORE UPDATE trigger on registrations

RLS — enable on all four tables. Policies:

profiles:
  - select: user can see own row OR is_admin()
  - update: user can update own row only, and only full_name/phone (not role or email) —
    enforce the role/email immutability via a BEFORE UPDATE trigger that raises an exception
    if OLD.role != NEW.role or OLD.email != NEW.email, rather than relying on column-level
    grants (simpler to reason about for this size of project)

teams:
  - select: user is a member (via team_members) OR is_admin()
  - insert: any authenticated user
  - update: only is_admin() (participants shouldn't be able to rename their team after
    creation without going through you)

team_members:
  - select: user is a member of that team OR is_admin()
  - insert: authenticated user inserting a row with their own user_id only (with check
    (user_id = auth.uid()))
  - delete: not needed for MVP, skip

registrations:
  - select: user is a member of the team OR is_admin()
  - insert: user is a member of the team, with check (exists (...))
  - update: user is a member of the team AND registrations.status = 'submitted' (so they
    can edit before review starts, but not after status changes) OR is_admin()

Give me the complete migration SQL. After showing it to me, also give me a short list of
manual test queries I should run in the Supabase SQL editor to verify RLS is actually
blocking cross-team access (e.g. logged in as user A, confirm a select on team B's
registration returns zero rows).
```

---

## Phase 2 — Registration Flow

```
Build the full participant registration flow. Use Server Actions in app/actions/ for every
mutation — no client-side supabase.from().insert() calls anywhere in this phase.

### lib/validations/auth.ts
Zod schema `signUpSchema`:
  full_name: string, min 2, max 80
  email: string, valid email format
  phone: string, regex allowing optional country code + 10 digits, e.g. /^\+?[0-9]{10,13}$/
  password: string, min 8, must contain at least one letter and one number
    (regex: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/), with a clear error message stating the rule

### app/(public)/register/signup/page.tsx
- Form using react-hook-form + zodResolver(signUpSchema), shadcn Form/Input/Button components
- On submit, call a Server Action `signUp(formData)` in app/actions/auth.ts that:
  - calls supabase.auth.signUp({ email, password, options: { data: { full_name, phone },
    emailRedirectTo: `${origin}/register/team` } })
  - on error, return a typed { error: string } result — surface Supabase's actual error
    message for common cases (email already registered → "An account with this email
    already exists — try logging in instead" with a link to a /register/login page you
    should also create with a minimal email+password login form)
  - on success, return { success: true }
- After successful signup, show a confirmation screen: "Check your email to confirm your
  account, then come back here to continue." 📌 Assume email confirmation is ON by default
  in Supabase — do not disable it in code; that's a dashboard setting I'll manage separately.

### lib/validations/team.ts
Zod schemas:
  createTeamSchema: { name: string min 3 max 50, track: enum of your actual track names —
    ask me for the list if I haven't given it to you, don't invent placeholder tracks }
  joinTeamSchema: { teamName: string min 3 max 50 }

### app/(public)/register/team/page.tsx
- Must redirect to /register/login if no active session (check server-side in the page,
  not just client-side)
- If the user already belongs to a team (query team_members), redirect straight to
  /register/submit
- Two tabs or toggle: "Create a team" / "Join a team"
- Create: on submit, Server Action `createTeam(data)` in app/actions/team.ts that:
  1. Inserts into teams
  2. Inserts into team_members with is_leader = true
  3. Wrap both in error handling — if the insert into teams fails because the name is
     already taken (unique constraint violation, Postgres error code 23505), return a
     specific error "That team name is taken — try another" rather than a generic DB error
  4. On success, redirect to /register/submit
- Join: Server Action `joinTeam(teamName)` that:
  1. Looks up the team by exact name (case-insensitive match using ilike)
  2. If not found, return error "No team found with that name — check the spelling with
     your team leader"
  3. If found, insert into team_members with is_leader = false
  4. Handle the case where this user is already in a different team (should be prevented
     by the unique index from Phase 1 — catch that constraint violation and show "You're
     already on a team" rather than a raw DB error)
  5. On success, redirect to /register/submit

### lib/validations/registration.ts
Zod schema `registrationSchema`:
  idea_title: string min 5 max 120
  idea_description: string min 50 max 3000
  (mirror the DB check constraints exactly so client and server agree)

### app/(public)/register/submit/page.tsx
- Redirect to /register/team if the user has no team yet
- If a registrations row already exists for their team, pre-fill the form with existing
  values (edit mode) instead of showing it empty — use the update path of the Server Action
- Show a live character counter under the idea_description textarea (0/3000)
- Server Action `submitRegistration(data)` in app/actions/registration.ts:
  - Upserts (insert or update) based on whether a registrations row already exists for
    team_id
  - On success, redirect to /register/status with a success toast via sonner

### app/(public)/register/status/page.tsx
- Server Component, fetch team + team_members + registration in one query using Supabase's
  nested select syntax
- Show: team name, track, list of members (name + who's the leader), and the submitted idea
  title/description if present, or a prompt to submit if not
- If registration status is 'shortlisted' or 'rejected', show that status clearly with
  appropriate styling (don't just show "submitted" once it's changed)

Show me each file's full content as you create it, not just a summary.
```

---

## Phase 3 — Admin View

```
Build the admin dashboard, protected end-to-end.

### Protection
Create app/(admin)/layout.tsx as an async Server Component that:
  1. Gets the current user via supabase.auth.getUser()
  2. If no user, redirect('/register/login')
  3. Queries profiles for role; if role !== 'admin', redirect('/') — do this check here,
     not just in middleware, since RLS is the real backstop but this gives a clean UX
     redirect instead of an empty/broken page

### app/(admin)/dashboard/page.tsx
Server Component. Query all teams with a nested select pulling team_members (joined to
profiles for name/email/phone) and the registrations row, in one Supabase query.

Render a shadcn Table with columns:
  Team name | Track | # Members | Leader name | Status | Idea title | Submitted at

- Status column shows a colored Badge (submitted = default, shortlisted = green,
  rejected = red, under_review = yellow)
- Sortable by "Submitted at" (default newest first) — implement as a client component
  wrapping the table since sorting needs interactivity; pass the server-fetched data down
  as props rather than re-fetching client-side
- A search Input above the table filtering client-side by team name or track (case-insensitive
  substring match) — no need for server-side search at this data volume

### Row detail
Clicking a row opens a shadcn Sheet (slide-over panel) showing:
  - All team members: name, email, phone, leader flag
  - Full idea_description (not truncated)
  - A dropdown to change registrations.status (submitted/under_review/shortlisted/rejected),
    calling a new Server Action `updateRegistrationStatus(registrationId, status)` in
    app/actions/registration.ts, admin-only (double check role server-side inside the
    action itself too, don't rely only on the page-level redirect)

### CSV export
A "Export CSV" button above the table. Server Action `exportRegistrationsCsv()` that:
  - Queries all teams/members/registrations
  - Builds CSV with columns: Team Name, Track, Leader Name, Leader Email, Leader Phone,
    All Member Names (semicolon-separated), Idea Title, Status, Submitted At
  - Returns the CSV as a string; trigger the download client-side by creating a Blob and
    an anchor click (standard pattern) rather than a dedicated API route, to keep this
    server-action-only per the rest of the app
  - Filename: `registrations-${today's date in YYYY-MM-DD}.csv`

Confirm the whole dashboard still works if there are zero teams yet (empty state message,
not a crash).
```

---

## Phase 4 — Polish + Deploy

```
Do a full pass for production-readiness:

1. Error handling:
   - app/error.tsx (global error boundary) with a friendly "Something went wrong" message
     and a "Try again" button
   - app/not-found.tsx for 404s
   - Each async page that queries Supabase should handle the query error case explicitly
     (not just assume data is always returned) and show a fallback UI, not crash

2. Loading states:
   - app/(admin)/dashboard/loading.tsx — a skeleton table (shadcn Skeleton components
     matching the table shape) while the Server Component data fetch resolves
   - Loading spinners on all form submit buttons (disable the button + show a spinner icon
     while the Server Action is in flight) — check every form from Phase 2 has this

3. Responsive check:
   - Test all /register/* pages and the admin dashboard at 375px width
   - The admin table specifically: on mobile, either horizontal-scroll the table
     (overflow-x-auto wrapper) or collapse to a card-per-row layout — pick horizontal
     scroll for now, it's less work and admins will likely view this on a laptop anyway

4. Root page (app/page.tsx):
   - Simple landing page: event name (📌 placeholder "AI Hackathon 2026" — I'll swap the
     real name in), one paragraph description, a primary CTA button
   - Server-side check: if there's an active session, change the CTA to "Go to your
     registration status" linking to /register/status instead of /register/signup

5. Basic security pass before deploy:
   - Grep the codebase for any use of SUPABASE_SERVICE_ROLE_KEY and confirm it's never
     imported into a file under app/(public)/ or any 'use client' component — it should
     only ever appear in server-only contexts, if it's used at all (for this app, we
     likely don't need the service role key anywhere since RLS handles everything)
   - Confirm .env.local is gitignored and not committed
   - Confirm every Server Action that mutates data re-validates input with Zod
     server-side, not just trusting the client already validated it

After this, list every environment variable I need to set in the Vercel dashboard, and
tell me the exact Site URL / Redirect URL settings I need to configure in the Supabase
Auth dashboard (URL Configuration section) so email confirmation links work on the deployed
domain, not localhost.
```

---

## Stretch Phase 5 — Judging (detailed)

```
Add judging on top of the existing schema without touching the registration flow.

Migration additions:
  - Update the profiles role check constraint to also allow 'judge'
  - evaluations table:
      id uuid pk default gen_random_uuid()
      judge_id uuid not null references profiles(id)
      registration_id uuid not null references registrations(id) on delete cascade
      score numeric not null check (score >= 0 and score <= 10)
      comments text
      created_at timestamptz not null default now()
      updated_at timestamptz not null default now()
      unique (judge_id, registration_id)
  - RLS: judges can insert/select/update only their own evaluations (judge_id = auth.uid());
    judges can select registrations (idea_title, idea_description, team name only — do NOT
    let the judge policy also grant access to team_members PII, keep that select scoped
    narrowly to what judging needs)

Build /judge/page.tsx (protected: role must be 'judge' or 'admin', same layout pattern as
the admin route):
  - List all registrations with status != 'rejected' (📌 assumption: rejected ideas are
    excluded from judging queue — adjust if you want judges to see everything)
  - Each row expands to show idea_title + idea_description + a score input (0-10, step 0.5)
    + comments textarea + save button
  - Visually mark which ones this judge has already scored (checkmark or filled badge) vs
    not yet scored, using their own evaluations rows
  - Server Action `submitEvaluation(registrationId, score, comments)` upserting into
    evaluations scoped to auth.uid() as judge_id

Update the admin dashboard (Phase 3) to add an "Avg Score" column: for each registration,
compute avg(evaluations.score) and count of judges who've scored it (e.g. "7.5 (3 judges)"),
sortable, so I can sort by average score to find top submissions. Do this as a Postgres
view (evaluation_summary) rather than computing it in JS, so the admin query stays a single
efficient select.
```

---

## Stretch Phase 6 — Logistics / QR Check-in (detailed)

```
Add a single-token QR check-in system (not per-meal-type — just one "checked in" token per
participant, since we're short on time). Build only after Phases 0-4 are deployed and stable.

Migration:
  - Update profiles role check constraint to also allow 'volunteer'
  - event_tokens table:
      id uuid pk default gen_random_uuid()
      user_id uuid not null unique references profiles(id) on delete cascade
      qr_payload text not null unique default gen_random_uuid()::text
      redeemed boolean not null default false
      redeemed_at timestamptz
      redeemed_by uuid references profiles(id)
  - Trigger: after insert on profiles, auto-create the matching event_tokens row
  - RLS: user can select their own event_tokens row (to display their QR); volunteers/admins
    can select all rows but NOT update directly through the client — updates must go through
    the RPC function below only
  - RPC function `redeem_token(payload text)` — security definer, does:
      UPDATE event_tokens SET redeemed = true, redeemed_at = now(), redeemed_by = auth.uid()
      WHERE qr_payload = payload AND redeemed = false
      RETURNING user_id;
    If zero rows returned, the function should return a clear result indicating
    "not_found_or_already_redeemed" vs a genuine "not_found" (join to check if the payload
    exists at all first, so the volunteer UI can distinguish "invalid QR" from "already
    checked in") — return a small JSON result like { status: 'ok' | 'already_redeemed' |
    'invalid', user_name?: text }

Frontend:
  - Add the participant's QR code to /register/status, rendered via the `qrcode` npm
    package as an SVG, sized to be easily scannable on a phone screen (min 200x200)
  - New /volunteer/scan/page.tsx (role-gated to volunteer/admin): use a browser-based QR
    scanner (@yudiel/react-qr-scanner or similar actively-maintained library — check what's
    current, don't assume a specific version), calling the redeem_token RPC on each scan,
    showing a large full-screen green checkmark + participant name for 'ok', a large red X
    + "Already checked in" for 'already_redeemed', and a red X + "Invalid QR code" for
    'invalid' — this needs to be readable at a glance in a busy check-in line, so keep the
    result UI big and high-contrast, and auto-clear back to scanning mode after ~2 seconds
```
