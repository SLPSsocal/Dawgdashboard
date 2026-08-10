"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One row per groomer entry on an appointment — the questions distilled from
// the old Airtable grooming form, minus everything the system already knows
// (date, dog, payment, commission). Kept as a running log so the animal page
// shows a full history of past grooms, newest first.
export async function addGroomingNote(
  reservationId: string,
  animalId: string,
  facilityId: string,
  formData: FormData
) {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoUrl = String(formData.get("photo_url") ?? "").trim() || null;
  const groomerName = String(formData.get("groomer_name") ?? "").trim() || null;
  const timeNeeded = String(formData.get("time_needed") ?? "").trim() || null;
  const parentNotes = String(formData.get("parent_notes") ?? "").trim() || null;
  const services = formData.getAll("services").map(String).filter(Boolean);
  const preferredGroomer = formData.get("preferred_groomer");

  const supabase = createClient();

  if (notes || photoUrl || timeNeeded || parentNotes || services.length > 0) {
    const { error } = await supabase.from("grooming_records").insert({
      reservation_id: reservationId,
      animal_id: animalId,
      facility_id: facilityId,
      notes,
      photo_url: photoUrl,
      groomer_name: groomerName,
      services: services.length > 0 ? services : null,
      time_needed: timeNeeded,
      parent_notes: parentNotes,
    });
    if (error) throw new Error(error.message);
  }

  // Preferred groomer is a persistent fact about the animal, not this visit —
  // only write it when the groomer actually picked a value.
  if (preferredGroomer !== null) {
    const val = String(preferredGroomer).trim();
    await supabase
      .from("animals")
      .update({ preferred_groomer: val || null })
      .eq("id", animalId);
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/animals/${animalId}`);
}

export async function getGroomingRecordsForAnimal(animalId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("grooming_records")
    .select("id, reservation_id, notes, photo_url, groomer_name, services, time_needed, parent_notes, created_at")
    .eq("animal_id", animalId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
