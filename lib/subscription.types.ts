import type { League } from "@/lib/types";

/**
 * Subscription types shared by server and client code.
 *
 * Kept out of lib/subscription.ts because that module is `server-only`:
 * client components (pricing, account billing) need these shapes without
 * pulling the gate itself into the browser bundle.
 */

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled";

export type SubscriptionPlan = "monthly" | "annual";

export type MemberAccess = {
  /** Has a Supabase session. */
  signedIn: boolean;
  /** May see picks, streaks and member-only pages. */
  isMember: boolean;
  /** Why access was granted (or "none"). Useful in admin views and logs. */
  reason: "paywall_off" | "staff" | "comp" | "subscription" | "none";
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  /** End of the paid period — also the access cutoff after a cancel. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isComp: boolean;
  stripeCustomerId: string | null;
  /** Leagues this member wants streak alerts for. */
  alertLeagues: League[];
};
