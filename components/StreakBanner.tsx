import Link from "next/link";
import type { StreakState } from "@/lib/types";

export function StreakBanner({
  streak,
  locked = false,
}: {
  streak: StreakState;
  /**
   * Free tier: streak state is stripped server-side before render
   * (lib/paywall.ts), so this banner has nothing real to show — it becomes
   * the join prompt instead.
   */
  locked?: boolean;
}) {
  if (locked) {
    return (
      <div className="streak-banner streak-locked">
        <div>
          <span className="streak-label">Active streak</span>
          <span className="streak-text">
            Live streaks and today&apos;s picks are for members.
          </span>
        </div>
        <Link href="/pricing" className="btn-primary btn-join">
          Join to unlock
        </Link>
      </div>
    );
  }

  if (!streak.current || streak.count === 0) {
    return (
      <div className="streak-banner">
        <div>
          <span className="streak-label">Active streak</span>
          <span className="streak-text">No streak yet — results populate as games finalize.</span>
        </div>
      </div>
    );
  }
  const favs = streak.current === "public";
  return (
    <div className="streak-banner">
      <div>
        <span className="streak-label">Active streak</span>
        <span className="streak-text">
          <strong className={favs ? "" : "vegas"}>
            {favs ? "Public" : "Vegas"}
          </strong>{" "}
          on a {streak.count}-game ATS run
        </span>
      </div>
      {streak.count >= 2 && <span className="notified-pill">● Notified</span>}
    </div>
  );
}
