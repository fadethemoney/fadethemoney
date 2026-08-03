import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { League } from "@/lib/types";
import type {
  MemberAccess,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/lib/subscription.types";

export type { MemberAccess, SubscriptionPlan, SubscriptionStatus };

/**
 * Phase 3 — member access gate.
 *
 * The single source of truth for "may this visitor see picks and streaks?".
 * Everything that renders paid content asks this module; nothing decides on
 * its own. Subscription state itself is written only by the server (Stripe
 * webhook + nightly reconcile via the service-role key) — see migration
 * 0006_subscriptions.sql, where the client-facing column grants deliberately
 * omit every field read here.
 */

/** Statuses that keep the dashboard unlocked.
 *
 * `past_due` is intentionally included: when a renewal charge fails Stripe
 * runs smart retries for a few days before we pause the account. Cutting
 * access on the first failed attempt punishes an expired card, so the grace
 * window stays open until the webhook moves the row to `paused`.
 */
const ACTIVE_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"];

export const ALL_ALERT_LEAGUES: League[] = [
  "nba",
  "wnba",
  "mlb",
  "nfl",
  "nhl",
  "ncaab",
  "ncaaf",
];

const LOCKED_OUT: MemberAccess = {
  signedIn: false,
  isMember: false,
  reason: "none",
  status: "none",
  plan: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  isComp: false,
  stripeCustomerId: null,
  alertLeagues: ALL_ALERT_LEAGUES,
};

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Master switch. The paywall stays OFF until this is explicitly turned on,
 * so shipping the gate mid-build never locks the live demo site before
 * checkout exists to sell a way in. Flip to "true" in .env.local to test,
 * and in Vercel on launch day.
 */
export function paywallEnabled(): boolean {
  const v = (process.env.PAYWALL_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

function unlocked(reason: MemberAccess["reason"]): MemberAccess {
  return { ...LOCKED_OUT, signedIn: reason !== "paywall_off", isMember: true, reason };
}

type ProfileRow = {
  role: string | null;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_plan: SubscriptionPlan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  is_comp: boolean | null;
  alert_leagues: League[] | null;
};

/**
 * Resolve the current visitor's access. Safe to call from any Server
 * Component or Route Handler; returns a locked-out record rather than
 * throwing when the visitor is anonymous.
 */
export async function getMemberAccess(): Promise<MemberAccess> {
  if (!paywallEnabled()) return unlocked("paywall_off");
  // Mock mode (no Supabase env): keep the UI reviewable locally, same
  // convention as the require* guards in lib/auth.ts.
  if (!SUPABASE_CONFIGURED) return unlocked("staff");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return LOCKED_OUT;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "role, stripe_customer_id, subscription_status, subscription_plan, current_period_end, cancel_at_period_end, is_comp, alert_leagues",
    )
    .eq("id", user.id)
    .single<ProfileRow>();

  if (error || !data) {
    // Most likely cause: migration 0006 hasn't been run against this project,
    // so the subscription columns don't exist yet. Fail closed for paid
    // content, but re-read the one column that predates 0006 so admins keep
    // their own site — otherwise turning the paywall on before running the
    // migration locks out the people who need to fix it.
    console.error(
      "[subscription] profile read failed — has 0006_subscriptions.sql been run?",
      error?.message,
    );
    const { data: fallback } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string | null }>();
    const staff = fallback?.role === "admin" || fallback?.role === "super_admin";
    return { ...LOCKED_OUT, signedIn: true, isMember: staff, reason: staff ? "staff" : "none" };
  }

  const status: SubscriptionStatus = data.subscription_status ?? "none";
  const base: MemberAccess = {
    signedIn: true,
    isMember: false,
    reason: "none",
    status,
    plan: data.subscription_plan ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
    isComp: data.is_comp ?? false,
    stripeCustomerId: data.stripe_customer_id ?? null,
    alertLeagues: data.alert_leagues?.length ? data.alert_leagues : ALL_ALERT_LEAGUES,
  };

  if (data.role === "admin" || data.role === "super_admin") {
    return { ...base, isMember: true, reason: "staff" };
  }
  if (base.isComp) {
    return { ...base, isMember: true, reason: "comp" };
  }
  if (ACTIVE_STATUSES.includes(status)) {
    return { ...base, isMember: true, reason: "subscription" };
  }
  return base;
}

/** Guard for member-only pages: sends non-members to the pricing page. */
export async function requireMember(): Promise<MemberAccess> {
  const access = await getMemberAccess();
  if (!access.isMember) {
    redirect(access.signedIn ? "/pricing" : "/login?next=/pricing");
  }
  return access;
}
