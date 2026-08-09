/**
 * Where a signed-in user should land by default, based on their role.
 * Admins/super-admins go to the admin area; everyone else to their account.
 * Kept framework-agnostic (no server-only imports) so client components can use it.
 */
export function landingPathForRole(role: string | null | undefined): string {
  return role === "admin" || role === "super_admin" ? "/admin" : "/account";
}

/**
 * Where to send someone the moment they confirm their email.
 *
 * Staff land in the admin area and paying members in their account, but a
 * brand-new free account goes to /pricing: signing up is the moment to ask for
 * payment. Sending them to /account instead dead-ends the funnel — they'd see
 * "Free account" and never be prompted to subscribe.
 *
 * An explicit `next` (the pricing round-trip, or the password-reset link)
 * always wins over this default; callers apply it first.
 */
export function postVerifyPath(opts: { isStaff: boolean; isMember: boolean }): string {
  if (opts.isStaff) return "/admin";
  return opts.isMember ? "/account" : "/pricing";
}

/**
 * Return `raw` only if it's a safe internal path, else null. Blocks open-redirect
 * tricks: protocol-relative (`//host`) and backslash (`/\host`, which browsers
 * normalize to `//host`). Used by both the login page and the auth callback.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
