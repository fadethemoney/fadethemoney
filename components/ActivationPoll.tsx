"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Checkout returns the customer to /welcome the moment Stripe redirects,
 * which can beat our webhook by a second or two. Rather than showing a
 * confusing "not a member" state, the welcome page polls for the access
 * flip and this component drives that — then gives up quietly so a genuinely
 * stuck subscription doesn't spin forever.
 */
export function ActivationPoll({
  intervalMs = 2000,
  giveUpAfterMs = 30_000,
}: {
  intervalMs?: number;
  giveUpAfterMs?: number;
}) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => router.refresh(), intervalMs);
    const stop = setTimeout(() => {
      clearInterval(tick);
      setGaveUp(true);
    }, giveUpAfterMs);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [router, intervalMs, giveUpAfterMs]);

  if (!gaveUp) return null;
  return (
    <p className="pricing-fineprint">
      Still working on it. Your payment went through — if the dashboard is still
      locked in a few minutes, email us and we&apos;ll sort it out straight away.
    </p>
  );
}
