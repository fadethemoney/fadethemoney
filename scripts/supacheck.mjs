// Throwaway connectivity check: reads .env.local, connects with the secret key,
// and calls an admin endpoint to confirm URL + keys are valid.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL:", url);
console.log("secret key prefix:", secret?.slice(0, 12) + "…");

const supa = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supa.auth.admin.listUsers();
if (error) {
  console.log("CONNECT ERROR:", error.message);
  process.exit(1);
}
console.log("OK — connected to Supabase. Existing auth users:", data.users.length);

// List profiles + their roles (service-role bypasses RLS).
const { data: profiles, error: tblErr } = await supa
  .from("profiles")
  .select("email, role, created_at")
  .order("created_at", { ascending: true });
if (tblErr) {
  console.log(`profiles table: NOT created (${tblErr.message}) — run the SQL migration`);
} else {
  console.log(`\nprofiles (${profiles.length}):`);
  for (const p of profiles) console.log(`  ${p.role.padEnd(12)} ${p.email}`);
}
