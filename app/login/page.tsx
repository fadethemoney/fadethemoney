"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/auth/Field";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { bootstrapSuperAdmin } from "@/app/auth/actions";
import { isValidEmail } from "@/lib/validation";
import { landingPathForRole, safeInternalPath } from "@/lib/landing";

type Form = { email: string; password: string };

export default function LoginPage() {
  const [form, setForm] = useState<Form>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  // Surface a verification failure bounced here by the auth callback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "verify") {
      setFormError("That verification link was invalid or expired. Try logging in or resetting your password.");
    }
  }, []);

  const update = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next: Partial<Record<keyof Form, string>> = {};
    if (!isValidEmail(form.email)) next.email = "Enter a valid email.";
    if (!form.password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setFormError(undefined);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    if (error) {
      setLoading(false);
      setFormError(error.message);
      return;
    }
    // Promote env-allowlisted emails to super_admin, then hard-navigate so the
    // server picks up the fresh session.
    await bootstrapSuperAdmin();

    // Land by role: admins → /admin, everyone else → /account. An explicit
    // ?next= is honored, except we never send a non-admin into /admin (the
    // middleware would just bounce them back to "/").
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let role: string | undefined;
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      role = profile?.role ?? undefined;
    }
    const home = landingPathForRole(role);
    const rawNext = new URLSearchParams(window.location.search).get("next");
    const safeNext = safeInternalPath(rawNext);
    const dest = safeNext && !(safeNext.startsWith("/admin") && home !== "/admin") ? safeNext : home;
    window.location.assign(dest);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see today's public-vs-Vegas board."
      footer={
        <>
          Don&apos;t have an account? <Link href="/register">Create one</Link>
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
          value={form.email}
          onChange={update("email")}
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={form.password}
          onChange={update("password")}
          placeholder="Your password"
          autoComplete="current-password"
          error={errors.password}
        />
        <div className="auth-row-between">
          <span />
          <Link className="auth-link" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <AuthButton type="submit" loading={loading}>
          Log in
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
