import Link from "next/link";
import { LEAGUES_ALL, LEAGUE_LABEL } from "@/lib/leagues";

const LEAGUES = [
  { slug: "", label: "All" },
  ...LEAGUES_ALL.map((l) => ({ slug: l, label: LEAGUE_LABEL[l] })),
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
