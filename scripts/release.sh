#!/usr/bin/env bash
#
# Release gIGNITE to pre-prod or production.
#
#   scripts/release.sh staging      # both pre-prod sites (dev database)
#   scripts/release.sh production   # live registration site (production database)
#
# The cycle: work on the `staging` branch → `release.sh staging` → testers
# check pre-prod → once approved, merge `staging` into `main`, push, apply
# any new migration to production → `release.sh production` → the web team
# redeploys the live staff project (g-dash) from `main`.
#
# Every deploy uploads exactly the committed code of the current branch
# (`git archive HEAD`) from a temporary folder — never uncommitted edits,
# never any .env file (including .env.production), never local .vercel links.
#
# Sites:
#   pre-prod registration  gignite-staging-register  (dev DB)   staging-gignite.ieeespskc.in
#   pre-prod staff         gignite-staging-staff     (dev DB)   staging-gdash.ieeespskc.in
#   live registration      gdash                     (prod DB)  gignite-register.ieeespskc.in
#   live staff             g-dash (web team's account, redeployed by them from `main`)

set -euo pipefail

DEV_REF="fgchziqxtpxccehkeawe"
PROD_REF="xekitmuyvfojnmxhvvgt"
VERCEL=(npx -y vercel@latest)

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

target="${1:-}"
if [[ "$target" != "staging" && "$target" != "production" ]]; then
  echo "Usage: scripts/release.sh staging|production" >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
commit="$(git rev-parse --short HEAD)"

fail() { echo "✗ $*" >&2; exit 1; }
say() { echo "→ $*"; }

# Deploys the committed tree to a Vercel project; prints the deployment URL.
deploy_project() {
  local project="$1" tmp out url
  tmp="$(mktemp -d)"
  git archive --format=tar HEAD | tar -x -C "$tmp"
  (
    cd "$tmp"
    "${VERCEL[@]}" link --yes --project "$project" >/dev/null 2>&1 || fail "could not link $project"
    for attempt in 1 2 3; do
      if out="$("${VERCEL[@]}" deploy --prod --yes 2>&1)" && grep -q '"status": "ok"' <<<"$out"; then
        url="$(grep -oE '"url": "https://[^"]+' <<<"$out" | head -1 | sed 's/"url": "//')"
        echo "$url"
        exit 0
      fi
      echo "  deploy attempt $attempt for $project failed, retrying…" >&2
      sleep 5
    done
    fail "deploy of $project failed: $(grep -m1 -iE 'error|message' <<<"$out")"
  )
  rm -rf "$tmp"
}

# Which Supabase project a public site's page code points at.
site_database() {
  local site="$1" html
  html="$(curl -sL --max-time 30 "$site/")"
  for js in $(grep -oE '/_next/static/chunks/[^"]+\.js' <<<"$html" | sort -u); do
    curl -s --max-time 15 "$site$js"
  done | grep -oE '[a-z0-9]{20}\.supabase\.co' | sort -u | head -1 | cut -d. -f1
}

if [[ "$target" == "staging" ]]; then
  [[ "$branch" == "staging" ]] || fail "pre-prod releases come from the 'staging' branch (you're on '$branch'). Run: git checkout staging"
  if ! git diff --quiet HEAD -- . ':(exclude).gitignore'; then
    echo "  note: you have uncommitted changes — they are NOT included; only commit $commit is deployed."
  fi
  echo "Releasing $commit to PRE-PROD (dev database)"
  echo "  reminder: apply any new migration in supabase/migrations/ to the DEV project first (SQL Editor)."

  say "registration pre-prod (gignite-staging-register)…"
  reg_url="$(deploy_project gignite-staging-register)"
  say "staff pre-prod (gignite-staging-staff)…"
  staff_url="$(deploy_project gignite-staging-staff)"

  sleep 5
  db="$(site_database https://gignite-staging-register.vercel.app)"
  [[ "$db" == "$DEV_REF" ]] || fail "registration pre-prod uses '$db', expected the dev database ($DEV_REF)"
  curl -s --max-time 20 https://gignite-staging-staff.vercel.app/ | grep -q "Staff" || fail "staff pre-prod sign-in page didn't load"

  echo
  echo "✓ Pre-prod updated to $commit (dev database confirmed)"
  echo "  registration: https://staging-gignite.ieeespskc.in  (also https://gignite-staging-register.vercel.app)"
  echo "  staff:        https://staging-gdash.ieeespskc.in   (also https://gignite-staging-staff.vercel.app)"
  echo "  deployments:  $reg_url  |  $staff_url"
  exit 0
fi

# ---------------------------------------------------------------- production
[[ "$branch" == "main" ]] || fail "production releases come from 'main' (you're on '$branch'). Merge the approved 'staging' into 'main' first."
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "local main ($commit) isn't the same as origin/main — push or pull first, so the web team's g-dash builds the same code."

linked="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [[ "$linked" == "$PROD_REF" ]]; then
  pending="$(npx -y supabase migration list </dev/null 2>/dev/null | grep -oE '"local":"[0-9]+","remote":""' || true)"
  [[ -z "$pending" ]] || fail "production is missing migrations: $pending — run 'npx supabase db push --dry-run' then 'npx supabase db push' first."
  say "production database has every migration"
else
  echo "  warning: Supabase CLI isn't linked to production ($PROD_REF); couldn't check migrations."
fi

echo "Releasing $commit to PRODUCTION"
say "live registration site (gdash)…"
prod_url="$(deploy_project gdash)"

sleep 5
db="$(site_database https://gignite-register.ieeespskc.in)"
[[ "$db" == "$PROD_REF" ]] || fail "live registration site uses '$db', expected production ($PROD_REF)"

echo
echo "✓ Live registration site updated to $commit (production database confirmed): $prod_url"
echo
echo "Send the web team:"
echo "  Please redeploy the g-dash project from the latest main (commit $commit), with 'Use existing build cache' unticked."
