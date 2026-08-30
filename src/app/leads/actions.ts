"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = ["new", "contacted", "converted", "closed"] as const;

// Move a lead through the pipeline (new → contacted → converted/closed).
export async function updateLeadStatus(leadId: string, status: string) {
  if (!ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    throw new Error("Unknown lead status.");
  }
  const supabase = createClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

// Append/replace the follow-up note on a lead.
export async function updateLeadNotes(leadId: string, notes: string) {
  const supabase = createClient();
  const { error } = await supabase.from("leads").update({ notes: notes || null }).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}
