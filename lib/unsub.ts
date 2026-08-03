import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed one-click unsubscribe tokens for streak alert emails.
 *
 * A recipient must be able to stop the emails from the email itself — a link
 * that only works after logging in isn't good enough for bulk mail (and
 * RFC 8058 one-click needs an unauthenticated endpoint). The token is an
 * HMAC over the user id, so it can't be guessed or edited into someone
 * else's unsubscribe, and it carries no personal data.
 *
 * Secret: UNSUBSCRIBE_SECRET when set, otherwise the service-role key, which
 * is always present anywhere alerts are sent. Rotating either simply
 * invalidates old links in already-delivered emails.
 */

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("no secret available for unsubscribe tokens");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(userId: string): string {
  return b64url(createHmac("sha256", secret()).update(userId).digest());
}

/** `<userId>.<signature>` — safe to put in a URL. */
export function unsubscribeToken(userId: string): string {
  return `${b64url(Buffer.from(userId))}.${sign(userId)}`;
}

/** The user id a token vouches for, or null if it doesn't verify. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [rawId, sig] = token.split(".");
  if (!rawId || !sig) return null;
  let userId: string;
  try {
    userId = Buffer.from(rawId.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;

  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? userId : null;
}

export function unsubscribeUrl(userId: string, site: string): string {
  return `${site.replace(/\/$/, "")}/api/alerts/unsubscribe?u=${unsubscribeToken(userId)}`;
}
