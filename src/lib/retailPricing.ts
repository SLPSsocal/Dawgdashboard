import { createClient } from "@/lib/supabase/server";

export type RetailCatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  taxable: boolean;
  price: number; // resolved: facility override if set, else base_price
  hasOverride: boolean;
  basePrice: number;
};

// Retail catalog is universal (shared across all 4 facilities) so it's one
// list to maintain, but a facility can override the price for any item
// (e.g. one store charges more for the same leash) via
// retail_item_facility_prices. This resolves the effective price per item
// for whichever facility is asking.
export async function getRetailCatalogForFacility(facilityId: string): Promise<RetailCatalogItem[]> {
  const supabase = createClient();
  const [{ data: items }, { data: overrides }] = await Promise.all([
    supabase.from("retail_items").select("id, name, sku, category, base_price, taxable, active").eq("active", true).order("name"),
    supabase.from("retail_item_facility_prices").select("retail_item_id, price").eq("facility_id", facilityId),
  ]);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.retail_item_id as string, Number(o.price)]));

  return (items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    category: i.category,
    taxable: i.taxable,
    basePrice: Number(i.base_price),
    price: overrideMap.has(i.id) ? overrideMap.get(i.id)! : Number(i.base_price),
    hasOverride: overrideMap.has(i.id),
  }));
}
