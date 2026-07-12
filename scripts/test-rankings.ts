// Ad-hoc smoke test: node --import tsx scripts/test-rankings.ts
import { fetchRankedTeams, buildRankedMatcher } from "../lib/rankings";

async function main() {
  for (const league of ["ncaab", "ncaaf"] as const) {
    const teams = await fetchRankedTeams(league);
    console.log(`${league}: ${teams.length} ranked teams`);
    console.log(teams.map((t) => `${t.abbreviation} ${t.fullName}`).join(" | "));
    const m = buildRankedMatcher(teams);
    if (league === "ncaab") {
      console.log("Michigan Wolverines →", m({ id: "x", abbr: "ZZZ", name: "Michigan Wolverines" }));
      console.log("Michigan State Spartans →", m({ id: "x", abbr: "ZZZ", name: "Michigan State Spartans" }));
      console.log("Nobody State Owls →", m({ id: "x", abbr: "ZZZ", name: "Nobody State Owls" }));
    }
  }
}
main();
