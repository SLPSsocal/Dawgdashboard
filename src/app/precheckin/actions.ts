"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendQuoSms } from "@/lib/quo";
import { logAnimalFieldChange } from "@/lib/animalFieldHistory";

// Creates a one-time pre-check-in link for a specific reservation and tries
// to text it via the facility's Quo number — same pattern as waiver signing
// links. If texting isn't connected yet, the link still gets created so
// staff can copy/send it manually.
export async function createAndSendPrecheckinLink(
  reservationId: string,
  facilityId: string,
  animalId: string,
  parentId: string | null,
  phone: string | null
) {
  const supabase = createClient();
  const token = crypto.randomUUID();

  const { data: req, error } = await supabase
    .from("precheckin_requests")
    .insert({
      reservation_id: reservationId,
      animal_id: animalId,
      parent_id: parentId,
      facility_id: facilityId,
      token,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !req) throw new Error(error?.message ?? "Failed to create pre-check-in link");

  const h = await headers();
  const origin = `https://${h.get("host")}`;
  const url = `${origin}/precheckin/${token}`;

  let sendResult: { sent: boolean; reason?: string } = { sent: false, reason: "No phone number on file" };
  if (phone) {
    sendResult = await sendQuoSms(
      facilityId,
      phone,
      `Please fill out your dog's pre-check-in info (feeding, meds, belongings, grooming) before your visit: ${url}`
    );
  }

  await supabase
    .from("precheckin_requests")
    .update({
      status: sendResult.sent ? "sent" : "pending",
      sent_at: sendResult.sent ? new Date().toISOString() : null,
      sent_to_phone: phone,
    })
    .eq("id", req.id);

  revalidatePath(`/reservations/${reservationId}`);
  return { url, sent: sendResult.sent, reason: sendResult.reason };
}

// Public submit handler — called from the token page with no staff session.
// Applies directly to the animal/reservation records, logging a before/after
// for every field that actually changed so staff can see what a parent
// updated (Recent Changes on the animal page, and a reservation_history
// entry for belongings, since that's reservation-scoped).
export async function submitPrecheckin(token: string, formData: FormData) {
  const supabase = createClient();
  const { data: req } = await supabase
    .from("precheckin_requests")
    .select("id, reservation_id, animal_id, parent_id")
    .eq("token", token)
    .maybeSingle();
  if (!req) throw new Error("This link is invalid or has expired.");

  const { data: animal } = await supabase
    .from("animals")
    .select("feeding_instructions, medications, grooming_notes")
    .eq("id", req.animal_id)
    .maybeSingle();
  if (!animal) throw new Error("Could not find this dog's record.");

  const eatingAm = String(formData.get("eating_am") ?? "").trim();
  const eatingLunch = String(formData.get("eating_lunch") ?? "").trim();
  const eatingPm = String(formData.get("eating_pm") ?? "").trim();
  const feedingParts = [
    eatingAm && `AM: ${eatingAm}`,
    eatingLunch && `Lunch: ${eatingLunch}`,
    eatingPm && `PM: ${eatingPm}`,
  ].filter(Boolean);
  const newFeeding = feedingParts.length ? feedingParts.join("\n") : null;

  const newMedications = String(formData.get("medications") ?? "").trim() || null;
  const newGroomingNotes = String(formData.get("grooming_notes") ?? "").trim() || null;
  const groomingPhotoUrl = String(formData.get("grooming_photo_url") ?? "").trim() || null;

  const belongings = String(formData.get("belongings") ?? "").trim() || null;
  const belongingsPhotoUrl = String(formData.get("belongings_photo_url") ?? "").trim() || null;

  const parentName = String(formData.get("submitted_by") ?? "").trim();
  const changedBy = parentName ? `${parentName} (Parent)` : "Parent (pre-check-in)";

  await Promise.all([
    logAnimalFieldChange(req.animal_id, "feeding_instructions", animal.feeding_instructions, newFeeding, changedBy),
    logAnimalFieldChange(req.animal_id, "medications", animal.medications, newMedications, changedBy),
    logAnimalFieldChange(req.animal_id, "grooming_notes", animal.grooming_notes, newGroomingNotes, changedBy),
  ]);

  const { error: animalError } = await supabase
    .from("animals")
    .update({
      feeding_instructions: newFeeding,
      medications: newMedications,
      grooming_notes: newGroomingNotes,
      ...(groomingPhotoUrl ? { grooming_photo_url: groomingPhotoUrl } : {}),
    })
    .eq("id", req.animal_id);
  if (animalError) throw new Error(animalError.message);

  const { error: resError } = await supabase
    .from("reservations")
    .update({
      belongings,
      ...(belongingsPhotoUrl ? { belongings_photo_url: belongingsPhotoUrl } : {}),
    })
    .eq("id", req.reservation_id);
  if (resError) throw new Error(resError.message);

  await supabase.from("reservation_history").insert({
    reservation_id: req.reservation_id,
    action: "precheckin_submitted",
    details: belongings
      ? `Belongings: ${belongings}${belongingsPhotoUrl ? " (photo attached)" : ""}`
      : "Pre-check-in submitted",
    performed_by: changedBy,
  });

  await supabase
    .from("precheckin_requests")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", req.id);

  revalidatePath(`/animals/${req.animal_id}`);
  revalidatePath(`/reservations/${req.reservation_id}`);
}
