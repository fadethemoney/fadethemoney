import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ActiveTip = {
  id: string;
  title: string;
  teamPick: string;
  message: string;
};

const CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Active tips for the public announcement bar. Read server-side with the
 * service-role client so the bar shows to ALL visitors (the notifications RLS
 * only grants reads to signed-in users; public dashboard visitors are anon).
 *
 * Entitlement is checked by the caller, not here: app/layout.tsx only calls
 * this once getMemberAccess() says the visitor is a member (Phase 3), so the
 * service-role read below never reaches a non-member's page.
 *
 * Always returns an array and never throws, so the root layout can't crash if
 * the DB is unreachable or env is missing.
 */
export async function getActiveNotifications(): Promise<ActiveTip[]> {
  if (!CONFIGURED) return [];
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .select("id, title, team_pick, message")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      teamPick: r.team_pick as string,
      message: (r.message as string) ?? "",
    }));
  } catch {
    return [];
  }
}
