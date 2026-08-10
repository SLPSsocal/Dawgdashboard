"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

function refresh() {
  revalidatePath("/facility-calendar");
  revalidatePath("/lodging/calendar");
}

/**
 * Blocks a specialist for a window. "All day" comes through as 00:00–23:59 on
 * the chosen date; multi-day is start date + end date.
 */
export async function createSpecialistBlock(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const specialistId = String(formData.get("specialist_id") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || startDate;
  const allDay = formData.get("all_day") === "on";
  const startTime = String(formData.get("start_time") ?? "") || "00:00";
  const endTime = String(formData.get("end_time") ?? "") || "23:59";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/facility-calendar");

  if (!specialistId || !startDate) redirect(returnTo);

  const startAt = allDay ? `${startDate}T00:00:00` : `${startDate}T${startTime}:00`;
  const endAt = allDay ? `${endDate}T23:59:59` : `${endDate}T${endTime}:00`;

  const supabase = createClient();
  const { error } = await supabase.from("availability_blocks").insert({
    facility_id: session.facilityId,
    block_type: "specialist",
    specialist_id: specialistId,
    start_at: startAt,
    end_at: endAt,
    reason,
    created_by: session.staffName,
  });
  if (error) throw new Error(error.message);
  refresh();
  redirect(returnTo);
}

/** Blocks a suite/kennel for a date range (checkout-style: end date exclusive not needed — we store end-of-day). */
export async function createLodgingBlock(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const lodgingAreaId = String(formData.get("lodging_area_id") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || startDate;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/lodging/calendar");

  if (!lodgingAreaId || !startDate) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase.from("availability_blocks").insert({
    facility_id: session.facilityId,
    block_type: "lodging",
    lodging_area_id: lodgingAreaId,
    start_at: `${startDate}T00:00:00`,
    end_at: `${endDate}T23:59:59`,
    reason,
    created_by: session.staffName,
  });
  if (error) throw new Error(error.message);
  refresh();
  redirect(returnTo);
}

export async function deleteAvailabilityBlock(blockId: string) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { error } = await supabase.from("availability_blocks").delete().eq("id", blockId);
  if (error) throw new Error(error.message);
  refresh();
}

/** Blocks overlapping a window, for booking-time warnings. */
export async function getBlocksForWindow(
  facilityId: string,
  startISO: string,
  endISO: string,
  opts: { specialistId?: string; lodgingAreaId?: string }
) {
  const supabase = createClient();
  let q = supabase
    .from("availability_blocks")
    .select("id, block_type, specialist_id, lodging_area_id, start_at, end_at, reason")
    .eq("facility_id", facilityId)
    .lt("start_at", endISO)
    .gt("end_at", startISO);
  if (opts.specialistId) q = q.eq("specialist_id", opts.specialistId);
  if (opts.lodgingAreaId) q = q.eq("lodging_area_id", opts.lodgingAreaId);
  const { data } = await q;
  return data ?? [];
}
