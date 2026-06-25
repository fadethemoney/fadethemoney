"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/auth/Field";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { bootstrapSuperAdmin, welcomeNewUser } from "@/app/auth/actions";
import { isValidEmail, passwordIssue, phoneIssue } from "@/lib/validation";
import { landingPathForRole } from "@/lib/landing";

type Form = {
  name: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirm: string;
};

export default function RegisterPage() {
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [exists, setExists] = useState(false);

  const update = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (exists) setExists(false);
  };

  function validate() {
    const next: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim()) next.name = "Enter your name.";
    if (!isValidEmail(form.email)) next.email = "Enter a valid email.";
    const phone = phoneIssue(form.phone);
    if (phone) next.phone = phone;
    if (!form.address.trim()) next.address = "Enter your address.";
    const pw = passwordIssue(form.password);
    if (pw) next.password = pw;
    if (form.confirm !== form.password) next.confirm = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setFormError(undefined);
    setExists(false);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLoading(false);
      // Some configs return an explicit error for an existing email.
      if (/already (registered|exists)|user_already_exists/i.test(`${error.message} ${error.code ?? ""}`)) {
        setExists(true);
      } else {
        setFormError(error.message);
      }
      return;
    }
    // Enumeration protection: signing up an already-registered email returns NO
    // error and an obfuscated user with an empty identities array (and no
    // session). Treat that as "already registered" rather than "check your email".
    if (!data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      setLoading(false);
      setExists(true);
      return;
    }
    // Email confirmation OFF → Supabase returns a session, so we're signed in.
    if (data.session) {
      await bootstrapSuperAdmin();
      await welcomeNewUser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let role: string | undefined;
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        role = profile?.role ?? undefined;
      }
      window.location.assign(landingPathForRole(role));
      return;
    }
    // Confirmation ON → verification email sent.
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a verification link to ${form.email}.`}>
        <div className="auth-state">
          <div className="auth-state-icon success">✓</div>
          <p className="auth-sub">Click the link in that email to activate your account.</p>
        </div>
        <div className="auth-foot">
          <Link href="/login">Back to log in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track where the public goes wrong — free while we're in preview."
      footer={
        <>
          Already have an account? <Link href="/login">Log in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError ? <AuthBanner kind="error">{formError}</AuthBanner> : null}
        {exists ? (
          <AuthBanner kind="info">
            This email is already registered.{" "}
            <Link href="/login" className="auth-link">
              Log in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className="auth-link">
              reset your password
            </Link>
            .
          </AuthBanner>
        ) : null}
        <Field
          label="Name"
          name="name"
          value={form.name}
          onChange={update("name")}
          placeholder="Jordan"
          autoComplete="name"
          error={errors.name}
        />
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
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={update("phone")}
          placeholder="(555) 123-4567"
          autoComplete="tel"
          error={errors.phone}
        />
        <Field
          label="Address"
          name="address"
          value={form.address}
          onChange={update("address")}
          placeholder="123 Main St, City, State ZIP"
          autoComplete="street-address"
          error={errors.address}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={form.password}
          onChange={update("password")}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={errors.password}
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          value={form.confirm}
          onChange={update("confirm")}
          placeholder="Re-enter password"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <AuthButton type="submit" loading={loading}>
          Create account
        </AuthButton>
        <p className="auth-fineprint">For entertainment only · 21+. By continuing you agree to our terms.</p>
      </form>
    </AuthLayout>
  );
}
