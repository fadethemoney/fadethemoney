// Shared client-side validation helpers for the auth forms.
// Kept deliberately small — the real enforcement happens server-side once
// Supabase Auth is wired in. These just give fast, friendly inline feedback.

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Returns a problem message, or null if the password is acceptable. */
export function passwordIssue(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  return null;
}

/** Returns a problem message, or null if the phone number looks acceptable. */
export function phoneIssue(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "Enter a valid phone number.";
  if (digits.length > 15) return "That phone number looks too long.";
  return null;
}
