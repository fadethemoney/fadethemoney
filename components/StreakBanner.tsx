import type { StreakState } from "@/lib/types";

export function StreakBanner({ streak }: { streak: StreakState }) {
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
