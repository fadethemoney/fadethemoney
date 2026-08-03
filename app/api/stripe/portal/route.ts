import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteUrl, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Opens the Stripe Customer Portal for the signed-in member.
 *
 * Cancel, update card, switch monthly/annual and download invoices all live
 * there rather than in our UI: Stripe hosts the flows, handles the dunning
 * copy and the compliance wording, and every change comes back to us as a
 * webhook. The portal's available actions are configured once in the Stripe
 * dashboard (Settings → Billing → Customer portal).
 */
export async function POST() {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't switched on yet." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single<{ stripe_customer_id: string | null }>();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet — start a membership first." },
      { status: 400 },
    );
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl()}/account`,
  });

  return NextResponse.json({ url: session.url });
}
