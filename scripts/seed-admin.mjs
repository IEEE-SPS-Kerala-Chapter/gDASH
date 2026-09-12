// Creates (or updates the password of) one staff account with role='admin',
// reading credentials from .env.local so the password never has to pass
// through anything but your own hands. Run with: npm run seed:admin
//
// Add to .env.local first:
//   SEED_ADMIN_EMAIL=you@example.com
//   SEED_ADMIN_PASSWORD=a real password only you know
//
// Safe to remove those two lines from .env.local again once you've run this.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

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

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
];
const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
const password = env.SEED_ADMIN_PASSWORD;
const fullName = env.SEED_ADMIN_NAME?.trim() || email;

const { data: existingList, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error("Could not list existing users:", listError.message);
  process.exit(1);
}
const existing = existingList.users.find((u) => u.email?.toLowerCase() === email);

if (existing) {
  const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
  if (error) {
    console.error("Could not update password:", error.message);
    process.exit(1);
  }
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
  console.log(`Created new account: ${email} (id: ${data.user.id})`);
}

// Belt and suspenders: make sure this account is actually role='admin'
// regardless of whether it was just created or already existed.
const userId = existing?.id ?? (await supabase.auth.admin.listUsers()).data.users.find(
  (u) => u.email?.toLowerCase() === email,
)?.id;
const { error: roleError } = await supabase
  .from("profiles")
  .update({ role: "admin" })
  .eq("id", userId);
if (roleError) {
  console.error("Account is set up, but couldn't confirm admin role:", roleError.message);
  process.exit(1);
}

console.log("Role confirmed: admin. Sign in at /login with the email above and the password you set.");
