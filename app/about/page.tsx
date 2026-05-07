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
        Sportsbooks publish lines designed so the action splits roughly 50/50.
        When the public piles onto one side, the line moves — and historically the
        sharp play has often been to fade the crowd. We track that in real time.
      </Block>

      <Block title="The data">
        <ul style={{ paddingLeft: 22, color: "#3D3D3A", lineHeight: 1.7 }}>
          <li><strong>Live scores &amp; schedules</strong> — ESPN&apos;s public scoreboard endpoint.</li>
          <li><strong>Public betting %, spreads, totals</strong> — SportsBettingDime trends.</li>
          <li><strong>No database for the MVP</strong> — JSON files, refreshed every few minutes.</li>
        </ul>
      </Block>

      <Block title="The math">
        For each game we take the home spread, add it to the home score, and subtract the
        away score. If the result favors the public&apos;s side, they&apos;re covering. If it
        flips, Vegas is winning the bet right now.
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
