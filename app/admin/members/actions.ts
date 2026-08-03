"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Comp toggling for the admin Members screen.
 *
 * Comp is real access with no Stripe subscription behind it — owners, the
 * client's own accounts, anyone granted the product for free. Restricted to
 * super admins for the same reason role changes are: it hands out paid
 * product, and the UI hiding a button is not a security control.
 */
type Result = { ok: true } | { ok: false; error: string };

export async function setComp(userId: string, isComp: boolean): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.role !== "super_admin") {
    return { ok: false, error: "Only a super admin can grant free access." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_comp: isComp }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/members");
  return { ok: true };
}
