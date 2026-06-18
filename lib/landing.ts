/**
 * Where a signed-in user should land by default, based on their role.
 * Admins/super-admins go to the admin area; everyone else to their account.
 * Kept framework-agnostic (no server-only imports) so client components can use it.
 */
export function landingPathForRole(role: string | null | undefined): string {
  return role === "admin" || role === "super_admin" ? "/admin" : "/account";
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
