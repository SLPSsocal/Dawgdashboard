"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Redeem one day from a carried-over Gingr package (staff clicks "Use 1 day"
// on the parent profile when the visit is covered by the package instead of
// being billed). Floors at zero; never deletes the row, so history stays.
export async function usePackageDay(packageId: string, parentId: string) {
  const supabase = createClient();
  const { data: pk } = await supabase.from("package_credits").select("remaining").eq("id", packageId).maybeSingle();
  if (!pk || pk.remaining <= 0) return;
  const { error } = await supabase
    .from("package_credits")
    .update({ remaining: pk.remaining - 1 })
    .eq("id", packageId);
  if (error) throw new Error(error.message);
  revalidatePath(`/parents/${parentId}`);
}
