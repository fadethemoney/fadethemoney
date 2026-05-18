import Link from "next/link";

const LEAGUES = [
  { slug: "", label: "All" },
  { slug: "nba", label: "NBA" },
  { slug: "wnba", label: "WNBA" },
  { slug: "mlb", label: "MLB" },
  { slug: "nfl", label: "NFL" },
  { slug: "nhl", label: "NHL" },
];

export function LeagueFilter({ active }: { active?: string }) {
  return (
    <div className="tabs">
      {LEAGUES.map((l) => {
        const isActive = (active ?? "") === l.slug;
        const href = l.slug ? `/?league=${l.slug}#games` : "/#games";
        return (
          <Link key={l.slug || "all"} href={href} className={`tab${isActive ? " active" : ""}`}>
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
