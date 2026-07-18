"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Store credit is tracked as a ledger (never overwritten), same philosophy as
// pricing history elsewhere in this app — every add/redeem is its own row, so
// the balance is always reconstructable and auditable.
export async function addStoreCredit(formData: FormData) {
  const supabase = createClient();
  const parent_id = String(formData.get("parent_id") ?? "");
  const facility_id = String(formData.get("facility_id") ?? "");
  const amountRaw = Number(formData.get("amount") ?? 0);
  const direction = String(formData.get("direction") ?? "add"); // "add" or "redeem"
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const created_by = String(formData.get("staff_name") ?? "") || null;

  if (!parent_id || !facility_id || !amountRaw) return;

  const amount = direction === "redeem" ? -Math.abs(amountRaw) : Math.abs(amountRaw);

  const { error } = await supabase
    .from("store_credit_transactions")
    .insert({ parent_id, facility_id, amount, reason, created_by });

  if (error) throw new Error(error.message);

  revalidatePath(`/parents/${parent_id}`);
}
