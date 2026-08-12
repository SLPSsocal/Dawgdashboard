"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc } from "@/lib/timezone";

function refresh() {
  revalidatePath("/reservations");
  revalidatePath("/lodging");
}

// Every meaningful thing that happens to a reservation (created, edited,
// checked in/out, cancelled, restored) gets a row here — this is what backs
// the "what changed and when" history shown on the reservation detail page.
async function logHistory(
  reservationId: string,
  action: string,
  details: string | null,
  performedBy: string | null
) {
  const supabase = createClient();
  const { error } = await supabase.from("reservation_history").insert({
    reservation_id: reservationId,
    action,
    details,
    performed_by: performedBy ?? null,
  });
  // Never let a logging failure block the actual operation — this is an
  // audit trail, not a source of truth for reservation state itself.
  if (error) console.error("Failed to log reservation history", reservationId, action, error.message);
}

export async function checkOutReservation(reservationId: string, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "checked_out", null, performedBy ?? null);
  refresh();
}

export async function undoCheckIn(reservationId: string, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "booked", checked_in_at: null })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "undo_check_in", null, performedBy ?? null);
  refresh();
}

// Reverses an accidental checkout — puts the reservation back to
// checked_in. Does not touch any invoice already created by that checkout;
// staff should void/adjust the invoice separately if one was generated.
export async function undoCheckOut(reservationId: string, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_in", checked_out_at: null })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "undo_check_out", null, performedBy ?? null);
  refresh();
}

export async function checkInReservation(reservationId: string, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "checked_in", null, performedBy ?? null);
  refresh();
}

// Cancels a reservation instead of deleting it — the row (and its history)
// stays around so it still shows up in the dog's/parent's visit history as
// "cancelled" rather than just silently disappearing.
export async function cancelReservation(reservationId: string, reason: string | null, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: reason })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "cancelled", reason, performedBy ?? null);
  refresh();
}

// Undoes a cancellation — back to "booked" so it reappears on the board.
export async function restoreReservation(reservationId: string, performedBy?: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "booked", cancelled_at: null, cancelled_reason: null })
    .eq("id", reservationId);
  if (error) throw new Error(error.message);
  await logHistory(reservationId, "restored", null, performedBy ?? null);
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
  startTime: string | null; // "HH:MM" — grooming slot, or boarding/daycare drop-off
  endDate: string | null; // "YYYY-MM-DD", boarding/daycare only
  endTime?: string | null; // "HH:MM" — boarding/daycare pick-up
  durationMinutes: number | null; // grooming only
  specialistId: string | null;
  serviceName: string | null; // grooming service, for remembering duration/specialist
  belongings: string | null;
  notes: string | null;
  bookingGroupId?: string | null; // links siblings booked together in one pass
  performedBy?: string | null; // staff who created it, for the history/confirmation trail
}) {
  const supabase = createClient();

  if (!payload.animalId || !payload.startDate) {
    throw new Error("A dog and start date are required.");
  }

  // Fetched once, used for both drop-off and pick-up wall-clock conversions.
  const { data: facilityTz } = await supabase
    .from("facilities")
    .select("timezone")
    .eq("id", payload.facilityId)
    .maybeSingle();
  const tz = facilityTz?.timezone ?? "America/New_York";

  let start: Date;
  if (payload.startTime) {
    // A specific time-of-day is a wall-clock time at THIS facility, not
    // wherever the server happens to run — has to be converted using the
    // facility's own timezone or it ends up hours off (this is what caused
    // an 8:00 AM Pacific appointment to get stored — and displayed — as
    // 1:00 AM).
    start = zonedTimeToUtc(payload.startDate, payload.startTime, tz);
  } else {
    start = new Date(`${payload.startDate}T00:00:00`);
  }

  const end =
    payload.durationMinutes != null
      ? new Date(start.getTime() + payload.durationMinutes * 60000)
      : payload.endTime
        ? zonedTimeToUtc(payload.endDate ?? payload.startDate, payload.endTime, tz)
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
      booking_group_id: payload.bookingGroupId ?? null,
      grooming_service_name: payload.serviceName,
    })
    .select("id")
    .single();

  if (error || !reservation) throw new Error(error?.message ?? "Failed to create booking");
  await logHistory(reservation.id as string, "created", null, payload.performedBy ?? null);

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
// how long it took last time, who groomed them, and what was actually
// charged — so a new booking can prefill/prompt all three instead of
// starting from the service's generic default. (e.g. if Feeny's haircut
// was $55 last month, the booking form should prompt $55 for the next
// haircut — while her bath keeps its own separate remembered price.)
export async function getGroomingMemory(animalId: string, serviceName: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("grooming_service_prices")
    .select("duration_minutes, last_specialist_id, price, updated_at")
    .eq("animal_id", animalId)
    .eq("service_name", serviceName)
    .maybeSingle();
  return data ?? null;
}

