"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { setOwnerUnlocked } from "@/lib/ownerGate";

export async function unlockOwnerView(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const pin = String(formData.get("pin") ?? "").trim();
  const supabase = createClient();
  const { data: owner } = await supabase
    .from("staff")
    .select("id, pin")
    .eq("facility_id", session!.facilityId)
    .eq("role", "owner")
    .eq("active", true)
    .maybeSingle();

  if (!owner || !pin || owner.pin !== pin) {
    redirect("/grooming-commission?error=invalid");
  }

  await setOwnerUnlocked(session!.facilityId);
  redirect("/grooming-commission");
}

const BUCKETS = ["bath", "haircut", "a_la_carte"] as const;

// Single form covering every groomer x bucket combo submits all at once —
// simpler than a save button per row, and this table is small (a handful of
// groomers x 3 buckets).
export async function saveCommissionRates(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const staffIds = new Set<string>();
  for (const key of formData.keys()) {
    const match = key.match(/^rate__(.+)__(bath|haircut|a_la_carte)$/);
    if (match) staffIds.add(match[1]);
  }

  const rows = Array.from(staffIds).flatMap((staffId) =>
    BUCKETS.map((bucket) => {
      const raw = formData.get(`rate__${staffId}__${bucket}`);
      const value = raw === null || raw === "" ? 0 : Number(raw);
      return { staff_id: staffId, service_bucket: bucket, split_percent: value };
    })
  );

  if (rows.length > 0) {
    const supabase = createClient();
    const { error } = await supabase
      .from("groomer_commission_rates")
      .upsert(rows, { onConflict: "staff_id,service_bucket" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/grooming-commission");
}
