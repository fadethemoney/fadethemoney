"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type State = "checking" | "verified" | "unconfirmed";

/**
 * Landing page for the "verify your email" link. The email link itself goes
 * through /auth/callback, which exchanges the code for a session; by the time a
 * user reaches a state where their email is confirmed they'll have a session.
 *
 * So instead of faking a result, we read the real auth state: a signed-in user
 * with a confirmed email sees success; anyone else is told the link may have
 * expired and pointed back to log in.
 */
export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      // email_confirmed_at is set by Supabase once the address is verified.
      const confirmed = !!(user?.email_confirmed_at ?? user?.confirmed_at);
      setState(confirmed ? "verified" : "unconfirmed");
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") {
    return (
      <AuthLayout title="Checking your email…" subtitle="This will only take a moment.">
        <div className="auth-state">
          <div className="auth-state-icon info">…</div>
        </div>
      </AuthLayout>
    );
  }

  if (state === "verified") {
    return (
      <AuthLayout title="Email verified" subtitle="Your account is active.">
        <div className="auth-state">
          <div className="auth-state-icon success">✓</div>
        </div>
        <div className="auth-foot">
          <Link href="/account">Go to your account</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Email not confirmed yet"
      subtitle="That link may have expired, or you opened this page directly."
    >
      <div className="auth-state">
        <div className="auth-state-icon info">✉</div>
        <p className="auth-sub">
          Log in to continue — if your email still needs confirming, we&apos;ll send a fresh link.
        </p>
      </div>
      <div className="auth-foot">
        <Link href="/login">Back to log in</Link>
      </div>
    </AuthLayout>
  );
}
