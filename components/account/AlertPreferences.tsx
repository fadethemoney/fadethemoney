"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthBanner } from "@/components/auth/AuthBanner";
import type { League } from "@/lib/types";

const LEAGUES: { id: League; label: string }[] = [
  { id: "nfl", label: "NFL" },
  { id: "nba", label: "NBA" },
  { id: "wnba", label: "WNBA" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "ncaab", label: "NCAAB" },
  { id: "ncaaf", label: "NCAAF" },
];

/**
 * Per-league streak alert preferences.
 *
 * Writes straight to profiles.alert_leagues from the browser — migration
 * 0006 grants users UPDATE on exactly this column (plus the Phase 2 profile
 * fields), so no privileged route is needed and RLS keeps the write scoped
 * to the caller's own row.
 */
export function AlertPreferences({
  userId,
  initial,
  canReceiveAlerts,
}: {
  userId: string;
  initial: League[];
  /** Members (and comped accounts) receive alerts; everyone else is told why not. */
  canReceiveAlerts: boolean;
}) {
  const [selected, setSelected] = useState<League[]>(initial);
  const [saved, setSaved] = useState<League[]>(initial);
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  const dirty =
    selected.length !== saved.length || selected.some((l) => !saved.includes(l));

  function toggle(id: League) {
    setMsg(undefined);
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((l) => l !== id) : [...cur, id],
    );
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("profiles")
      .update({ alert_leagues: selected })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSaved(selected);
    setMsg(
      selected.length === 0
        ? "Saved — you won't receive streak alerts."
        : "Alert preferences saved.",
    );
  }

  return (
    <section className="account-section">
      <div className="account-section-title">Streak alerts</div>
      <p className="membership-summary">
        {canReceiveAlerts
          ? "We email you the moment a favorite-vs-underdog run hits 2 and again at 4. Choose which leagues count."
          : "Streak alerts are part of membership. Your choices are saved and start sending as soon as you join."}
      </p>

      <div className="league-toggles">
        {LEAGUES.map((l) => {
          const on = selected.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              className={`league-toggle${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(l.id)}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="membership-note">
          No leagues selected — you won&apos;t get any streak emails.
        </p>
      )}

      {msg ? <AuthBanner kind="success">{msg}</AuthBanner> : null}

      <div className="account-actions">
        <button className="account-btn" type="button" onClick={save} disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </section>
  );
}
