"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createLodgingArea(formData: FormData) {
  const supabase = createClient();
  const facilityId = String(formData.get("facility_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const areaType = String(formData.get("area_type") ?? "kennel");
  const capacity = Number(formData.get("capacity") ?? 1);

  if (!facilityId || !name) return;

  const { error } = await supabase
    .from("lodging_areas")
    .insert({ facility_id: facilityId, name, area_type: areaType, capacity });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/lodging/calendar");
}

// Moves a reservation to a different (or no) lodging area — e.g. "Suite 8"
// becomes "Suite 9" on the board, and that's the same value the check-in
// board reads for that reservation.
export async function assignLodging(reservationId: string, lodgingAreaId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ lodging_area_id: lodgingAreaId })
    .eq("id", reservationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/lodging");
  revalidatePath("/lodging/calendar");
  revalidatePath("/reservations");
}

// Suite camera link (Staff, Sep 4): an optional live-camera URL per lodging
// area, so the board and lodging calendar can open that suite's camera.
export async function setLodgingCameraUrl(formData: FormData) {
  const supabase = createClient();
  const areaId = String(formData.get("area_id") ?? "");
  const raw = String(formData.get("camera_url") ?? "").trim();
  if (!areaId) return;
  let cameraUrl: string | null = null;
  if (raw) {
    // Only http(s) links — never javascript: or anything else clickable.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol === "http:" || u.protocol === "https:") cameraUrl = u.toString();
    } catch {
      cameraUrl = null;
    }
  }
  const { error } = await supabase.from("lodging_areas").update({ camera_url: cameraUrl }).eq("id", areaId);
  if (error) throw new Error(error.message);
  revalidatePath("/lodging/calendar");
  revalidatePath("/reservations");
}
