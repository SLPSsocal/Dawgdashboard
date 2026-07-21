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
//
// Handles two shapes of booking in one form: boarding/daycare (date range,
// no specific time-of-day) and grooming (a specific start time + duration,
// a specialist, and a named service) — mirrors how reservation_types marks
// requires_lodging vs requires_specialist per type.
export async function createReservation(payload: {
  facilityId: string;
  animalId: string;
  reservationTypeId: string | null;
  lodgingAreaId: string | null;
  startDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:MM", grooming only
  endDate: string | null; // "YYYY-MM-DD", boarding/daycare only
  durationMinutes: number | null; // grooming only
  specialistId: string | null;
  serviceName: string | null; // grooming service, for remembering duration/specialist
  belongings: string | null;
  notes: string | null;
}) {
  const supabase = createClient();

  if (!payload.animalId || !payload.startDate) {
    throw new Error("A dog and start date are required.");
  }

  const start = payload.startTime
    ? new Date(`${payload.startDate}T${payload.startTime}:00`)
    : new Date(`${payload.startDate}T00:00:00`);

  const end =
    payload.durationMinutes != null
      ? new Date(start.getTime() + payload.durationMinutes * 60000)
      : new Date(`${payload.endDate ?? payload.startDate}T00:00:00`);

  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      facility_id: payload.facilityId,
      animal_id: payload.animalId,
      reservation_type_id: payload.reservationTypeId,
      lodging_area_id: payload.lodgingAreaId,
      specialist_id: payload.specialistId,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: "booked",
      belongings: payload.belongings,
      notes: payload.notes,
    })
    .select("id")
    .single();

  if (error || !reservation) throw new Error(error?.message ?? "Failed to create booking");

  // Remember duration + who groomed this animal for this service, so the
  // next booking prefills both instead of guessing from the service
  // default. Price is remembered separately at checkout time.
  if (payload.serviceName) {
    await supabase.from("grooming_service_prices").upsert(
      {
        facility_id: payload.facilityId,
        animal_id: payload.animalId,
        service_name: payload.serviceName,
        duration_minutes: payload.durationMinutes,
        last_specialist_id: payload.specialistId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "animal_id,service_name", ignoreDuplicates: false }
    );
  }

  refresh();
  return { reservationId: reservation.id as string };
}

// Looks up what's remembered for this animal + grooming service combo —
// how long it took last time and who groomed them — so a new booking can
// prefill both instead of starting from the service's generic default.
export async function getGroomingMemory(animalId: string, serviceName: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("grooming_service_prices")
    .select("duration_minutes, last_specialist_id")
    .eq("animal_id", animalId)
    .eq("service_name", serviceName)
    .maybeSingle();
  return data ?? null;
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
