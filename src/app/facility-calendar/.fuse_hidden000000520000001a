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
