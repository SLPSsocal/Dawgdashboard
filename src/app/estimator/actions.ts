"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export type EstimatorDog = {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
  weightLbs: number | null;
  parentName: string | null;
};
export type RememberedService = { service_name: string; price: number | null; updated_at: string | null };
export type MenuItem = { name: string; min_price: number | null; max_price: number | null };

// The chat estimator sends the raw message; we try to find a known dog in
// it (so "haircut for Feeny" quotes Feeny's actual last haircut price),
// and return the facility's grooming menu ranges as the next-best basis.
export async function getEstimatorContext(rawText: string): Promise<{
  dog: EstimatorDog | null;
  remembered: RememberedService[];
  menu: MenuItem[];
}> {
  const session = await getSession();
  const supabase = createClient();

  const { data: menuRows } = await supabase
    .from("grooming_menu_items")
    .select("name, min_price, max_price")
    .eq("facility_id", session?.facilityId ?? "")
    .eq("active", true)
    .order("name");
  const menu = (menuRows ?? []) as MenuItem[];

  // Candidate name tokens: words 3+ chars that aren't obvious service/breed
  // vocabulary. Checked against the shared animals table (case-insensitive).
  const STOP = new Set([
    "the", "and", "for", "with", "bath", "groom", "full", "haircut", "hair", "cut", "nail", "nails",
    "teeth", "ears", "ear", "gland", "glands", "deshed", "furminator", "flea", "matted", "matting",
    "dematt", "small", "medium", "large", "tiny", "giant", "trim", "tidy", "wash", "shave", "please",
    "much", "what", "how", "cost", "price", "quote", "estimate", "would", "next", "time", "today",
    "dog", "pup", "puppy", "lbs", "pound", "pounds", "sanitary", "medicated", "shampoo", "brush",
  ]);
  const tokens = Array.from(
    new Set(
      rawText
        .toLowerCase()
        .replace(/[^a-z\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w))
    )
  ).slice(0, 8);

  let dog: EstimatorDog | null = null;
  let remembered: RememberedService[] = [];

  if (tokens.length > 0) {
    const orExpr = tokens.map((t) => `name.ilike.${t}`).join(",");
    const { data: dogs } = await supabase
      .from("animals")
      .select("id, name, breed, size, weight_lbs, parents ( first_name, last_name )")
      .or(orExpr)
      .eq("active", true)
      .limit(5);

    if (dogs && dogs.length > 0) {
      // Exact name match preferred; otherwise first hit.
      const row =
        dogs.find((d) => tokens.includes(String(d.name).toLowerCase())) ?? dogs[0];
      const parents = row.parents as unknown as { first_name: string; last_name: string } | null;
      dog = {
        id: row.id as string,
        name: row.name as string,
        breed: (row.breed as string | null) ?? null,
        size: (row.size as string | null) ?? null,
        weightLbs: row.weight_lbs != null ? Number(row.weight_lbs) : null,
        parentName: parents ? `${parents.first_name} ${parents.last_name}` : null,
      };
      const { data: mem } = await supabase
        .from("grooming_service_prices")
        .select("service_name, price, updated_at")
        .eq("animal_id", dog.id)
        .order("updated_at", { ascending: false });
      remembered = ((mem ?? []) as RememberedService[]).filter((m) => m.price != null);
    }
  }

  return { dog, remembered, menu };
}
