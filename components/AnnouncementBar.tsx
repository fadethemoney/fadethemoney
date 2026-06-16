"use client";

import { useEffect, useState } from "react";

type Tip = { id: string; title: string; teamPick: string; message: string };

/**
 * Customer-facing announcement bar shown above the site header. Displays ACTIVE
 * tips only (drafts never reach here — they're filtered server-side). Auto-
 * rotates when there's more than one, and can be dismissed for the current view.
 */
export function AnnouncementBar({ tips }: { tips: Tip[] }) {
  const [dismissed, setDismissed] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => setI((n) => (n + 1) % tips.length), 6000);
    return () => clearInterval(id);
  }, [tips.length]);

  if (!tips.length || dismissed) return null;
  const tip = tips[i] ?? tips[0];

  return (
    <div className="announce" role="status" aria-live="polite">
      <div className="container announce-inner">
        <span className="announce-tag">Tip</span>
        <span className="announce-text">
          <span className="announce-pick">{tip.teamPick}</span>
          <span className="announce-sep">·</span>
          {tip.title}
        </span>
        {tips.length > 1 ? (
          <span className="announce-dots" aria-hidden>
            {tips.map((t, n) => (
              <span key={t.id} className={n === i ? "on" : ""} />
            ))}
          </span>
        ) : null}
        <button
          className="announce-dismiss"
          aria-label="Dismiss announcement"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
