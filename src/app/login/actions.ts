"use server";

import { createClient } from "@/lib/supabase/server";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function loginWithPin(formData: FormData) {
  const facilityId = String(formData.get("facilityId") ?? "");
  const facilitySlug = String(formData.get("facilitySlug") ?? "");
  const facilityName = String(formData.get("facilityName") ?? "");
  const staffName = String(formData.get("staffName") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!facilityId || !staffName || !pin) {
    redirect(`/login?facility=${facilitySlug}&error=missing`);
  }

  const supabase = createClient();
  const { data: staff, error } = await supabase
    .from("staff")
    .select("id, full_name, pin, active, facility_id")
    .eq("facility_id", facilityId)
    .ilike("full_name", staffName)
    .eq("active", true)
    .maybeSingle();

  if (error || !staff || staff.pin !== pin) {
    redirect(`/login?facility=${facilitySlug}&error=invalid`);
  }

  await setSession({
    staffId: staff!.id,
    staffName: staff!.full_name,
    facilityId,
    facilitySlug,
    facilityName,
  });

  redirect("/reservations");
}
