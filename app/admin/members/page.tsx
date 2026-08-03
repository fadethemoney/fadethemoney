import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { monthlyValueOf } from "@/lib/plans";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription.types";
import { MemberRow } from "./MemberRow";

export const dynamic = "force-dynamic";

/**
 * Admin → Members. Who is subscribed, who is in trial, who has a payment
 * problem, and what that adds up to per month.
 *
 * Read with the service-role client rather than the caller's session: the
 * numbers must cover every profile, and /admin/layout.tsx has already
 * established that the caller is an admin.
 */

type Row = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  is_comp: boolean;
  subscription_status: SubscriptionStatus | null;
  subscription_plan: SubscriptionPlan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "Free",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
};

const STATUS_CLASS: Partial<Record<SubscriptionStatus, string>> = {
  trialing: "ok",
  active: "ok",
  past_due: "warn",
  paused: "warn",
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function MembersPage() {
  const me = await getProfile();
  const isSuper = me?.role === "super_admin";

  let rows: Row[] = [];
  let loadError: string | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, name, email, role, is_comp, subscription_status, subscription_plan, current_period_end, cancel_at_period_end, stripe_customer_id, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Row[];
  } catch (e) {
    // Most likely 0006 hasn't been applied to this project yet.
    loadError = (e as Error).message;
  }

  const status = (r: Row): SubscriptionStatus => r.subscription_status ?? "none";
  const active = rows.filter((r) => status(r) === "active");
  const trialing = rows.filter((r) => status(r) === "trialing");
  const problem = rows.filter((r) => status(r) === "past_due" || status(r) === "paused");
  const comped = rows.filter((r) => r.is_comp);
  const canceled = rows.filter((r) => status(r) === "canceled");

  // MRR counts paying members only: trials haven't converted, comps never
  // will, and an annual plan is spread across the twelve months it covers.
  const mrr = active.reduce(
    (sum, r) => sum + (r.subscription_plan ? monthlyValueOf(r.subscription_plan) : 0),
    0,
  );
  const trialValue = trialing.reduce(
    (sum, r) => sum + (r.subscription_plan ? monthlyValueOf(r.subscription_plan) : 0),
    0,
  );

  return (
    <>
      <div className="nm-head">
        <div>
          <h1 className="admin-h1">Members</h1>
          <p className="admin-sub" style={{ marginBottom: 0 }}>
            {rows.length} account{rows.length === 1 ? "" : "s"} · {active.length} paying ·{" "}
            {trialing.length} on trial
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="nm-empty">
          Couldn&apos;t load members: {loadError}
          <br />
          If this mentions a missing column, run migration 0006_subscriptions.sql.
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Monthly revenue" value={money(mrr)} note="Paying members only" />
            <Stat label="Active" value={String(active.length)} note="Paid and current" />
            <Stat
              label="On trial"
              value={String(trialing.length)}
              note={`${money(trialValue)} if all convert`}
            />
            <Stat
              label="Payment issues"
              value={String(problem.length)}
              note="Retrying or paused"
              warn={problem.length > 0}
            />
            <Stat label="Comped" value={String(comped.length)} note="Free access" />
            <Stat label="Canceled" value={String(canceled.length)} note="Ended or lapsed" />
          </div>

          {rows.length === 0 ? (
            <div className="nm-empty">No accounts yet.</div>
          ) : (
            <div className="ul-table">
              <div className="ul-head ul-head-members">
                <div>Member</div>
                <div>Status</div>
                <div>Plan</div>
                <div>Renews / ends</div>
                <div>Actions</div>
              </div>

              {rows.map((r) => {
                const s = status(r);
                return (
                  <div className="ul-row ul-row-members" key={r.id}>
                    <div className="ul-cell ul-name">
                      <span className="ul-k">Member</span>
                      <span>{r.name || "—"}</span>
                      <span className="ul-email" style={{ display: "block" }}>
                        {r.email}
                      </span>
                    </div>
                    <div className="ul-cell">
                      <span className="ul-k">Status</span>
                      <span className={`membership-pill ${STATUS_CLASS[s] ?? ""}`}>
                        {r.is_comp ? "Comped" : STATUS_LABEL[s]}
                      </span>
                      {r.cancel_at_period_end ? (
                        <span className="ul-note">Cancels at period end</span>
                      ) : null}
                    </div>
                    <div className="ul-cell">
                      <span className="ul-k">Plan</span>
                      <span>
                        {r.subscription_plan === "annual"
                          ? "Annual"
                          : r.subscription_plan === "monthly"
                            ? "Monthly"
                            : "—"}
                      </span>
                    </div>
                    <div className="ul-cell">
                      <span className="ul-k">Renews / ends</span>
                      <span>{fmtDate(r.current_period_end)}</span>
                    </div>
                    <div className="ul-cell ul-actions">
                      <span className="ul-k">Actions</span>
                      {isSuper && r.role !== "super_admin" ? (
                        <MemberRow userId={r.id} isComp={r.is_comp} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className={`stat-card${warn ? " warn" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
