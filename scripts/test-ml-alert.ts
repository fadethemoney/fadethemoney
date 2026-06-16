/**
 * Moneyline streak alert test — sends a REAL moneyline email to your inbox.
 *
 * Builds a synthetic 4-game "favorite wins outright" streak, formats it through
 * the exact same buildMoneylineEmails path the cron uses, and delivers it via
 * the real mailer so you can see what the client will receive.
 *
 * Run:   npx tsx scripts/test-ml-alert.ts
 */
import { promises as fs } from "fs";
import path from "path";
import { notifyAdmin } from "../lib/mailer";
import {
  applyGameToLeagueStreaks,
  buildMoneylineEmails,
  emptyLeagueStreaks,
  findNextGame,
} from "../lib/streak";
import type { Game } from "../lib/types";

async function loadDotenv(file: string) {
  try {
    const txt = await fs.readFile(file, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k] !== undefined) continue;
      process.env[k] = vRaw.replace(/^['"]|['"]$/g, "");
    }
    console.log(`[test-ml-alert] loaded env from ${file}`);
  } catch {
    console.log(`[test-ml-alert] no ${file} found, using process env only`);
  }
}

function favWinGame(id: string, favSide: "home" | "away"): Game {
  const homeFav = favSide === "home";
  const homeScore = homeFav ? 110 : 104;
  const awayScore = homeFav ? 104 : 110; // the favorite always wins outright
  return {
    id,
    league: "nba",
    startTime: "2026-06-15T23:00:00.000Z",
    status: "final",
    home: { id: "h", name: "Lakers", abbr: "LAL", score: homeScore },
    away: { id: "a", name: "Suns", abbr: "PHX", score: awayScore },
    trend: {
      spread: homeFav ? -4.5 : 4.5,
      total: 220.5,
      mlOddsHome: homeFav ? "-180" : "+150",
      mlOddsAway: homeFav ? "+150" : "-180",
      spreadOddsHome: "-110",
      spreadOddsAway: "-110",
      totalOddsOver: "-110",
      totalOddsUnder: "-110",
      pickedSide: favSide,
      source: "sportsgameodds",
      trendUpdatedAt: "2026-06-15T22:00:00.000Z",
    },
    finalResult: {
      winnerSide: homeScore > awayScore ? "home" : "away",
      margin: Math.abs(homeScore - awayScore),
      publicCovered: true,
      totalGoOver: false,
    },
    updatedAt: "2026-06-15T23:30:00.000Z",
  };
}

async function run() {
  await loadDotenv(path.join(process.cwd(), ".env.local"));

  const games = [
    favWinGame("ml1", "home"),
    favWinGame("ml2", "away"),
    favWinGame("ml3", "home"),
    favWinGame("ml4", "away"),
  ];
  const upcoming: Game = {
    ...favWinGame("ml5", "home"),
    id: "ml5",
    status: "scheduled",
    startTime: "2026-06-16T23:00:00.000Z",
    home: { id: "h", name: "Celtics", abbr: "BOS" },
    away: { id: "a", name: "Knicks", abbr: "NYK" },
  };

  let ls = emptyLeagueStreaks();
  for (const g of games) ls = applyGameToLeagueStreaks(ls, g, "2026-06-15");

  const byId = new Map<string, Game>([...games, upcoming].map((g) => [g.id, g]));
  const nextGame = findNextGame([...games, upcoming], "nba");
  const emails = buildMoneylineEmails("nba", ls.moneyline, byId, nextGame);

  if (!emails.length) {
    console.error("[test-ml-alert] no email built — streak did not reach threshold");
    process.exit(1);
  }
  const email = emails[emails.length - 1]; // the 4-game milestone
  console.log("[test-ml-alert] sending to:", process.env.ADMIN_EMAIL || "(unset)");
  console.log("\n=== PREVIEW ===\n" + email.subject + "\n\n" + email.text + "\n===\n");
  const res = await notifyAdmin({ subject: `[TEST] ${email.subject}`, text: email.text });
  console.log("[test-ml-alert] result:", JSON.stringify(res, null, 2));
  if (!res.ok) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
