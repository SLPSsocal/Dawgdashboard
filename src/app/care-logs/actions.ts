"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CareLogType = "feeding" | "medication" | "note";

// Running log of feeding/medication/general-care entries — same "keep every
// entry, newest first" pattern as grooming_records, so a stay's full care
// history is visible rather than just the latest note.
export async function addCareLog(
  reservationId: string,
  animalId: string,
  facilityId: string,
  formData: FormData
) {
  const logType = String(formData.get("log_type") ?? "note") as CareLogType;
  const notes = String(formData.get("notes") ?? "").trim();
  const loggedBy = String(formData.get("logged_by") ?? "").trim() || null;

  if (!notes) return;

  const supabase = createClient();
  const { error } = await supabase.from("care_logs").insert({
    reservation_id: reservationId || null,
    animal_id: animalId,
    facility_id: facilityId,
    log_type: logType,
    notes,
    logged_by: loggedBy,
  });
  if (error) throw new Error(error.message);

  if (reservationId) revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/animals/${animalId}`);
}

export async function getCareLogsForReservation(reservationId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("care_logs")
    .select("id, log_type, notes, logged_by, created_at")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getCareLogsForAnimal(animalId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("care_logs")
    .select("id, log_type, notes, logged_by, created_at, reservation_id")
    .eq("animal_id", animalId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
