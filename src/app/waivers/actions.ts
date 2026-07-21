"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendQuoSms } from "@/lib/quo";

export async function createWaiver(facilityId: string, formData: FormData) {
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim();
  const body_html = String(formData.get("body_html") ?? "").trim();

  if (!title || !body_html) redirect("/waivers?error=missing");

  const { error } = await supabase.from("waivers").insert({ facility_id: facilityId, title, body_html });
  if (error) redirect(`/waivers?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/waivers");
}

export async function retireWaiver(waiverId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("waivers").update({ active: false }).eq("id", waiverId);
  if (error) throw new Error(error.message);
  revalidatePath("/waivers");
}

export async function reactivateWaiver(waiverId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("waivers").update({ active: true }).eq("id", waiverId);
  if (error) throw new Error(error.message);
  revalidatePath("/waivers");
}

// Creates a signing request (unique token) for a parent and tries to text
// it from the facility's own Quo number. If Quo isn't connected yet for
// this facility, the link is still created — the caller gets it back so
// staff can copy/send it manually in the meantime.
export async function createAndSendSigningLink(
  waiverId: string,
  facilityId: string,
  parentId: string,
  signerName: string,
  phone: string | null
) {
  const supabase = createClient();
  const token = crypto.randomUUID();

  const { data: sig, error } = await supabase
    .from("waiver_signatures")
    .insert({
      waiver_id: waiverId,
      facility_id: facilityId,
      parent_id: parentId,
      signer_name: signerName,
      token,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !sig) throw new Error(error?.message ?? "Failed to create signing link");

  const h = await headers();
  const origin = `https://${h.get("host")}`;
  const url = `${origin}/sign/${token}`;

  let sendResult: { sent: boolean; reason?: string } = { sent: false, reason: "No phone number on file" };
  if (phone) {
    sendResult = await sendQuoSms(facilityId, phone, `Please review and sign our waiver: ${url}`);
  }

  await supabase
    .from("waiver_signatures")
    .update({
      status: sendResult.sent ? "sent" : "pending",
      sent_at: sendResult.sent ? new Date().toISOString() : null,
      sent_to_phone: phone,
    })
    .eq("id", sig.id);

  revalidatePath(`/parents/${parentId}`);
  return { url, sent: sendResult.sent, reason: sendResult.reason };
}
