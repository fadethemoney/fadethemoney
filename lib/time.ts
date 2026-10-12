/**
 * Time helpers. The product is US-sports-focused, so "today" always means
 * today in US Eastern time — that's the day window users (and the books)
 * organize their slate around.
 */

const ET_TZ = "America/New_York";

/**
 * Built once and reused. Constructing an Intl.DateTimeFormat costs ~0.4 ms,
 * and the refresh's history rebuild calls etDateKeyOf once per stored game per
 * history day — 30 x 2,759 = ~83k calls on 2026-10-12. Built per call, that was
 * 38 s of pure CPU, which pushed every /api/refresh past its time limit right
 * after the game upsert and before streaks were graded, so alerts only went
 * out on the rare run that survived (1-3.5 h late, some sent twice). Cached,
 * the same rebuild takes well under a second.
 */
const ET_DATE_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ET_KICKOFF_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TZ,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Returns today's date in US Eastern time as "YYYY-MM-DD".
 * (At 1am UTC on May 4, this still returns "2026-05-03" because it's
 * 9pm May 3 in ET.)
 */
export function etDateKey(d: Date = new Date()): string {
  return ET_DATE_KEY_FMT.format(d); // en-CA gives ISO-like YYYY-MM-DD
}

/**
 * Returns the ET date key for a given ISO timestamp string.
 * Example: "2026-05-04T00:40:00Z" → "2026-05-03" (8:40pm ET, May 3).
 */
export function etDateKeyOf(iso: string): string {
  return etDateKey(new Date(iso));
}

/**
 * Human-friendly ET kickoff label for emails, e.g. "Tue 7:35 PM ET".
 * Used in streak alerts to show when the next game starts.
 */
export function etKickoffLabel(iso: string): string {
  return `${ET_KICKOFF_FMT.format(new Date(iso))} ET`;
}
