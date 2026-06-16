"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/auth/Field";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email.");
      return;
    }
    setError(undefined);
    setFormError(undefined);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (resetErr) {
      setFormError(resetErr.message);
      return;
    }
    // Always show the same confirmation (don't reveal whether the account exists).
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`If an account exists for ${email}, we've sent a reset link.`}
      >
        <div className="auth-state">
          <div className="auth-state-icon info">✉</div>
          <p className="auth-sub">Follow the link in that email to choose a new password.</p>
        </div>
        <div className="auth-foot">
          <Link href="/login">Back to log in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new one."
      footer={
        <>
          Remembered it? <Link href="/login">Log in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError ? <AuthBanner kind="error">{formError}</AuthBanner> : null}
        <Field
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          error={error}
        />
        <AuthButton type="submit" loading={loading}>
          Send reset link
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
