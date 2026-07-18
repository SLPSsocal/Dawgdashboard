"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createLodgingArea(formData: FormData) {
  const supabase = createClient();
  const facilityId = String(formData.get("facility_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const areaType = String(formData.get("area_type") ?? "kennel");
  const capacity = Number(formData.get("capacity") ?? 1);

  if (!facilityId || !name) return;

  const { error } = await supabase
    .from("lodging_areas")
    .insert({ facility_id: facilityId, name, area_type: areaType, capacity });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/lodging");
}

// Moves a reservation to a different (or no) lodging area — e.g. "Suite 8"
// becomes "Suite 9" on the board, and that's the same value the check-in
// board reads for that reservation.
export async function assignLodging(reservationId: string, lodgingAreaId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ lodging_area_id: lodgingAreaId })
    .eq("id", reservationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/lodging");
  revalidatePath("/lodging/calendar");
  revalidatePath("/reservations");
}
