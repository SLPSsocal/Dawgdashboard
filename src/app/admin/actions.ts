"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { setOwnerUnlocked } from "@/lib/ownerGate";

// Unlocks the admin reports area by checking the entered PIN against the
// Owner staff record for the *current* facility. Reports themselves can span
// every location, but you still have to prove you're the owner somewhere.
export async function unlockAdmin(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const pin = String(formData.get("pin") ?? "").trim();
  const next = String(formData.get("next") ?? "/admin");

  const supabase = createClient();
  const { data: owner } = await supabase
    .from("staff")
    .select("id, pin")
    .eq("facility_id", session.facilityId)
    .eq("role", "owner")
    .eq("active", true)
    .maybeSingle();

  if (!owner || !owner.pin || owner.pin !== pin) {
    redirect(`${next}?error=invalid`);
  }

  await setOwnerUnlocked(session.facilityId);
  redirect(next);
}

/**
 * Persists the payout-formula constants for a facility so the commission
 * report stops depending on hardcoded numbers.
 */
export async function saveCommissionSettings(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const facilityId = String(formData.get("facility_id") ?? "");
  const retention = Number(formData.get("retention") ?? 98);
  const cardFee = Number(formData.get("card_fee") ?? 4.0816);
  const returnTo = String(formData.get("return_to") ?? "/admin/commission");

  if (!facilityId || Number.isNaN(retention) || Number.isNaN(cardFee)) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase
    .from("facilities")
    .update({
      commission_retention_percent: Math.min(Math.max(retention, 0), 100),
      card_fee_percent: Math.min(Math.max(cardFee, 0), 100),
    })
    .eq("id", facilityId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/commission");
  redirect(returnTo);
}

/**
 * Saves the manual groomer/House split for one tip. Used on mixed
 * grooming+boarding tickets where the app can't infer who earned what.
 */
export async function saveTipAllocation(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const lineItemId = String(formData.get("line_item_id") ?? "");
  const facilityId = String(formData.get("facility_id") ?? "");
  const specialistIdRaw = String(formData.get("specialist_id") ?? "").trim();
  const groomerAmount = Number(formData.get("groomer_amount") ?? 0) || 0;
  const houseAmount = Number(formData.get("house_amount") ?? 0) || 0;
  const returnTo = String(formData.get("return_to") ?? "/admin/tips");

  if (!lineItemId || !facilityId) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase.from("tip_allocations").upsert(
    {
      invoice_line_item_id: lineItemId,
      facility_id: facilityId,
      specialist_id: specialistIdRaw || null,
      groomer_amount: groomerAmount,
      house_amount: houseAmount,
      allocated_by: session.staffName,
      allocated_at: new Date().toISOString(),
    },
    { onConflict: "invoice_line_item_id" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/admin/tips");
  redirect(returnTo);
}
