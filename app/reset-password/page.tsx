"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/auth/Field";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { passwordIssue } from "@/lib/validation";

type Form = { password: string; confirm: string };

export default function ResetPasswordPage() {
  const [form, setForm] = useState<Form>({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const update = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const next: Partial<Record<keyof Form, string>> = {};
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

    // The auth callback already exchanged the email link for a session, so
    // updateUser applies to the signed-in user.
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: form.password });
    setLoading(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now log in with your new password.">
        <div className="auth-state">
          <div className="auth-state-icon success">✓</div>
        </div>
        <div className="auth-foot">
          <Link href="/login">Go to log in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a password you'll remember.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError ? <AuthBanner kind="error">{formError}</AuthBanner> : null}
        <Field
          label="New password"
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
          Update password
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
