"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/retail");
}

export async function createRetailItem(formData: FormData) {
  const supabase = createClient();
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "retail");
  const base_price = Number(formData.get("base_price") ?? 0);
  const taxable = formData.get("taxable") === "on";

  if (!name) redirect("/retail?error=missing_name");

  const { error } = await supabase.from("retail_items").insert({ name, sku, category, base_price, taxable });
  if (error) redirect(`/retail?error=${encodeURIComponent(error.message)}`);

  refresh();
}

export async function retireRetailItem(itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("retail_items").update({ active: false }).eq("id", itemId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function reactivateRetailItem(itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("retail_items").update({ active: true }).eq("id", itemId);
  if (error) throw new Error(error.message);
  refresh();
}

// Sets (or clears, if price is blank) this facility's override price for an
// otherwise-universal catalog item.
export async function setFacilityPrice(facilityId: string, itemId: string, formData: FormData) {
  const supabase = createClient();
  const raw = String(formData.get("price") ?? "").trim();

  if (raw === "") {
    const { error } = await supabase
      .from("retail_item_facility_prices")
      .delete()
      .eq("facility_id", facilityId)
      .eq("retail_item_id", itemId);
    if (error) throw new Error(error.message);
    refresh();
    return;
  }

  const price = Number(raw);
  const { error } = await supabase
    .from("retail_item_facility_prices")
    .upsert({ facility_id: facilityId, retail_item_id: itemId, price }, { onConflict: "retail_item_id,facility_id" });
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateTaxRate(facilityId: string, formData: FormData) {
  const supabase = createClient();
  const tax_rate = Number(formData.get("tax_rate") ?? 0);
  const { error } = await supabase.from("facilities").update({ tax_rate }).eq("id", facilityId);
  if (error) throw new Error(error.message);
  refresh();
}