// Overbooking a specialist is allowed (staff make that call on purpose
// sometimes), but the booking form and Facility Calendar both need to warn
// about it — this is the shared overlap check both use. Overlap = existing
// start < new end AND existing end > new start.
export async function getSpecialistConflicts(
  facilityId: string,
  specialistId: string,
  startISO: string,
  endISO: string,
  excludeReservationId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from("reservations")
    .select("id, start_date, end_date, animals ( name )")
    .eq("facility_id", facilityId)
    .eq("specialist_id", specialistId)
    .in("status", ["booked", "checked_in"])
    .lt("start_date", endISO)
    .gt("end_date", startISO);

  if (excludeReservationId) query = query.neq("id", excludeReservationId);

  // Blackout windows count as conflicts too — a groomer on vacation isn't
  // less busy than one with another dog on the table.
  const blocksQuery = supabase
    .from("availability_blocks")
    .select("id, start_at, end_at, reason")
    .eq("facility_id", facilityId)
    .eq("block_type", "specialist")
    .eq("specialist_id", specialistId)
    .lt("start_at", endISO)
    .gt("end_at", startISO);

  const [{ data }, { data: blockData }] = await Promise.all([query, blocksQuery]);
  type Row = { id: string; start_date: string; end_date: string; animals: { name: string } | null };
  type BlockRow = { id: string; start_at: string; end_at: string; reason: string | null };
  return [
    ...((data as unknown as Row[]) ?? []).map((r) => ({
      id: r.id,
      animalName: r.animals?.name ?? "Unknown",
      startDate: r.start_date,
      endDate: r.end_date,
      isBlock: false,
      reason: null as string | null,
    })),
    ...((blockData as BlockRow[]) ?? []).map((b) => ({
      id: b.id,
      animalName: "",
      startDate: b.start_at,
      endDate: b.end_at,
      isBlock: true,
      reason: b.reason,
    })),
  ];
}

export async function deleteReservation(reservationId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("reservations").delete().eq("id", reservationId);
  if (error) throw new Error(error.message);
  refresh();
}

// Dogs sharing a parent with this one — used to offer "also book these
// dogs" when creating a reservation, since most multi-dog bookings are the
// same household coming in together.
export async function getSiblingAnimals(parentId: string, excludeAnimalId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("animals")
    .select("id, name, breed")
    .eq("parent_id", parentId)
    .eq("active", true)
    .neq("id", excludeAnimalId)
    .order("name");
  return data ?? [];
}

// Reservations that share this one's booking_group_id — i.e. other dogs
// from the same household booked together in one pass. Shown on the
// reservation detail page so staff can see "who else came in with this dog."
export async function getBookingGroupSiblings(reservationId: string, bookingGroupId: string | null) {
  if (!bookingGroupId) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, status, animals ( id, name )")
    .eq("booking_group_id", bookingGroupId)
    .neq("id", reservationId);
  type Row = { id: string; status: string; animals: { id: string; name: string } | null };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    animalId: r.animals?.id ?? null,
    animalName: r.animals?.name ?? "Unknown",
  }));
}

function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>
): string | null {
  const changes: string[] = [];
  for (const key of Object.keys(labels)) {
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (String(b ?? "") !== String(a ?? "")) {
      changes.push(`${labels[key]}: "${b ?? "—"}" → "${a ?? "—"}"`);
    }
  }
  return changes.length ? changes.join("; ") : null;
}

export async function updateReservation(reservationId: string, performedBy: string | null, formData: FormData) {
  const supabase = createClient();

  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "");
  const reservation_type_id = String(formData.get("reservation_type_id") ?? "") || null;
  const lodging_area_id = String(formData.get("lodging_area_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;
  const belongings = String(formData.get("belongings") ?? "") || null;
  // Only present on the edit form when the reservation is a grooming type
  // (see reservations/[id]/page.tsx) — absent otherwise, which would
  // otherwise wipe it out for non-grooming reservations.
  const hasServiceField = formData.has("grooming_service_name");
  const grooming_service_name = String(formData.get("grooming_service_name") ?? "") || null;

  const { data: before } = await supabase
    .from("reservations")
    .select("start_date, end_date, reservation_type_id, lodging_area_id, notes, belongings, grooming_service_name")
    .eq("id", reservationId)
    .maybeSingle();

  const updatePayload: Record<string, unknown> = {
    start_date,
    end_date,
    reservation_type_id,
    lodging_area_id,
    notes,
    belongings,
  };
  if (hasServiceField) updatePayload.grooming_service_name = grooming_service_name;

  const { error } = await supabase.from("reservations").update(updatePayload).eq("id", reservationId);

  if (error) {
    redirect(`/reservations/${reservationId}?error=${encodeURIComponent(error.message)}`);
  }

  if (before) {
    const summary = diffFields(
      before,
      {
        start_date,
        end_date,
        reservation_type_id,
        lodging_area_id,
        notes,
        belongings,
        grooming_service_name: hasServiceField ? grooming_service_name : before.grooming_service_name,
      },
      {
        start_date: "Arrival",
        end_date: "Departure",
        reservation_type_id: "Type",
        lodging_area_id: "Lodging",
        notes: "Notes",
        belongings: "Belongings",
        grooming_service_name: "Service",
      }
    );
    if (summary) await logHistory(reservationId, "modified", summary, performedBy);
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
