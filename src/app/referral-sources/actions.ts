"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/referral-sources");
  revalidatePath("/parents/new");
}

export async function addReferralSource(formData: FormData) {
  const supabase = createClient();
  const facility_id = String(formData.get("facility_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!facility_id || !name) return;

  const { error } = await supabase.from("referral_sources").insert({ facility_id, name });
  if (error) throw new Error(error.message);
  refresh();
}

export async function renameReferralSource(id: string, formData: FormData) {
  const supabase = createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/referral-sources");

  const { error } = await supabase.from("referral_sources").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
  // Drop the ?edit= param so the row leaves edit mode after saving.
  redirect("/referral-sources");
}

// Soft toggle only — same reasoning as pricing rules: a disabled source
// should disappear from new bookings without breaking historical parent
// records that already reference it by name (referral_source on parents is
// just a stored text value, not a foreign key, so old records are
// unaffected either way).
export async function setReferralSourceActive(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("referral_sources").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
