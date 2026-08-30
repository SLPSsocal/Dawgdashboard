"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Reassign a grooming/evaluation reservation to a different specialist (or
// back to unassigned). Only meaningful for reservations that don't require a
// fixed lodging area — this is the groomer-workload board, not the kennel one.
export async function assignSpecialist(reservationId: string, specialistId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ specialist_id: specialistId })
    .eq("id", reservationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/facility-calendar");
  revalidatePath("/reservations");
}

// Move an appointment to a different time of day (same date). Length is
// preserved. This is the tap-to-edit path staff asked for — dragging between
// time slots never worked, and there was no other way to fix a wrong time
// without opening the reservation (Kath, Aug 30).
export async function rescheduleAppointment(
  reservationId: string,
  newStartISO: string,
  newEndISO: string,
  performedBy?: string | null
) {
  const supabase = createClient();
  const { data: before } = await supabase
    .from("reservations")
    .select("start_date, end_date")
    .eq("id", reservationId)
    .maybeSingle();

  const { error } = await supabase
    .from("reservations")
    .update({ start_date: newStartISO, end_date: newEndISO })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);

  await supabase.from("reservation_history").insert({
    reservation_id: reservationId,
    action: "modified",
    details: `Rescheduled from Facility Calendar: ${before?.start_date ?? "?"} → ${newStartISO}`,
    performed_by: performedBy ?? "Facility Calendar",
  });

  revalidatePath("/facility-calendar");
  revalidatePath("/reservations");
}

// Set/adjust the quoted price for this dog + service. Lives in
// grooming_service_prices (the same per-dog memory the booking form and
// checkout prefill from), so a price set here follows the dog everywhere.
export async function saveGroomingPrice(
  facilityId: string,
  animalId: string,
  serviceName: string,
  price: number
) {
  if (!animalId || !serviceName || !(price >= 0)) throw new Error("Missing dog, service, or price.");
  const supabase = createClient();
  const { error } = await supabase.from("grooming_service_prices").upsert(
    {
      facility_id: facilityId,
      animal_id: animalId,
      service_name: serviceName,
      price,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "animal_id,service_name", ignoreDuplicates: false }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/facility-calendar");
}
