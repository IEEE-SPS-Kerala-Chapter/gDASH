// Creates (or updates the password of) one staff account, reading
// credentials from .env.local so the password never has to pass through
// anything but your own hands. Run with: npm run seed:staff
//
// Add to .env.local first:
//   SEED_STAFF_EMAIL=you@example.com
//   SEED_STAFF_PASSWORD=a real password only you know
//   SEED_STAFF_ROLE=admin        (optional — admin | judge | volunteer, defaults to admin)
//   SEED_STAFF_NAME=Jane Doe     (optional — defaults to the email)
//
// Safe to remove those lines from .env.local again once you've run this.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

const VALID_ROLES = ["admin", "judge", "volunteer"];

function loadEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = { ...loadEnvLocal(), ...process.env };

// Accepts the older SEED_ADMIN_* names too, so a .env.local written before
// this script supported roles other than admin doesn't need editing.
const emailVar = env.SEED_STAFF_EMAIL ?? env.SEED_ADMIN_EMAIL;
const passwordVar = env.SEED_STAFF_PASSWORD ?? env.SEED_ADMIN_PASSWORD;
const nameVar = env.SEED_STAFF_NAME ?? env.SEED_ADMIN_NAME;
const roleVar = env.SEED_STAFF_ROLE ?? env.SEED_ADMIN_ROLE;

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !emailVar || !passwordVar) {
  console.error(
    "Missing required env vars in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, " +
      "SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD",
  );
  process.exit(1);
}

const role = (roleVar || "admin").trim().toLowerCase();
if (!VALID_ROLES.includes(role)) {
  console.error(`SEED_STAFF_ROLE must be one of: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = emailVar.trim().toLowerCase();
const password = passwordVar;
const fullName = nameVar?.trim() || email;

const { data: existingList, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error("Could not list existing users:", listError.message);
  process.exit(1);
}
const existing = existingList.users.find((u) => u.email?.toLowerCase() === email);

let userId;
if (existing) {
  const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
  if (error) {
    console.error("Could not update password:", error.message);
    process.exit(1);
  }
  userId = existing.id;
  console.log(`Updated password for existing account: ${email}`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("Could not create account:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Created new account: ${email} (id: ${userId})`);
}

const { error: roleError } = await supabase
  .from("profiles")
  .update({ role, full_name: fullName, must_reset_password: true })
  .eq("id", userId);
if (roleError) {
  console.error(`Account is set up, but couldn't confirm role='${role}':`, roleError.message);
  process.exit(1);
}

console.log(`Role confirmed: ${role}. Sign in at /login with the email above and the password you set.`);
