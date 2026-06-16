"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";

type State = "verifying" | "success";

/**
 * Landing page for the "verify your email" link. The real flow reads a token
 * from the URL and confirms it with Supabase; here we simulate a short verify
 * then show the success state.
 */
export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
    const t = window.setTimeout(() => setState("success"), 900);
    return () => window.clearTimeout(t);
  }, []);

  if (state === "verifying") {
    return (
      <AuthLayout title="Verifying your email…" subtitle="This will only take a moment.">
        <div className="auth-state">
          <div className="auth-state-icon info">…</div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Email verified" subtitle="Your account is now active.">
      <div className="auth-state">
        <div className="auth-state-icon success">✓</div>
      </div>
      <div className="auth-foot">
        <Link href="/login">Continue to log in</Link>
      </div>
    </AuthLayout>
  );
}
