import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { League } from "@/lib/types";

/**
 * Phase 3 — who gets a streak alert.
 *
 * Replaces the hardcoded ADMIN_EMAIL pair with the real member list:
 * anyone with paid access (or a comp/staff account) who still has this
 * league switched on. ADMIN_EMAIL addresses stay in as the owner copy, so
 * the client keeps receiving everything regardless of subscription state.
 */

export type AlertRecipient = {
  /** Null for env-configured owner addresses, which have no profile row. */
  userId: string | null;
  email: string;
};

/** Statuses that still receive alerts — same grace rule as the paywall. */
const PAID_STATUSES = ["trialing", "active", "past_due"];

/** Owner addresses from ADMIN_EMAIL — always copied, never unsubscribed. */
function ownerRecipients(): AlertRecipient[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ userId: null, email }));
}

/**
 * Members subscribed to `league`, plus the owner addresses.
 *
 * Never throws: an alert going to the owners only is far better than a
 * database hiccup killing the send inside the refresh pipeline.
 */
export async function getAlertRecipients(league: League): Promise<AlertRecipient[]> {
  const owners = ownerRecipients();
  const byEmail = new Map<string, AlertRecipient>();
  for (const o of owners) byEmail.set(o.email.toLowerCase(), o);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [...byEmail.values()];
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, email_opt_in, is_comp, role, subscription_status, alert_leagues")
      // `contains` maps to the array @> operator: this league is in their list.
      .contains("alert_leagues", [league])
      .eq("email_opt_in", true);

    if (error) {
      console.error("[alerts] recipient query failed:", error.message);
      return [...byEmail.values()];
    }

    for (const row of data ?? []) {
      const email = (row.email as string | null)?.trim();
      if (!email) continue;
      const entitled =
        row.is_comp === true ||
        row.role === "admin" ||
        row.role === "super_admin" ||
        PAID_STATUSES.includes(row.subscription_status as string);
      if (!entitled) continue;
      // Owner addresses win: they keep userId null so their copy carries no
      // unsubscribe token they could accidentally trip.
      const key = email.toLowerCase();
      if (byEmail.has(key)) continue;
      byEmail.set(key, { userId: row.id as string, email });
    }
  } catch (e) {
    console.error("[alerts] recipient lookup threw:", (e as Error).message);
  }

  return [...byEmail.values()];
}
