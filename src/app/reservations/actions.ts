"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/reservations");
  revalidatePath("/lodging");
}

export async function checkOutReservation(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function undoCheckIn(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "booked", checked_in_at: null })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

// Reverses an accidental checkout — puts the reservation back to
// checked_in. Does not touch any invoice already created by that checkout;
// staff should void/adjust the invoice separately if one was generated.
export async function undoCheckOut(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_in", checked_out_at: null })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function checkInReservation(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

// Creates a brand-new booking (status defaults to "booked" in the DB).
// This is the only place reservations get created in-app — everything
// else in the reservations table so far came from the Gingr import, which
// is why Quick Check-in was empty: nothing was ever left in "booked".
export async function createReservation(facilityId: string, formData: FormData) {
  const supabase = createClient();

  const animal_id = String(formData.get("animal_id") ?? "");
  const reservation_type_id = String(formData.get("reservation_type_id") ?? "") || null;
  const lodging_area_id = String(formData.get("lodging_area_id") ?? "") || null;
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || start_date;
  const belongings = String(formData.get("belongings") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;

  if (!animal_id || !start_date) {
    redirect(`/reservations/new?error=missing`);
  }

  const { error } = await supabase.from("reservations").insert({
    facility_id: facilityId,
    animal_id,
    reservation_type_id,
    lodging_area_id,
    start_date: new Date(start_date).toISOString(),
    end_date: new Date(end_date).toISOString(),
    status: "booked",
    belongings,
    notes,
  });

  if (error) {
    redirect(`/reservations/new?error=${encodeURIComponent(error.message)}`);
  }

  refresh();
  redirect("/reservations");
}

export async function deleteReservation(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").delete().eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateReservation(reservationId: string, formData: FormData) {
  const supabase = createClient();

  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "");
  const reservation_type_id = String(formData.get("reservation_type_id") ?? "") || null;
  const lodging_area_id = String(formData.get("lodging_area_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;
  const belongings = String(formData.get("belongings") ?? "") || null;

  const { error } = await supabase
    .from("reservations")
    .update({ start_date, end_date, reservation_type_id, lodging_area_id, notes, belongings })
    .eq("id", reservationId);

  if (error) {
    redirect(`/reservations/${reservationId}?error=${encodeURIComponent(error.message)}`);
  }

  refresh();
  redirect(`/reservations/${reservationId}`);
}

export async function createIncident(reservationId: string, formData: FormData) {
  const supabase = createClient();
  const animal_id = String(formData.get("animal_id") ?? "");
  const facility_id = String(formData.get("facility_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const severity = String(formData.get("severity") ?? "minor");
  const reported_by = String(formData.get("reported_by") ?? "") || null;

  if (!animal_id || !facility_id || !description) {
    redirect(`/reservations/${reservationId}/incidents/new?error=missing`);
  }

  const { error } = await supabase
    .from("incidents")
    .insert({ reservation_id: reservationId, animal_id, facility_id, description, severity, reported_by });

  if (error) {
    redirect(`/reservations/${reservationId}/incidents/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/reservations/${reservationId}`);
}

export async function createReportCard(reservationId: string, formData: FormData) {
  const supabase = createClient();
  const animal_id = String(formData.get("animal_id") ?? "");
  const facility_id = String(formData.get("facility_id") ?? "");
  const rating = String(formData.get("rating") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;
  const activitiesRaw = String(formData.get("activities") ?? "");
  const activities = activitiesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!animal_id || !facility_id) {
    redirect(`/reservations/${reservationId}/report-card/new?error=missing`);
  }

  const { error } = await supabase.from("report_cards").insert({
    reservation_id: reservationId,
    animal_id,
    facility_id,
    rating,
    notes,
    activities,
  });

  if (error) {
    redirect(`/reservations/${reservationId}/report-card/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/reservations/${reservationId}`);
}
