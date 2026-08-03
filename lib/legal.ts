/**
 * Company details used across the legal pages and billing copy.
 *
 * NEEDS CLIENT INPUT before launch — these are placeholders wherever the
 * client hasn't confirmed a value yet (registered business name, mailing
 * address, support inbox, governing-law state). Each can be overridden by
 * env so a correction doesn't need a code change, but the right fix is to
 * put the confirmed values here.
 *
 * These pages are a solid, plain-English starting point, NOT legal advice.
 * Have a lawyer review them before taking real money — particularly the
 * subscription/refund terms and the sports-information framing, which is
 * what keeps the product inside Stripe's rules.
 */

export const LEGAL = {
  /** Registered business name. Placeholder until the client confirms. */
  entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? "Fade The Money",
  site: "Fade The Money",
  domain: "fadethemoney.com",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@fadethemoney.com",
  /** Mailing address shown in the privacy policy. Placeholder. */
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "Address on file — contact us by email",
  /** Governing law. Placeholder until the client confirms their state. */
  jurisdiction: process.env.NEXT_PUBLIC_LEGAL_STATE ?? "the State of Nevada, USA",
  effectiveDate: "August 3, 2026",
} as const;

/** True when a value is still the built-in placeholder (admin warnings). */
export function legalPlaceholdersRemain(): boolean {
  return (
    !process.env.NEXT_PUBLIC_LEGAL_ENTITY ||
    !process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
    !process.env.NEXT_PUBLIC_LEGAL_ADDRESS ||
    !process.env.NEXT_PUBLIC_LEGAL_STATE
  );
}
