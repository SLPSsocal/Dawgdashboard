"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The dashboard shares the feeding_logs table with the standalone PawFeed app
// (feeny.vercel.app) — same Supabase, same unique key (pet_id, date,
// meal_time, facility). Writing the identical shape means a meal logged in
// either tool shows up in both, instead of forking a second feeding system.
export type FeedingPatch = {
  amount?: "All" | "Half" | "Some" | "None" | null;
  fresh_food?: boolean;
  fresh_food_items?: string | null; // comma list, e.g. "topper,cbd"
  medication_administered?: boolean;
  staff_notes?: string | null;
  logged_by?: string | null;
};

export async function logFeeding(
  facilitySlug: string,
  petId: string,
  petName: string,
  date: string, // YYYY-MM-DD
  meal: "Breakfast" | "Lunch" | "Dinner",
  patch: FeedingPatch
) {
  const supabase = createClient();

  // Merge onto whatever is already logged for this meal, so tapping the
  // fresh-food toggle doesn't wipe an appetite already recorded (or vice
  // versa) — each control saves independently.
  const { data: existing } = await supabase
    .from("feeding_logs")
    .select("id, amount, fresh_food, fresh_food_items, medication_administered, staff_notes, logged_by")
    .eq("pet_id", petId)
    .eq("date", date)
    .eq("meal_time", meal)
    .eq("facility", facilitySlug)
    .maybeSingle();

  const row = {
    pet_id: petId,
    pet_name: petName,
    date,
    meal_time: meal,
    facility: facilitySlug,
    amount: patch.amount !== undefined ? patch.amount : existing?.amount ?? null,
    fresh_food: patch.fresh_food !== undefined ? patch.fresh_food : existing?.fresh_food ?? false,
    fresh_food_items:
      patch.fresh_food_items !== undefined ? patch.fresh_food_items : existing?.fresh_food_items ?? null,
    medication_administered:
      patch.medication_administered !== undefined
        ? patch.medication_administered
        : existing?.medication_administered ?? false,
    staff_notes: patch.staff_notes !== undefined ? patch.staff_notes : existing?.staff_notes ?? "",
    logged_by: patch.logged_by ?? existing?.logged_by ?? "Dashboard",
    modified_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("feeding_logs")
    .upsert(row, { onConflict: "pet_id,date,meal_time,facility" });
  if (error) throw new Error(error.message);

  revalidatePath("/feeding");
}

export async function getFeedingHistory(petIds: string[], limit = 30) {
  if (petIds.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("feeding_logs")
    .select("date, meal_time, amount, fresh_food, fresh_food_items, medication_administered, staff_notes, logged_by")
    .in("pet_id", petIds)
    .order("date", { ascending: false })
    .limit(limit);
  return data ?? [];
}
