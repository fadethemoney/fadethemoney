import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type Role = "customer" | "admin" | "super_admin";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  email_opt_in: boolean;
  created_at: string;
};

/**
 * True once the Supabase env vars are present. When false the app runs in
 * "mock mode": the guards below short-circuit so the UI stays reviewable
 * locally without a real project wired in.
 */
const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Stand-in profile returned by the require* guards only in mock mode. */
const MOCK_PROFILE: Profile = {
  id: "mock-user",
  email: "demo@fadethemoney.com",
  name: "Demo Admin",
  role: "super_admin",
  email_opt_in: true,
  created_at: "",
};

/** Emails treated as super admins (env-pinned bootstrap). */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

/** The authenticated auth.users record, or null. */
export async function getSessionUser() {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current user's profile row, or null. */
export async function getProfile(): Promise<Profile | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, name, role, email_opt_in, created_at")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
}

export async function requireUser() {
  if (!SUPABASE_CONFIGURED) return;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<Profile> {
  if (!SUPABASE_CONFIGURED) return MOCK_PROFILE;
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    redirect("/");
  }
  return profile;
}

export async function requireSuperAdmin(): Promise<Profile> {
  if (!SUPABASE_CONFIGURED) return MOCK_PROFILE;
  const profile = await getProfile();
  if (!profile || profile.role !== "super_admin") {
    redirect("/");
  }
  return profile;
}

/**
 * Bootstrap: if an env-allowlisted email signs in, ensure their DB role is
 * super_admin so RLS grants admin access. Uses the service-role client and is
 * idempotent (only writes when the row isn't already super_admin).
 */
export async function syncSuperAdmin(userId: string, email: string) {
  if (!SUPABASE_CONFIGURED) return;
  if (!isSuperAdminEmail(email)) return;
  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", userId)
    .neq("role", "super_admin");
}
