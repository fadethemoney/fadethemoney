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
 * NOTE for Phase 3 (paywall): tips are meant to become paid content. When the
 * subscription gate ships, this should switch to a per-user check instead of a
 * blanket public read. Fine for the demo / pre-launch.
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
