export const metadata = { title: "About — Fade The Money" };

export default function AboutPage() {
  return (
    <div className="container" style={{ padding: "56px 32px", maxWidth: 760 }}>
      <div className="section-h">About</div>
      <h1 className="serif" style={{ fontSize: 44, fontWeight: 400, letterSpacing: "-0.022em", marginBottom: 24 }}>
        How it works,<br />
        <em>in plain English.</em>
      </h1>

      <Block title="The idea">
        Sportsbooks publish a spread for every game — the number the favorite has
        to win by to &ldquo;cover.&rdquo; Underdogs cover by losing close or winning
        outright. We track which side covers, every game, every day.
      </Block>

      <Block title="The data">
        <ul style={{ paddingLeft: 22, color: "#3D3D3A", lineHeight: 1.7 }}>
          <li><strong>Scores, schedules, odds, spreads, totals</strong> — SportsGameOdds API.</li>
          <li><strong>No database for the MVP</strong> — JSON files (Vercel Blob in prod), refreshed by cron.</li>
        </ul>
      </Block>

      <Block title="The math">
        For each game we take the home spread, add it to the home score, and subtract the
        away score. Positive means the home side covers; negative means the away side
        covers. The favored side (negative spread) is the one we track for the streak.
      </Block>

      <Block title="Streaks">
        Every completed game updates a rolling streak. Today&apos;s record is shown
        at the top of the dashboard.
      </Block>

      <Block title="Coverage">
        NBA, MLB, NFL, NHL — feeds turn on as each season runs.
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div className="thesis-title" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 16, color: "#3D3D3A", lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}
