"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One row per groomer entry on a grooming appointment — notes + an optional
// photo of the finished style. Kept as a running log (not a single
// overwritten field) so the animal page can show a full history of past
// grooms, newest first, instead of only the most recent note.
export async function addGroomingNote(
  reservationId: string,
  animalId: string,
  facilityId: string,
  formData: FormData
) {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoUrl = String(formData.get("photo_url") ?? "").trim() || null;
  const groomerName = String(formData.get("groomer_name") ?? "").trim() || null;

  if (!notes && !photoUrl) return; // nothing worth saving

  const supabase = createClient();
  const { error } = await supabase.from("grooming_records").insert({
    reservation_id: reservationId,
    animal_id: animalId,
    facility_id: facilityId,
    notes,
    photo_url: photoUrl,
    groomer_name: groomerName,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/animals/${animalId}`);
}

export async function getGroomingRecordsForAnimal(animalId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("grooming_records")
    .select("id, reservation_id, notes, photo_url, groomer_name, created_at")
    .eq("animal_id", animalId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
