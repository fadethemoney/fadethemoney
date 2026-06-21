"use server";

import { getProfile, type Profile, type Role } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Privileged user-management actions for the admin Users page.
 *
 * These run server-side with the service-role key because the schema gives end
 * users NO client policy for role changes or deletes (see 0001_init.sql): role
 * writes are blocked by a trigger + column grants, and there's no delete policy.
 * Every action re-checks the caller's role here — the UI hiding a button is only
 * UX, this is the real authorization boundary.
 */

type Result = { ok: true } | { ok: false; error: string };

// Roles a super admin may assign. 'super_admin' is env-pinned only (never via UI).
const ASSIGNABLE: Role[] = ["customer", "admin"];

/** Resolve the caller's profile and confirm they're a super admin. */
async function requireSuperAdminProfile(): Promise<{ me: Profile } | { error: string }> {
  const me = await getProfile();
  if (!me) return { error: "You're not signed in." };
  if (me.role !== "super_admin") return { error: "Only a super admin can do that." };
  return { me };
}

export async function setUserRole(userId: string, role: Role): Promise<Result> {
  const guard = await requireSuperAdminProfile();
  if ("error" in guard) return { ok: false, error: guard.error };
  if (!ASSIGNABLE.includes(role)) return { ok: false, error: "That role can't be assigned here." };

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "super_admin") return { ok: false, error: "A super admin's role can't be changed." };

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<Result> {
  const guard = await requireSuperAdminProfile();
  if ("error" in guard) return { ok: false, error: guard.error };
  if (guard.me.id === userId) return { ok: false, error: "You can't delete your own account." };

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "super_admin") return { ok: false, error: "A super admin can't be deleted." };

  // Delete the auth user; profiles cascades via the FK (on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Map of userId → whether their email is verified (auth.users.email_confirmed_at).
 * Read with the service-role admin client because verification status isn't in
 * the profiles table and isn't exposed to the browser. Any admin may read it.
 * Returns {} on any failure so the Users list still renders.
 */
export async function getVerifiedMap(): Promise<Record<string, boolean>> {
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) return {};

  const admin = createSupabaseAdminClient();
  const map: Record<string, boolean> = {};
  try {
    const perPage = 1000;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error || !data) break;
      for (const u of data.users) {
        map[u.id] = !!(u.email_confirmed_at ?? u.confirmed_at);
      }
      if (data.users.length < perPage) break;
    }
  } catch (e) {
    console.error("[getVerifiedMap] failed:", e instanceof Error ? e.message : e);
  }
  return map;
}

export async function setOptIn(userId: string, optIn: boolean): Promise<Result> {
  // Email opt-in is lower-risk than roles/deletes, so any admin may change it.
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Not authorized." };
  }
  const admin = createSupabaseAdminClient();
  // A regular admin must not change a super admin's opt-in (mirrors the
  // super_admin guards on setUserRole/deleteUser).
  const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "super_admin" && me.role !== "super_admin") {
    return { ok: false, error: "Not authorized." };
  }
  const { error } = await admin.from("profiles").update({ email_opt_in: optIn }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
