import { readStore } from "@/lib/storage";
import { todayKey } from "@/lib/calc";
import type { DailyRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "30-Day Results — Fade The Money" };

function shiftDayKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export default async function Results30Page() {
  const store = await readStore();
  const byDate = new Map(store.history.map((h) => [h.date, h]));
  const today = todayKey();

  // Build the full 30-day window so gaps are visible, then keep only the days
  // that actually had games for the table (a 30-row grid of "no games" reads as
  // noise; the summary still spans the whole window).
  const window: DailyRecord[] = Array.from({ length: 30 }, (_, i) => {
    const date = shiftDayKey(today, -i);
    return byDate.get(date) ?? { date, publicWins: 0, vegasWins: 0, pushes: 0, games: [] };
  });
  const rows = window.filter((d) => d.publicWins + d.vegasWins + d.pushes > 0 || d.games.length > 0);

  const totals = window.reduce(
    (acc, d) => ({
      publicWins: acc.publicWins + d.publicWins,
      vegasWins: acc.vegasWins + d.vegasWins,
      pushes: acc.pushes + d.pushes,
    }),
    { publicWins: 0, vegasWins: 0, pushes: 0 },
  );
  const decided = totals.publicWins + totals.vegasWins;
  const publicPct = decided > 0 ? Math.round((totals.publicWins / decided) * 100) : 0;
  const vegasPct = decided > 0 ? 100 - publicPct : 0;
  const overallLeader =
    totals.publicWins === totals.vegasWins ? null :
    totals.publicWins > totals.vegasWins ? "public" : "vegas";
  const daysWithGames = rows.length;

  return (
    <div className="container" style={{ padding: "56px 32px" }}>
      <div className="section-h">30-day track record</div>
      <h1 className="serif" style={{ fontSize: 44, fontWeight: 400, letterSpacing: "-0.022em", marginBottom: 12 }}>
        Last 30 days,<br />
        <em>Public vs Vegas.</em>
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 24, maxWidth: 560 }}>
        A month-long ledger of how the public side fared against the spread —{" "}
        {decided > 0
          ? `${decided} graded games across ${daysWithGames} day${daysWithGames === 1 ? "" : "s"}.`
          : "filling in as games settle."}
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}>
        <SummaryCard
          label="Public covers"
          value={totals.publicWins}
          pct={decided > 0 ? publicPct : null}
          color="var(--public-text)"
          highlight={overallLeader === "public"}
        />
        <SummaryCard
          label="Vegas covers"
          value={totals.vegasWins}
          pct={decided > 0 ? vegasPct : null}
          color="var(--vegas-text)"
          highlight={overallLeader === "vegas"}
        />
        <SummaryCard
          label="Pushes"
          value={totals.pushes}
          pct={null}
          color="var(--text-muted)"
          highlight={false}
        />
        <SummaryCard
          label="30-day leader"
          value={overallLeader === "public" ? "Public" : overallLeader === "vegas" ? "Vegas" : "Even"}
          pct={null}
          color={
            overallLeader === "public" ? "var(--public-text)" :
            overallLeader === "vegas" ? "var(--vegas-text)" : "var(--text-muted)"
          }
          highlight={false}
        />
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-section)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 11 }}>
              <th style={{ textAlign: "left", padding: "14px 18px" }}>Date</th>
              <th style={{ textAlign: "right", padding: "14px 18px" }}>Public</th>
              <th style={{ textAlign: "right", padding: "14px 18px" }}>Vegas</th>
              <th style={{ textAlign: "right", padding: "14px 18px" }}>Push</th>
              <th style={{ textAlign: "right", padding: "14px 18px" }}>Winner</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>No history yet.</td></tr>
            )}
            {rows.map((d) => {
              const total = d.publicWins + d.vegasWins + d.pushes;
              const games = d.games.length;
              const winner =
                total === 0 ? "—" :
                d.publicWins === d.vegasWins ? "—" :
                d.publicWins > d.vegasWins ? "Public" : "Vegas";
              const winnerColor =
                winner === "Public" ? "var(--public-text)" :
                winner === "Vegas" ? "var(--vegas-text)" : "var(--text-muted)";
              const empty = total === 0;
              const note = empty
                ? games > 0 ? `${games} game${games === 1 ? "" : "s"} · pending` : "no games"
                : null;
              return (
                <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 18px", color: "var(--text)" }}>
                    {d.date}
                    {note && <span style={{ marginLeft: 10, color: "var(--text-muted)", fontSize: 11 }}>· {note}</span>}
                  </td>
                  <td style={{ padding: "14px 18px", textAlign: "right", color: empty ? "var(--text-muted)" : "var(--public-text)", fontWeight: 500 }}>{d.publicWins}</td>
                  <td style={{ padding: "14px 18px", textAlign: "right", color: empty ? "var(--text-muted)" : "var(--vegas-text)", fontWeight: 500 }}>{d.vegasWins}</td>
                  <td style={{ padding: "14px 18px", textAlign: "right", color: "var(--text-muted)" }}>{d.pushes}</td>
                  <td style={{ padding: "14px 18px", textAlign: "right", color: winnerColor, fontWeight: 500 }}>{winner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 16, fontFamily: "var(--font-mono)" }}>
        Staging view · compare with the 7-day <a href="/results" style={{ color: "var(--text-secondary)" }}>/results</a> page.
      </p>
    </div>
  );
}

function SummaryCard({
  label, value, pct, color, highlight,
}: {
  label: string;
  value: number | string;
  pct: number | null;
  color: string;
  highlight: boolean;
}) {
  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${highlight ? color : "var(--border)"}`,
      borderRadius: 8,
      padding: "16px 18px",
      boxShadow: highlight ? `inset 0 0 0 1px ${color}` : undefined,
    }}>
      <div style={{
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontSize: 10,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          fontWeight: 600,
          color,
          lineHeight: 1,
        }}>{value}</div>
        {pct !== null && (
          <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
            {pct}%
          </div>
        )}
      </div>
    </div>
  );
}
