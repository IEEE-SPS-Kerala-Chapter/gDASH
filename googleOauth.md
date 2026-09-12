# Google OAuth Setup — Team Leader Email Verification

The app code for this is already built and pushed (leader sign-in gate,
`/auth/callback` route, session-verified email locked into the registration
form). It won't work yet because the OAuth credentials aren't configured —
this doc is the setup needed to turn it on. **Not required until you decide
to enable leader email verification.**

Until these steps are done, visiting `/register` will show a "Continue with
Google" button that fails, since Google isn't registered as a provider yet.

---

## 1. Google Cloud Console

1. Go to **console.cloud.google.com** → create a project (or use an existing
   one) → search **"Google Auth Platform"** in the top search bar.
2. **Branding** tab: fill in app name (e.g. "gIGNITE"), support email. This
   is just basic info — not a sensitive-scope verification, so no Google
   review is triggered.
3. **Audience** tab: set to **"External"**. You can leave it in "Testing" or
   push to "In production" — since the app only requests `email`/`profile`
   (non-sensitive scopes), publishing doesn't trigger any review or the
   100-user cap that applies to unverified apps using sensitive scopes.
4. **Clients** tab → **Create Client** → Application type: **Web
   application**.
5. Under **Authorized redirect URIs**, add exactly:
   ```
   https://fgchziqxtpxccehkeawe.supabase.co/auth/v1/callback
   ```
6. Save, then copy the **Client ID** and **Client Secret** it gives you.

## 2. Supabase Dashboard

1. Go to the project → **Authentication** → **Providers** → find **Google**
   → toggle it on.
2. Paste the Client ID and Client Secret from above → **Save**.
3. Still in Authentication, go to **URL Configuration**:
   - **Site URL**: `http://localhost:3000` for local dev — update to the
     real production domain once deployed.
   - **Redirect URLs**: add `http://localhost:3000/auth/callback` (and the
     production equivalent, e.g. `https://your-domain.com/auth/callback`,
     once deployed).

No `.env.local` or Vercel env var changes are needed — these credentials
live entirely in Supabase's own config, not the app's environment.

## After enabling

Once both are done, go through `/register` in a browser and confirm:
- "Continue with Google" redirects to a real Google sign-in screen
- After approving, you land back on `/register` signed in, with the
  email field in Step 1 showing your Google account's email, read-only
- The "Not you? Sign out" link actually signs you out and returns to the
  sign-in gate

## Why the email field is locked

The leader's email in the form is intentionally read-only — it's seeded
from the verified Google session, not typed in. The Server Action
(`app/actions/registration.ts`) also re-checks the session itself and uses
its email when submitting, ignoring whatever the client posts. Both layers
matter: the read-only field is the UX signal; the server-side check is what
actually prevents a tampered request from claiming an unverified email.
