"use server";

// Groomer weekly schedules + "open a day off" overrides (Alan's ticket:
// "if a groomer normally has a day off but wants to come in and work that
// day, we'd like to be able to easily open that specific date for them").

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/facility-calendar");
}

/** Set which weekdays (0=Sun..6=Sat) a specialist normally works. Empty
 *  selection stores NULL = "works every day" (the pre-schedule behavior). */
export async function setSpecialistWorkDays(staffId: string, formData: FormData) {
  const supabase = createClient();
  const days = formData
    .getAll("work_day")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const everyDay = formData.get("every_day") === "on";
  const work_days = everyDay || days.length === 0 ? null : days;
  const { error } = await supabase.from("staff").update({ work_days }).eq("id", staffId);
  if (error) throw new Error(error.message);
  refresh();
}

/** Open a specific date for a specialist who's normally off that weekday —
 *  they become visible/bookable on the facility calendar for that day only. */
export async function openSpecialistDay(
  facilityId: string,
  staffId: string,
  date: string,
  performedBy?: string | null
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("specialist_day_overrides")
    .upsert(
      { facility_id: facilityId, staff_id: staffId, date, created_by: performedBy ?? null },
      { onConflict: "staff_id,date" }
    );
  if (error) throw new Error(error.message);
  refresh();
}

/** Undo an "open this day" override (back to their normal day off). */
export async function revokeSpecialistDay(overrideId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("specialist_day_overrides").delete().eq("id", overrideId);
  if (error) throw new Error(error.message);
  refresh();
}
