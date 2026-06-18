/**
 * Where a signed-in user should land by default, based on their role.
 * Admins/super-admins go to the admin area; everyone else to their account.
 * Kept framework-agnostic (no server-only imports) so client components can use it.
 */
export function landingPathForRole(role: string | null | undefined): string {
  return role === "admin" || role === "super_admin" ? "/admin" : "/account";
}
