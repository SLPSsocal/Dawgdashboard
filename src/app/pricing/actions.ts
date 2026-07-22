"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/pricing");
  revalidatePath("/pricing/rules");
}

export async function addRate(formData: FormData) {
  const supabase = createClient();
  const reservation_type_id = String(formData.get("reservation_type_id") ?? "");
  const rate = Number(formData.get("rate") ?? 0);
  const effective_date = String(formData.get("effective_date") ?? "") || new Date().toISOString().slice(0, 10);

  if (!reservation_type_id) return;

  const { error } = await supabase.from("reservation_type_rates").insert({ reservation_type_id, rate, effective_date });
  if (error) throw new Error(error.message);

  // Keep the convenience column roughly in sync for anything still reading it directly.
  await supabase.from("reservation_types").update({ base_rate: rate }).eq("id", reservation_type_id);

  refresh();
}

export async function addPricingRule(formData: FormData) {
  const supabase = createClient();
  const facility_id = String(formData.get("facility_id") ?? "");
  const reservation_type_id = String(formData.get("reservation_type_id") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim();
  const rule_type = String(formData.get("rule_type") ?? "flat_fee");
  const thresholdRaw = String(formData.get("threshold") ?? "");
  const threshold = thresholdRaw ? Number(thresholdRaw) : null;
  const method = String(formData.get("method") ?? "dollar");
  const amount = Number(formData.get("amount") ?? 0);
  const effective_date = String(formData.get("effective_date") ?? "") || new Date().toISOString().slice(0, 10);

  if (!facility_id || !label) return;

  const { error } = await supabase
    .from("pricing_rules")
    .insert({ facility_id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date });
  if (error) throw new Error(error.message);
  refresh();
}

// Soft-retire, not delete — a reservation that started before this rule was
// retired should still price the same way when it's checked out later.
// Hard-deleting would silently change the estimate for those in-flight
// reservations, which is exactly what we don't want.
export async function retirePricingRule(ruleId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("pricing_rules")
    .update({ active: false, retired_date: new Date().toISOString().slice(0, 10) })
    .eq("id", ruleId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function addGroomingMenuItem(formData: FormData) {
  const supabase = createClient();
  const facility_id = String(formData.get("facility_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const min_price = Number(formData.get("min_price") ?? 0) || null;
  const maxRaw = String(formData.get("max_price") ?? "");
  const max_price = maxRaw ? Number(maxRaw) : null;

  if (!facility_id || !name) return;

  const { error } = await supabase.from("grooming_menu_items").insert({ facility_id, name, min_price, max_price });
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteGroomingMenuItem(itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("grooming_menu_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  refresh();
}
