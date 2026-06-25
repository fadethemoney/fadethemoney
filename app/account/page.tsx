"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Field } from "@/components/auth/Field";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidEmail, passwordIssue, phoneIssue } from "@/lib/validation";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function AccountPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState({ name: "", email: "", phone: "", address: "" });

  // Profile (name + contact details)
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [profileMsg, setProfileMsg] = useState<string>();
  const [phoneErr, setPhoneErr] = useState<string>();

  // Email
  const [emailInput, setEmailInput] = useState("");
  const [emailErr, setEmailErr] = useState<string>();
  const [emailMsg, setEmailMsg] = useState<string>();

  // Password
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<Partial<Record<keyof typeof pw, string>>>({});
  const [pwMsg, setPwMsg] = useState<string>();

  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.assign("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("name, email, phone, address")
        .eq("id", user.id)
        .single();
      const name = data?.name ?? "";
      const email = data?.email ?? user.email ?? "";
      const phone = data?.phone ?? "";
      const address = data?.address ?? "";
      setUserId(user.id);
      setProfile({ name, email, phone, address });
      setNameInput(name);
      setPhoneInput(phone);
      setAddressInput(address);
      setReady(true);
    })();
  }, [supabase]);

  const setPwField = (k: keyof typeof pw) => (e: ChangeEvent<HTMLInputElement>) =>
    setPw((s) => ({ ...s, [k]: e.target.value }));

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    const phone = phoneInput.trim();
    const issue = phone ? phoneIssue(phone) : null;
    if (issue) {
      setPhoneErr(issue);
      return;
    }
    setPhoneErr(undefined);
    const address = addressInput.trim();
    const { error } = await supabase
      .from("profiles")
      .update({ name, phone: phone || null, address: address || null })
      .eq("id", userId);
    if (error) {
      setProfileMsg(error.message);
      return;
    }
    setProfile((p) => ({ ...p, name, phone, address }));
    setProfileMsg("Profile updated.");
  }

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(emailInput)) {
      setEmailErr("Enter a valid email.");
      return;
    }
    setEmailErr(undefined);
    const { error } = await supabase.auth.updateUser({ email: emailInput });
    if (error) {
      setEmailMsg(error.message);
      return;
    }
    setEmailMsg(`Confirmation sent to ${emailInput}. Your email changes once you confirm it.`);
    setEmailInput("");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof typeof pw, string>> = {};
    if (!pw.current) next.current = "Enter your current password.";
    const issue = passwordIssue(pw.next);
    if (issue) next.next = issue;
    if (pw.confirm !== pw.next) next.confirm = "Passwords don't match.";
    setPwErr(next);
    if (Object.keys(next).length) return;

    // Verify the current password by re-authenticating.
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: pw.current,
    });
    if (signErr) {
      setPwErr({ current: "Current password is incorrect." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) {
      setPwMsg(error.message);
      return;
    }
    setPwMsg("Password changed.");
    setPw({ current: "", next: "", confirm: "" });
  }

  async function logout() {
    await supabase.auth.signOut();
    setLoggedOut(true);
    window.location.assign("/login");
  }

  if (!ready) {
    return (
      <main className="account-shell">
        <p className="auth-sub">Loading…</p>
      </main>
    );
  }

  return (
    <main className="account-shell">
      <div className="account-head">
        <div className="account-avatar" aria-hidden>
          {initials(profile.name || profile.email)}
        </div>
        <div>
          <div className="account-name">{profile.name || "Your account"}</div>
          <div className="account-email">{profile.email}</div>
        </div>
      </div>

      {/* Profile: name + contact details */}
      <section className="account-section">
        <div className="account-section-title">Profile</div>
        <form className="account-form" onSubmit={saveProfile} noValidate>
          <Field
            label="Name"
            name="name"
            value={nameInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setNameInput(e.target.value);
              setProfileMsg(undefined);
            }}
            autoComplete="name"
          />
          <Field
            label="Phone number"
            name="phone"
            type="tel"
            inputMode="tel"
            value={phoneInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setPhoneInput(e.target.value);
              setProfileMsg(undefined);
              setPhoneErr(undefined);
            }}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            error={phoneErr}
          />
          <Field
            label="Address"
            name="address"
            value={addressInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setAddressInput(e.target.value);
              setProfileMsg(undefined);
            }}
            placeholder="123 Main St, City, State ZIP"
            autoComplete="street-address"
          />
          {profileMsg ? <AuthBanner kind="success">{profileMsg}</AuthBanner> : null}
          <div className="account-actions">
            <button
              className="account-btn"
              type="submit"
              disabled={
                nameInput.trim() === profile.name &&
                phoneInput.trim() === profile.phone &&
                addressInput.trim() === profile.address
              }
            >
              Save
            </button>
          </div>
        </form>
      </section>

      {/* Email */}
      <section className="account-section">
        <div className="account-section-title">Email</div>
        <form className="account-form" onSubmit={changeEmail} noValidate>
          <Field
            label="New email"
            name="new-email"
            type="email"
            inputMode="email"
            value={emailInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setEmailInput(e.target.value);
              setEmailMsg(undefined);
            }}
            placeholder={profile.email}
            autoComplete="email"
            error={emailErr}
          />
          {emailMsg ? <AuthBanner kind="info">{emailMsg}</AuthBanner> : null}
          <div className="account-actions">
            <button className="account-btn" type="submit" disabled={!emailInput}>
              Update email
            </button>
          </div>
        </form>
      </section>

      {/* Password */}
      <section className="account-section">
        <div className="account-section-title">Change password</div>
        <form className="account-form" onSubmit={changePassword} noValidate>
          <Field
            label="Current password"
            name="current-password"
            type="password"
            value={pw.current}
            onChange={setPwField("current")}
            autoComplete="current-password"
            error={pwErr.current}
          />
          <Field
            label="New password"
            name="new-password"
            type="password"
            value={pw.next}
            onChange={setPwField("next")}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={pwErr.next}
          />
          <Field
            label="Confirm new password"
            name="confirm-password"
            type="password"
            value={pw.confirm}
            onChange={setPwField("confirm")}
            autoComplete="new-password"
            error={pwErr.confirm}
          />
          {pwMsg ? <AuthBanner kind="success">{pwMsg}</AuthBanner> : null}
          <div className="account-actions">
            <button className="account-btn" type="submit">
              Change password
            </button>
          </div>
        </form>
      </section>

      {/* Log out */}
      <section className="account-section">
        <div className="account-logout-row">
          <p>{loggedOut ? "Logging out…" : "Sign out of this device."}</p>
          <button className="account-btn danger" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </section>
    </main>
  );
}
