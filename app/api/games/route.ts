import { NextResponse } from "next/server";
import { readStore } from "@/lib/storage";
import { getMemberAccess } from "@/lib/subscription";
import { redactStoreForFreeTier } from "@/lib/paywall";

export const dynamic = "force-dynamic";

export async function GET() {
  // Same gate as the dashboard — this route dumps the whole store, so without
  // it a non-member could read every pick and streak straight out of the JSON.
  const [store, access] = await Promise.all([readStore(), getMemberAccess()]);
  return NextResponse.json(access.isMember ? store : redactStoreForFreeTier(store));
}
